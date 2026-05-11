import { Stack } from 'expo-router';

// Stack navigator for the trips feature — handles trip detail, edit,
// itinerary, and journal screens as a nested stack on top of the tab.
export default function TripsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="create" options={{ presentation: 'modal' }} />
      <Stack.Screen name="[id]/index" />
      <Stack.Screen name="[id]/edit" options={{ presentation: 'modal' }} />
      <Stack.Screen name="[id]/itinerary/index" />
      <Stack.Screen name="[id]/itinerary/[dayId]" />
      <Stack.Screen name="[id]/journal/index" />
    </Stack>
  );
}
