import { Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { useAuthStore } from '@/stores/authStore';
import { Colors } from '@/constants/theme';

export default function Index() {
  const { user, initialized } = useAuthStore(
    useShallow((s) => ({ user: s.user, initialized: s.initialized }))
  );

  if (!initialized) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return user ? (
    <Redirect href="/(app)/home" />
  ) : (
    <Redirect href="/(auth)/login" />
  );
}
