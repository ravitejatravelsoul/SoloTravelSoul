import { useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Text, Input, Button, DatePicker } from '@/components/ui';
import { useTrips } from '@/hooks/useTrips';
import { Colors, Spacing } from '@/constants/theme';

const today = new Date();
today.setHours(0, 0, 0, 0);

export default function CreateTripScreen() {
  const { createTrip, loading } = useTrips();

  const [destination, setDestination] = useState('');
  const [startDate, setStartDate] = useState<Date>(today);
  const [endDate, setEndDate] = useState<Date>(today);
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!destination.trim()) e.destination = 'Enter a destination.';
    if (endDate < startDate) e.endDate = 'End date must be on or after start date.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleCreate = async () => {
    if (!validate()) return;
    const id = await createTrip({
      destination: destination.trim(),
      startDate,
      endDate,
      notes: notes.trim(),
      coverPhotoURL: null,
    });
    if (id) router.replace(`/(app)/trips/${id}`);
  };

  return (
    <Screen scroll padded>
      <View style={styles.nav}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text variant="h3">New Trip</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.form}>
        <Input
          label="Destination"
          value={destination}
          onChangeText={setDestination}
          autoCapitalize="words"
          placeholder="e.g. Tokyo, Japan"
          error={errors.destination}
        />

        <DatePicker
          label="Start date"
          value={startDate}
          onChange={(d) => {
            setStartDate(d);
            if (d > endDate) setEndDate(d);
          }}
          minimumDate={today}
        />

        <DatePicker
          label="End date"
          value={endDate}
          onChange={setEndDate}
          minimumDate={startDate}
          error={errors.endDate}
        />

        <Input
          label="Notes (optional)"
          value={notes}
          onChangeText={setNotes}
          placeholder="Things to remember, budget, ideas…"
          multiline
          numberOfLines={4}
          style={{ minHeight: 100, textAlignVertical: 'top' }}
        />

        <Button
          label="Create Trip"
          onPress={handleCreate}
          loading={loading}
          fullWidth
          size="lg"
          style={styles.cta}
        />
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
  cta: { marginTop: Spacing.lg },
});
