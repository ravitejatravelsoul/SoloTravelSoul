import { Stack } from 'expo-router';
import { Colors } from '@/constants/theme';

export default function GroupsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.background } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="new" options={{ presentation: 'modal' }} />
      <Stack.Screen name="[groupId]/index" />
      <Stack.Screen name="[groupId]/chat" />
    </Stack>
  );
}
