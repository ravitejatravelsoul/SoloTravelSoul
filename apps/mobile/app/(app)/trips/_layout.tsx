import { Stack } from 'expo-router';
import { Colors } from '@/constants/theme';

// Stack navigator for the trips feature — handles trip detail, edit,
// itinerary, and journal screens as a nested stack on top of the tab.
// Forms that hold typed input are closed with their own Close/Cancel button: on iPhone a swipe-down on a modal would
// otherwise throw the input away without asking.
export default function TripsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.background } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="create" options={{ presentation: 'modal', gestureEnabled: false }} />
      <Stack.Screen name="[id]/index" />
      <Stack.Screen name="[id]/edit" options={{ presentation: 'modal', gestureEnabled: false }} />
      <Stack.Screen name="[id]/itinerary/index" />
      <Stack.Screen name="[id]/itinerary/[dayId]" />
      <Stack.Screen name="[id]/journal/index" />
      <Stack.Screen name="[id]/requests" />
    </Stack>
  );
}
