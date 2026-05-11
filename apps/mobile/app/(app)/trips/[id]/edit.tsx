import { useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Text, Input, Button, DatePicker } from '@/components/ui';
import { useTripStore } from '@/stores/tripStore';
import { useTrips } from '@/hooks/useTrips';
import { Colors, Spacing } from '@/constants/theme';

export default function EditTripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const trip = useTripStore((s) => s.trips.find((t) => t.id === id));
  const { updateTrip, loading } = useTrips();

  const [destination, setDestination] = useState(trip?.destination ?? '');
  const [startDate, setStartDate] = useState<Date>(trip?.startDate ?? new Date());
  const [endDate, setEndDate] = useState<Date>(trip?.endDate ?? new Date());
  const [notes, setNotes] = useState(trip?.notes ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (!trip) {
    return (
      <Screen padded>
        <Text variant="caption" center>Trip not found.</Text>
      </Screen>
    );
  }

  const validate = () => {
    const e: Record<string, string> = {};
    if (!destination.trim()) e.destination = 'Enter a destination.';
    if (endDate < startDate) e.endDate = 'End date must be on or after start date.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    await updateTrip(trip.id, {
      destination: destination.trim(),
      startDate,
      endDate,
      notes: notes.trim(),
    });
    router.back();
  };

  return (
    <Screen scroll padded>
      <View style={styles.nav}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text variant="h3">Edit Trip</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.form}>
        <Input
          label="Destination"
          value={destination}
          onChangeText={setDestination}
          autoCapitalize="words"
          error={errors.destination}
        />

        <DatePicker
          label="Start date"
          value={startDate}
          onChange={(d) => {
            setStartDate(d);
            if (d > endDate) setEndDate(d);
          }}
        />

        <DatePicker
          label="End date"
          value={endDate}
          onChange={setEndDate}
          minimumDate={startDate}
          error={errors.endDate}
        />

        <Input
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={4}
          style={{ minHeight: 100, textAlignVertical: 'top' }}
        />

        <Button label="Save changes" onPress={handleSave} loading={loading} fullWidth size="lg" />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  nav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing['2xl'],
  },
  form: { gap: Spacing.lg },
});
