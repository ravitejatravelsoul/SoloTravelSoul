// The travel-preference questions, shared by the optional setup (one step at a time)
// and Edit Profile (all at once). Values are validated by sanitizePreferences() on save
// and by firestore.rules on write.
import { View, StyleSheet, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text, PressableScale } from '@/components/ui';
import { MultiSelectChips } from '@/components/ui/MultiSelectChips';
import {
  TRAVEL_STYLE_OPTIONS, TRAVEL_STYLE_LABELS, INTEREST_OPTIONS, INTEREST_LABELS, LANGUAGE_OPTIONS,
  PACE_OPTIONS, SCHEDULE_OPTIONS, GROUP_SIZE_OPTIONS,
} from '@solotravelsoul/shared';
import type { PreferenceStep, TravelPreferences, TravelStyle, Interest } from '@solotravelsoul/shared';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

export const STEP_TITLES: Record<PreferenceStep, { title: string; hint: string }> = {
  styles: { title: 'How do you like to travel?', hint: 'Pick any that fit. You can change these later.' },
  interests: { title: 'What do you enjoy on a trip?', hint: 'Shared interests help you find good company.' },
  languages: { title: 'Which languages do you speak?', hint: 'Used to show travelers you can talk with.' },
  pace: { title: 'What pace suits you?', hint: 'Choose one, or skip this question.' },
  schedule: { title: 'Planned or spontaneous?', hint: 'Choose one, or skip this question.' },
  groupSize: { title: 'Preferred group size', hint: 'For trips you join or organize.' },
  sharing: { title: 'Use these answers for matching?', hint: 'You decide what other travelers can see.' },
};

const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

function SingleSelect<T extends string>({ options, value, onChange }: {
  options: readonly { value: T; label: string; description: string }[];
  value: T | null;
  onChange: (v: T | null) => void;
}) {
  return (
    <View style={styles.options} accessibilityRole="radiogroup">
      {options.map((o) => {
        const selected = value === o.value;
        return (
          <PressableScale
            key={o.value}
            style={[styles.option, selected && styles.optionSelected]}
            onPress={() => onChange(selected ? null : o.value)}
            scaleTo={0.98}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={`${o.label}. ${o.description}`}
          >
            <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={24} color={selected ? Colors.primaryDark : Colors.textSecondary} />
            <View style={styles.optionText}>
              <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>{o.label}</Text>
              <Text style={styles.optionDescription}>{o.description}</Text>
            </View>
          </PressableScale>
        );
      })}
    </View>
  );
}

export function PreferenceField({ step, value, onChange, discoverable }: {
  step: PreferenceStep;
  value: TravelPreferences;
  onChange: (next: TravelPreferences) => void;
  /** Whether the user currently appears in traveler discovery (sharing explanation). */
  discoverable?: boolean;
}) {
  const set = (patch: Partial<TravelPreferences>) => onChange({ ...value, ...patch });
  switch (step) {
    case 'styles':
      return <MultiSelectChips options={[...TRAVEL_STYLE_OPTIONS]} selected={value.travelStyles} onToggle={(s: TravelStyle) => set({ travelStyles: toggle(value.travelStyles, s) })} labelMap={TRAVEL_STYLE_LABELS} />;
    case 'interests':
      return <MultiSelectChips options={[...INTEREST_OPTIONS]} selected={value.interests} onToggle={(i: Interest) => set({ interests: toggle(value.interests, i) })} labelMap={INTEREST_LABELS} />;
    case 'languages':
      return <MultiSelectChips options={[...LANGUAGE_OPTIONS]} selected={value.languages} onToggle={(l: string) => set({ languages: toggle(value.languages, l) })} />;
    case 'pace':
      return <SingleSelect options={PACE_OPTIONS} value={value.travelPace} onChange={(v) => set({ travelPace: v })} />;
    case 'schedule':
      return <SingleSelect options={SCHEDULE_OPTIONS} value={value.travelSchedule} onChange={(v) => set({ travelSchedule: v })} />;
    case 'groupSize':
      return <SingleSelect options={GROUP_SIZE_OPTIONS} value={value.groupSizePreference} onChange={(v) => set({ groupSizePreference: v })} />;
    case 'sharing':
      return (
        <View style={styles.sharing}>
          <View style={styles.sharingRow}>
            <Text style={styles.sharingLabel}>Share my pace, schedule and group size with travelers who can find me</Text>
            <Switch
              value={value.shareCompatibility}
              onValueChange={(v) => set({ shareCompatibility: v })}
              trackColor={{ false: Colors.border, true: Colors.primary }}
              thumbColor={Colors.white}
              accessibilityLabel="Share pace, schedule and group size"
            />
          </View>
          <Text style={styles.sharingNote}>
            Off by default. Your answers are always used on your device to explain matches to you. Others see them only if you
            switch this on and you have turned on traveler discovery in Privacy Settings{discoverable === false ? ' (currently off)' : ''}.
            Travel style, interests and languages are part of your public profile. Your exact location, contact details and trip
            itineraries are never shared.
          </Text>
        </View>
      );
  }
}

const styles = StyleSheet.create({
  options: { gap: Spacing.sm },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.lg, minHeight: 64,
    borderRadius: Radius.lg, borderWidth: 2, borderColor: Colors.border, backgroundColor: Colors.surface,
  },
  optionSelected: { borderColor: Colors.primary, backgroundColor: Colors.tealSoft },
  optionText: { flex: 1 },
  optionLabel: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  optionLabelSelected: { color: Colors.primaryDark },
  optionDescription: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  sharing: { gap: Spacing.md },
  sharingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  sharingLabel: { flex: 1, fontSize: FontSize.md, color: Colors.textPrimary, fontWeight: FontWeight.semibold },
  sharingNote: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20 },
});
