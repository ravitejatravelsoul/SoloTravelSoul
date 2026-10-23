import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useShallow } from 'zustand/react/shallow';
import { useAuthStore } from '@/stores/authStore';
import { Colors } from '@/constants/theme';

/** First-launch introduction is shown once, to people who are signed out and have not seen it. Anything unreadable means "seen". */
function useIntroSeen(needed: boolean): boolean | null {
  const [seen, setSeen] = useState<boolean | null>(null);
  useEffect(() => {
    if (!needed) return;
    let live = true;
    AsyncStorage.getItem('onboarded')
      .then((v) => { if (live) setSeen(v === '1'); })
      .catch(() => { if (live) setSeen(true); });
    return () => { live = false; };
  }, [needed]);
  return seen;
}

export default function Index() {
  const { user, initialized } = useAuthStore(
    useShallow((s) => ({ user: s.user, initialized: s.initialized }))
  );
  const signedOut = initialized && !user;
  const introSeen = useIntroSeen(signedOut);

  // Same ivory as the launch overlay, so the hand-off from the overlay to the first screen has no colour change.
  if (!initialized || (signedOut && introSeen === null)) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (user) return <Redirect href="/(app)/home" />;
  return <Redirect href={introSeen ? '/(auth)/login' : '/(auth)/onboarding'} />;
}
