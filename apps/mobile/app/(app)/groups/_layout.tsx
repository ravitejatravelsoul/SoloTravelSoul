import { Stack } from 'expo-router';
import { Colors } from '@/constants/theme';

// Forms that hold typed input are closed with their own Close/Cancel button: on iPhone a swipe-down on a modal would
// otherwise throw the input away without asking.
export default function GroupsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.background } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="new" options={{ presentation: 'modal', gestureEnabled: false }} />
      <Stack.Screen name="[groupId]/index" />
      <Stack.Screen name="[groupId]/chat" />
    </Stack>
  );
}
