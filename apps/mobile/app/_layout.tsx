import { useEffect } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import { subscribeToAuthState, getUserProfile, isFirebaseConfigured } from '@solotravelsoul/firebase';
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

    const unsub = subscribeToAuthState(async (user) => {
      setUser(user);
      if (user) {
        try {
          const profile = await getUserProfile(user.uid);
          setProfile(profile);
        } catch {
          // Firestore offline at startup — user is still authenticated.
          // Profile will be null until next foreground event or app restart.
          setProfile(null);
        }
      } else {
        setProfile(null);
      }
      setInitialized(true);
      SplashScreen.hideAsync();
    });
    return unsub;
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
