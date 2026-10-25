import { Stack } from 'expo-router';
import { Colors } from '@/constants/theme';

// Forms that hold typed input are closed with their own Close/Cancel button: on iPhone a swipe-down on a modal would
// otherwise throw the input away without asking.
export default function CommunityLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.background } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="report" options={{ presentation: 'modal' }} />
      <Stack.Screen name="profile/[uid]" />
      <Stack.Screen name="groups/index" />
      <Stack.Screen name="groups/create" options={{ presentation: 'modal', gestureEnabled: false }} />
      <Stack.Screen name="groups/[groupId]" />
      <Stack.Screen name="groups/[groupId]/requests" />
      <Stack.Screen name="travelers/index" />
      <Stack.Screen name="companions" />
      <Stack.Screen name="feed/index" />
      <Stack.Screen name="my-requests" />
    </Stack>
  );
}
