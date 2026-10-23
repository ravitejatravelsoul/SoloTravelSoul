import { Stack } from 'expo-router';
import { Colors } from '@/constants/theme';

export default function DiscoverLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.background } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="trips/index" />
      <Stack.Screen name="trips/[tripId]" />
    </Stack>
  );
}
