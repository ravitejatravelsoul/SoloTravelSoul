import { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Input, Button, DatePicker } from '@/components/ui';
import { TagInput } from '@/components/ui/TagInput';
import { createTravelGroup, addFeedItem } from '@solotravelsoul/firebase';
import { useAuthStore } from '@/stores/authStore';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/constants/theme';

export default function CreateGroupScreen() {
  const profile = useAuthStore((s) => s.profile);
  const user = useAuthStore((s) => s.user);

  const [name, setName] = useState('');
  const [destination, setDestination] = useState('');
  const [description, setDescription] = useState('');
  const [rules, setRules] = useState('');
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [capacity, setCapacity] = useState('10');
  const [tags, setTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Group name is required.';
    if (name.trim().length > 60) e.name = 'Name must be 60 characters or less.';
    if (!destination.trim()) e.destination = 'Destination is required.';
    if (!description.trim()) e.description = 'Description is required.';
    const cap = parseInt(capacity, 10);
    if (isNaN(cap) || cap < 2) e.capacity = 'Capacity must be at least 2.';
    if (cap > 50) e.capacity = 'Capacity cannot exceed 50.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleCreate = async () => {
    if (!validate() || !user || !profile) return;
    setSaving(true);
    try {
      const groupId = await createTravelGroup(
        user.uid,
        profile.name,
        profile.photoURL ?? null,
        {
          name: name.trim(),
          description: description.trim().slice(0, 1000),
          destination: destination.trim(),
          startDate,
          endDate,
          capacity: parseInt(capacity, 10),
          tags,
          rules: rules.trim().slice(0, 500),
        }
      );

      if (profile.profileVisibility === 'public') {
        await addFeedItem(
          user.uid, profile.name, profile.photoURL ?? null,
          'group_created', groupId, 'group', name.trim(), destination.trim()
        ).catch(() => {});
      }

      router.replace(`/(app)/community/groups/${groupId}` as never);
    } catch {
      Alert.alert('Error', 'Could not create group. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Create Group</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionLabel}>BASICS</Text>
        <View style={styles.card}>
          <Input label="Group name *" value={name} onChangeText={setName} placeholder="e.g. Tokyo Spring Wanderers" error={errors.name} maxLength={60} />
          <Input label="Destination *" value={destination} onChangeText={setDestination} autoCapitalize="words" placeholder="e.g. Tokyo, Japan" error={errors.destination} />
          <Input label="Capacity *" value={capacity} onChangeText={setCapacity} keyboardType="numeric" placeholder="10" error={errors.capacity} />
        </View>

        <Text style={styles.sectionLabel}>DATES (optional)</Text>
        <View style={styles.card}>
          <DatePicker label="Start date" value={startDate ?? new Date()} onChange={setStartDate} />
          <DatePicker label="End date" value={endDate ?? new Date()} onChange={setEndDate} minimumDate={startDate ?? undefined} />
        </View>

        <Text style={styles.sectionLabel}>ABOUT</Text>
        <View style={styles.card}>
          <Text style={styles.fieldLabel}>Description *</Text>
          <TextInput
            style={[styles.textArea, errors.description ? { borderColor: Colors.error } : {}]}
            value={description}
            onChangeText={(t) => setDescription(t.slice(0, 1000))}
            multiline
            numberOfLines={5}
            placeholder="Tell potential members what this group is about…"
            placeholderTextColor={Colors.placeholder}
            textAlignVertical="top"
          />
          {errors.description ? <Text style={styles.errorText}>{errors.description}</Text> : null}

          <Text style={styles.fieldLabel}>Community rules (optional)</Text>
          <TextInput
            style={styles.textArea}
            value={rules}
            onChangeText={(t) => setRules(t.slice(0, 500))}
            multiline
            numberOfLines={3}
            placeholder="Any guidelines for group members…"
            placeholderTextColor={Colors.placeholder}
            textAlignVertical="top"
          />

          <Text style={styles.fieldLabel}>Tags (up to 5)</Text>
          <TagInput tags={tags} onChange={setTags} maxTags={5} placeholder="beach, budget…" />
        </View>

        <View style={styles.saveRow}>
          <Button label="Create Group" onPress={handleCreate} loading={saving} fullWidth size="lg" />
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
    padding: Spacing.lg,
    gap: Spacing.md,
    ...Shadow.sm,
  },
  fieldLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textSecondary },
  textArea: {
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    backgroundColor: Colors.background,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  errorText: { fontSize: FontSize.sm, color: Colors.error },
  saveRow: { marginTop: Spacing.xl },
});
