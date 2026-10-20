import { useEffect } from 'react';
import { reconcileDiscoveryConsent, subscribeOwnSuspension } from '@solotravelsoul/firebase';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';

/**
 * Keeps "show me in Nearby Travelers" honest. While the account is not suspended, an opt-in with no discovery record
 * behind it (a moderator removed the record while the account was suspended) is switched off and the person is told,
 * rather than the record quietly coming back with an old consent. Runs on start and again the moment a suspension ends.
 */
export function useDiscoveryReconcile(): void {
  const uid = useAuthStore((s) => s.user?.uid);
  const optedIn = useAuthStore((s) => s.profile?.showInNearbyTravelers === true);

  useEffect(() => {
    if (!uid || !optedIn) return;
    return subscribeOwnSuspension(uid, (suspended) => {
      if (suspended) return;
      const profile = useAuthStore.getState().profile;
      if (!profile || useAuthStore.getState().user?.uid !== uid) return;
      reconcileDiscoveryConsent(uid, profile).then((withdrawn) => {
        if (!withdrawn || useAuthStore.getState().user?.uid !== uid) return;
        const latest = useAuthStore.getState().profile;
        if (latest) useAuthStore.getState().setProfile({ ...latest, showInNearbyTravelers: false });
        useUIStore.getState().addToast('You are not shown in Nearby Travelers. That was switched off while your account was suspended. You can turn it back on in Privacy.', 'info');
      });
    });
  }, [uid, optedIn]);
}
