import { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { updateUserProfile, uploadProfilePhoto } from '@solotravelsoul/firebase';
import type { UserProfile } from '@solotravelsoul/shared';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';

export function useProfile() {
  const { user, profile, setProfile } = useAuthStore(
    useShallow((s) => ({ user: s.user, profile: s.profile, setProfile: s.setProfile }))
  );
  const addToast = useUIStore((s) => s.addToast);

  const updateProfile = useCallback(
    async (updates: Partial<Omit<UserProfile, 'id' | 'createdAt'>>) => {
      if (!user) return;
      try {
        await updateUserProfile(user.uid, updates);
        if (profile) setProfile({ ...profile, ...updates });
        addToast('Profile updated.', 'success');
      } catch {
        addToast('Could not update profile.', 'error');
      }
    },
    [user, profile, setProfile, addToast]
  );

  const updateAvatar = useCallback(
    async (blob: Blob) => {
      if (!user) return;
      try {
        const url = await uploadProfilePhoto(user.uid, blob);
        await updateUserProfile(user.uid, { photoURL: url });
        if (profile) setProfile({ ...profile, photoURL: url });
        addToast('Photo updated.', 'success');
      } catch {
        addToast('Could not upload photo.', 'error');
      }
    },
    [user, profile, setProfile, addToast]
  );

  return { profile, updateProfile, updateAvatar };
}
