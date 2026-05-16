import { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { router } from 'expo-router';
import {
  signIn,
  signUp,
  signOut,
  resetPassword,
  deleteCurrentUser,
  createUserProfile,
  upsertUserLookup,
} from '@solotravelsoul/firebase';
import { getUserInitials } from '@solotravelsoul/shared';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';

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
    await signOut();
    router.replace('/(auth)/login');
  }, []);

  const forgotPassword = useCallback(
    async (email: string) => {
      try {
        await resetPassword(email);
        addToast('Password reset email sent.', 'success');
      } catch (err: unknown) {
        const code = (err as { code?: string }).code ?? '';
        addToast(friendlyAuthError(code), 'error');
      }
    },
    [addToast]
  );

  // Re-authenticates then permanently deletes the Firebase account.
  // Returns true on success; shows an error toast and returns false on failure.
  // onAuthStateChanged fires with null after deletion, root layout redirects to login.
  const deleteAccount = useCallback(
    async (password: string): Promise<boolean> => {
      setLoading(true);
      try {
        await deleteCurrentUser(password);
        return true;
      } catch (err: unknown) {
        const code = (err as { code?: string }).code ?? '';
        addToast(
          code === 'auth/wrong-password' || code === 'auth/invalid-credential'
            ? 'Incorrect password. Account was not deleted.'
            : 'Could not delete account. Please try again.',
          'error'
        );
        return false;
      } finally {
        setLoading(false);
      }
    },
    [setLoading, addToast]
  );

  return { user, profile, loading, login, register, logout, forgotPassword, deleteAccount };
}
