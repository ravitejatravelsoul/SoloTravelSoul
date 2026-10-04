import { useEffect } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import { subscribeToAuthState, subscribeToIdToken, getUserProfile, isFirebaseConfigured, upsertUserLookup } from '@solotravelsoul/firebase';
import { getUserInitials } from '@solotravelsoul/shared';
import { useTripStore } from '@/stores/tripStore';
import { useChatStore } from '@/stores/chatStore';
import { useBlockStore } from '@/stores/blockStore';
import { useAuthStore } from '@/stores/authStore';
import { ToastContainer } from '@/components/ui';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { validateEnv } from '@/utils/envCheck';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const { setUser, setProfile, setInitialized } = useAuthStore(
    useShallow((s) => ({
      setUser: s.setUser,
      setProfile: s.setProfile,
      setInitialized: s.setInitialized,
    }))
  );

  useEffect(() => {
    validateEnv(); // dev-only warning, never throws

    if (!isFirebaseConfigured) {
      // No valid Firebase config — skip network subscription and boot to login.
      // The user will see a sign-in error when they attempt login, not a crash.
      setInitialized(true);
      SplashScreen.hideAsync();
      return;
    }

    let active = true;
    let version = 0;
    // Keeps the token used for authorized media requests current (hourly refresh).
    const unsubToken = subscribeToIdToken((token) => { if (active) useAuthStore.getState().setIdToken(token); });
    const unsub = subscribeToAuthState(async (user) => {
      if (!active) return;
      const currentVersion = ++version;
      if (useAuthStore.getState().user?.uid !== user?.uid) {
        useTripStore.getState().reset();
        useChatStore.getState().reset();
        useBlockStore.getState().reset();
      }
      setUser(user);
      if (user) {
        try {
          const profile = await getUserProfile(user.uid);
          if (!active || version !== currentVersion) return;
          if (__DEV__) {
            const photoInfo = profile?.photoURL
              ? 'set → ' + profile.photoURL.slice(0, 60)
              : 'null';
            console.log('[ProfileLoad] uid:', user.uid.slice(0, 8), '| photoURL:', photoInfo);
          }
          setProfile(profile);
          // Existing users populate the exact-email alias on their next sign-in.
          if (profile && user.email) {
            void upsertUserLookup(user.uid, profile.name, user.email, getUserInitials(profile.name), profile.photoURL).catch(() => {});
          }
        } catch {
          // Firestore offline at startup — user is still authenticated.
          // Profile will be null until next foreground event or app restart.
          if (!active || version !== currentVersion) return;
          setProfile(null);
        }
      } else {
        setProfile(null);
      }
      if (!active || version !== currentVersion) return;
      setInitialized(true);
      SplashScreen.hideAsync();
    });
    return () => { active = false; version++; unsub(); unsubToken(); };
  }, []);

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }} />
        <ToastContainer />
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
