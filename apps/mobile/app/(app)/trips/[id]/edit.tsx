import { useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  TextInput,
  Alert,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Input, Button, DatePicker } from '@/components/ui';
import { TagInput } from '@/components/ui/TagInput';
import { useTripStore } from '@/stores/tripStore';
import { useTrips } from '@/hooks/useTrips';
import { useAuthStore } from '@/stores/authStore';
import { setTripVisibility, addFeedItem } from '@solotravelsoul/firebase';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/constants/theme';

export default function EditTripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const trip = useTripStore((s) => s.trips.find((t) => t.id === id));
  const { updateTrip, loading } = useTrips();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);

  const [destination, setDestination] = useState(trip?.destination ?? '');
  const [startDate, setStartDate] = useState<Date>(trip?.startDate ?? new Date());
  const [endDate, setEndDate] = useState<Date>(trip?.endDate ?? new Date());
  const [notes, setNotes] = useState(trip?.notes ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Visibility fields
  const [isPublic, setIsPublic] = useState((trip?.visibility ?? 'private') === 'public');
  const [description, setDescription] = useState(trip?.description ?? '');
  const [tags, setTags] = useState<string[]>(trip?.tags ?? []);
  const [maxMembersStr, setMaxMembersStr] = useState(
    trip?.maxMembers != null ? String(trip.maxMembers) : ''
  );
  const [isAccepting, setIsAccepting] = useState(trip?.isAcceptingMembers ?? true);
  const [visibilitySaving, setVisibilitySaving] = useState(false);

  if (!trip) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Text variant="caption" center>Trip not found.</Text>
      </SafeAreaView>
    );
  }

  const validate = () => {
    const e: Record<string, string> = {};
    if (!destination.trim()) e.destination = 'Enter a destination.';
    if (endDate < startDate) e.endDate = 'End date must be on or after start date.';
    if (isPublic && !description.trim()) e.description = 'Add a public description for this trip.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate() || !user) return;
    const maxMembers = maxMembersStr.trim() ? parseInt(maxMembersStr, 10) : null;

    try {
      await updateTrip(trip.id, {
        destination: destination.trim(),
        startDate,
        endDate,
        notes: notes.trim(),
      });
    } catch {
      Alert.alert('Save failed', 'Could not save trip details. Please try again.');
      return;
    }

    if (visibilitySaving) return;
    setVisibilitySaving(true);
    let visibilityOk = true;
    try {
      const wasPublic = trip.visibility === 'public';
      const newVisibility = isPublic ? 'public' : 'private';

      await setTripVisibility(user.uid, trip.id, newVisibility, isPublic ? {
        title: destination.trim(),
        destination: destination.trim(),
        startDate,
        endDate,
        description: description.trim(),
        tags,
        maxMembers: isNaN(maxMembers as number) ? null : maxMembers,
        isAcceptingMembers: isAccepting,
        coverPhotoURL: trip.coverPhotoURL,
        ownerName: profile?.name ?? '',
        ownerPhotoURL: profile?.photoURL ?? null,
        memberCount: trip.memberCount ?? 1,
      } : undefined);

      if (isPublic && !wasPublic && profile?.profileVisibility === 'public') {
        await addFeedItem(
          user.uid,
          profile.name,
          profile.photoURL ?? null,
          'trip_created',
          trip.id,
          'trip',
          destination.trim(),
          destination.trim()
        ).catch(() => {});
      }
    } catch {
      visibilityOk = false;
      Alert.alert('Visibility update failed', 'Trip details saved. Try updating visibility again.');
    } finally {
      setVisibilitySaving(false);
    }

    if (visibilityOk) router.back();
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Edit Trip</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionLabel}>TRIP DETAILS</Text>
        <View style={styles.card}>
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
            onChange={(d) => { setStartDate(d); if (d > endDate) setEndDate(d); }}
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
            style={{ minHeight: 80, textAlignVertical: 'top' }}
          />
        </View>

        <Text style={styles.sectionLabel}>VISIBILITY</Text>
        <View style={styles.card}>
          <View style={styles.visibilityRow}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconBox, { backgroundColor: isPublic ? Colors.primary + '15' : Colors.chipBackground }]}>
                <Ionicons
                  name={isPublic ? 'globe-outline' : 'lock-closed-outline'}
                  size={18}
                  color={isPublic ? Colors.primary : Colors.textSecondary}
                />
              </View>
              <View>
                <Text style={styles.rowTitle}>{isPublic ? 'Public' : 'Private'}</Text>
                <Text style={styles.rowSubtitle}>
                  {isPublic ? 'Anyone can discover and request to join' : 'Only you can see this trip'}
                </Text>
              </View>
            </View>
            <Switch
              value={isPublic}
              onValueChange={setIsPublic}
              trackColor={{ false: Colors.border, true: Colors.primary }}
              thumbColor={Colors.white}
            />
          </View>

          {isPublic && (
            <View style={styles.publicFields}>
              <View style={styles.divider} />
              <Text style={styles.fieldLabel}>Description (shown in discover)</Text>
              <TextInput
                style={[styles.descInput, errors.description ? { borderColor: Colors.error } : {}]}
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={3}
                placeholder="Tell travelers what this trip is about…"
                placeholderTextColor={Colors.placeholder}
                textAlignVertical="top"
              />
              {errors.description ? <Text style={styles.errorText}>{errors.description}</Text> : null}

              <Text style={styles.fieldLabel}>Tags (up to 5)</Text>
              <TagInput tags={tags} onChange={setTags} maxTags={5} placeholder="beach, budget, Asia…" />

              <Text style={styles.fieldLabel}>Max members (leave blank for no limit)</Text>
              <Input
                value={maxMembersStr}
                onChangeText={setMaxMembersStr}
                keyboardType="numeric"
                placeholder="e.g. 8"
              />

              <View style={styles.acceptingRow}>
                <Text style={styles.rowTitle}>Accepting join requests</Text>
                <Switch
                  value={isAccepting}
                  onValueChange={setIsAccepting}
                  trackColor={{ false: Colors.border, true: Colors.primary }}
                  thumbColor={Colors.white}
                />
              </View>
            </View>
          )}
        </View>

        {/* Manage join requests shortcut */}
        {trip.visibility === 'public' && (
          <>
            <Text style={styles.sectionLabel}>JOIN REQUESTS</Text>
            <TouchableOpacity
              style={styles.card}
              onPress={() => router.push(`/(app)/trips/${trip.id}/requests` as never)}
              activeOpacity={0.7}
            >
              <View style={styles.visibilityRow}>
                <View style={styles.rowLeft}>
                  <View style={[styles.iconBox, { backgroundColor: Colors.accent + '15' }]}>
                    <Ionicons name="people-outline" size={18} color={Colors.accent} />
                  </View>
                  <Text style={styles.rowTitle}>Manage Requests</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={Colors.placeholder} />
              </View>
            </TouchableOpacity>
          </>
        )}

        <View style={styles.saveRow}>
          <Button label="Save changes" onPress={handleSave} loading={loading || visibilitySaving} fullWidth size="lg" />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  navBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  navTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  content: { padding: Spacing.lg, paddingBottom: Spacing['3xl'] },
  sectionLabel: {
    fontSize: 11,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
    letterSpacing: 0.7,
    marginBottom: Spacing.sm,
    marginTop: Spacing.xl,
    marginLeft: 2,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  visibilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  rowLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  iconBox: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  rowSubtitle: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 1 },
  publicFields: { padding: Spacing.lg, gap: Spacing.md },
  divider: { height: 1, backgroundColor: Colors.border, marginBottom: Spacing.md },
  fieldLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textSecondary },
  descInput: {
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    backgroundColor: Colors.background,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  errorText: { fontSize: FontSize.sm, color: Colors.error },
  acceptingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: Spacing.sm },
  saveRow: { marginTop: Spacing.xl },
});
