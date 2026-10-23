import { useCallback, useEffect, useState } from 'react';
import { Colors } from '@/constants/theme';
import { useFonts } from 'expo-font';
import { Baloo2_700Bold } from '@expo-google-fonts/baloo-2/700Bold';
import { Baloo2_800ExtraBold } from '@expo-google-fonts/baloo-2/800ExtraBold';
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
import { useFollowStore } from '@/stores/followStore';
import { useAuthStore } from '@/stores/authStore';
import { ToastContainer } from '@/components/ui';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { LaunchOverlay } from '@/components/LaunchOverlay';
import { validateEnv } from '@/utils/envCheck';
import { installFontScaleRelayout } from '@/utils/fontScaleRelayout';

SplashScreen.preventAutoHideAsync();
installFontScaleRelayout();

/** If fonts or the first auth state take longer than this, the launch picture leaves anyway: loading can never trap the user. */
const LAUNCH_FALLBACK_MS = 4000;

export default function RootLayout() {
  const { setUser, setProfile, setInitialized } = useAuthStore(
    useShallow((s) => ({
      setUser: s.setUser,
      setProfile: s.setProfile,
      setInitialized: s.setInitialized,
    }))
  );

  // Launch: the native splash (ivory, logo) hands over to an identical JavaScript picture; that picture leaves as soon as the
  // display fonts and the first auth state are ready, or after a bounded fallback.
  const [fontsLoaded, fontError] = useFonts({ Baloo2_700Bold, Baloo2_800ExtraBold });
  const initialized = useAuthStore((s) => s.initialized);
  const [fallback, setFallback] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setFallback(true), LAUNCH_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, []);
  const launchReady = ((fontsLoaded || !!fontError) && initialized) || fallback;
  const handleOverlayShown = useCallback(() => { SplashScreen.hideAsync().catch(() => {}); }, []);

  useEffect(() => {
    validateEnv(); // dev-only warning, never throws

    if (!isFirebaseConfigured) {
      // No valid Firebase config — skip network subscription and boot to login.
      // The user will see a sign-in error when they attempt login, not a crash.
      setInitialized(true);
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
        useFollowStore.getState().reset();
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
    });
    return () => { active = false; version++; unsub(); unsubToken(); };
  }, []);

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.background } }} />
        <ToastContainer />
        <LaunchOverlay ready={launchReady} onShown={handleOverlayShown} />
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
