import { Stack } from 'expo-router';
import { Colors } from '@/constants/theme';

export default function CommunityLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.background } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="report" options={{ presentation: 'modal' }} />
      <Stack.Screen name="profile/[uid]" />
      <Stack.Screen name="groups/index" />
      <Stack.Screen name="groups/create" options={{ presentation: 'modal' }} />
      <Stack.Screen name="groups/[groupId]" />
      <Stack.Screen name="groups/[groupId]/requests" />
      <Stack.Screen name="travelers/index" />
      <Stack.Screen name="companions" />
      <Stack.Screen name="feed/index" />
      <Stack.Screen name="my-requests" />
    </Stack>
  );
}
