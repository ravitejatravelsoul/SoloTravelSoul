import { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { router } from 'expo-router';
import {
  signIn,
  signUp,
  signOut,
  resetPassword,
  reauthenticate,
  createUserProfile,
  upsertUserLookup,
} from '@solotravelsoul/firebase';
import { getUserInitials } from '@solotravelsoul/shared';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { setSyncPaused } from '@/hooks/useSyncEngine';
import { requestAccountDeletion, clearLocalUserData, type DeletionOutcome, type DeletionProgress } from '@/utils/accountDeletion';

function deletionErrorMessage(code: string): string {
  switch (code) {
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect password. Account was not deleted.';
    case 'auth/requires-recent-login':
      return 'Please enter your password again to confirm.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please try again later.';
    case 'deletion/in-progress':
      return 'Deletion is already in progress. Please try again in a few minutes.';
    case 'deletion/unavailable':
      return 'Account deletion is temporarily unavailable. Contact privacy@solotravelsoul.app.';
    case 'deletion/network':
    case 'auth/network-request-failed':
      return 'Network error. Deletion may already have started — please reconnect and try again to make sure it completes.';
    default:
      return 'Account deletion did not finish. Some of your data may already be deleted and your account is locked against changes. We retry automatically and our team is alerted if it stays stuck; you can also try again now.';
  }
}

function friendlyAuthError(code: string): string {
  switch (code) {
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect email or password.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please try again later.';
    case 'auth/network-request-failed':
      return 'Network error. Please check your connection.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

export function useAuth() {
  const { user, profile, loading, setLoading } = useAuthStore(
    useShallow((s) => ({
      user: s.user,
      profile: s.profile,
      loading: s.loading,
      setLoading: s.setLoading,
    }))
  );
  const addToast = useUIStore((s) => s.addToast);

  const login = useCallback(
    async (email: string, password: string) => {
      setLoading(true);
      try {
        await signIn(email, password);
        router.replace('/(app)/home');
      } catch (err: unknown) {
        const code = (err as { code?: string }).code ?? '';
        addToast(friendlyAuthError(code), 'error');
      } finally {
        setLoading(false);
      }
    },
    [setLoading, addToast]
  );

  const register = useCallback(
    async (email: string, password: string, name: string) => {
      setLoading(true);
      try {
        const firebaseUser = await signUp(email, password);
        await createUserProfile(firebaseUser.uid, { email, name });
        const initials = getUserInitials(name) || name[0]?.toUpperCase() || 'T';
        await upsertUserLookup(firebaseUser.uid, name, email, initials).catch(() => {});
        router.replace('/(app)/home');
      } catch (err: unknown) {
        const code = (err as { code?: string }).code ?? '';
        addToast(friendlyAuthError(code), 'error');
      } finally {
        setLoading(false);
      }
    },
    [setLoading, addToast]
  );

  const logout = useCallback(async () => {
    try {
      await signOut();
      router.replace('/(auth)/login');
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? '';
      addToast(friendlyAuthError(code), 'error');
    }
  }, [addToast]);

  const forgotPassword = useCallback(
    async (email: string): Promise<boolean> => {
      try {
        await resetPassword(email);
        addToast('Password reset email sent.', 'success');
        return true;
      } catch (err: unknown) {
        const code = (err as { code?: string }).code ?? '';
        addToast(friendlyAuthError(code), 'error');
        return false;
      }
    },
    [addToast]
  );

  // Account deletion:
  //   1. reauthenticate — wrong password throws before anything is touched
  //   2. the server (R2 worker, Admin credentials) deletes owned data, social
  //      relationships/counters, media and — only after all of that succeeds —
  //      the Auth identity. Any failure leaves the account intact for a retry.
  //   3. on success, wipe on-device caches/queues/reminders and sign out locally.
  // Offline sync is paused meanwhile so queued edits cannot recreate data.
  const deleteAccount = useCallback(
    async (password: string, onProgress?: (p: DeletionProgress) => void): Promise<boolean> => {
      const uid = user?.uid;
      if (!uid) return false;
      setLoading(true);
      setSyncPaused(uid, true);
      let outcome: DeletionOutcome = 'deleted';
      try {
        await reauthenticate(password);
        outcome = await requestAccountDeletion(onProgress);
      } catch (err: unknown) {
        const code = (err as { code?: string }).code ?? '';
        // A previous attempt finished but its response was lost.
        if (code !== 'auth/user-not-found') {
          setSyncPaused(uid, false);
          setLoading(false);
          addToast(deletionErrorMessage(code), 'error');
          return false;
        }
      }
      await clearLocalUserData(uid).catch(() => {});
      await signOut().catch(() => {});
      setSyncPaused(uid, false);
      setLoading(false);
      addToast(
        outcome === 'deleted'
          ? 'Your account has been deleted.'
          : outcome === 'blocked'
            ? 'Your data has been deleted except older photos stored with a provider we cannot reach right now. Your account stays locked and is removed automatically once they are deleted; contact privacy@solotravelsoul.app with questions.'
            : 'Account deletion has started and continues automatically. Your account is locked meanwhile; contact privacy@solotravelsoul.app if it is not removed.',
        outcome === 'deleted' ? 'success' : 'info'
      );
      router.replace('/(auth)/login');
      return true;
    },
    [setLoading, addToast, user?.uid]
  );

  return { user, profile, loading, login, register, logout, forgotPassword, deleteAccount };
}
