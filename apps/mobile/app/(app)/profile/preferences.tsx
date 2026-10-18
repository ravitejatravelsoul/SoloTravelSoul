// Optional travel-preference setup: offered after sign-up and to existing users, one
// question per step. Each step saves (partial progress), so leaving and coming back
// resumes where the user stopped. Editing later uses the same fields (Edit Profile).
import { useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Button, ProgressBar } from '@/components/ui';
import { PreferenceField, STEP_TITLES } from '@/components/profile/PreferenceFields';
import { upsertPublicProfile } from '@solotravelsoul/firebase';
import {
  PREFERENCE_STEPS, preferencesOf, sanitizePreferences, resumeStep, progressAt, finishedProgress, isDiscoverable,
} from '@solotravelsoul/shared';
import type { PreferenceStep, TravelPreferences, UserProfile } from '@solotravelsoul/shared';
import { useAuthStore } from '@/stores/authStore';
import { useTripStore } from '@/stores/tripStore';
import { useUIStore } from '@/stores/uiStore';
import { saveProfileWithDiscovery } from '@/utils/discovery';
import { Colors, Spacing, FontSize, FontWeight } from '@/constants/theme';

const STEP_FIELDS: Record<PreferenceStep, (keyof TravelPreferences)[]> = {
  styles: ['travelStyles'], interests: ['interests'], languages: ['languages'], pace: ['travelPace'],
  schedule: ['travelSchedule'], groupSize: ['groupSizePreference'], sharing: ['shareCompatibility'],
};
const PUBLIC_STEPS: PreferenceStep[] = ['styles', 'interests', 'languages', 'sharing'];

export default function PreferenceSetupScreen() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const setProfile = useAuthStore((s) => s.setProfile);
  const trips = useTripStore((s) => s.trips);
  const addToast = useUIStore((s) => s.addToast);

  const [step, setStep] = useState(() => resumeStep(profile?.preferenceSetup));
  const [value, setValue] = useState<TravelPreferences>(() => preferencesOf(profile));
  const [saving, setSaving] = useState(false);

  const stepId = PREFERENCE_STEPS[step];
  const last = step === PREFERENCE_STEPS.length - 1;
  const leave = () => {
    if (from === 'signup' || !router.canGoBack()) router.replace('/(app)/home');
    else router.back();
  };

  /** Saves the given step's answers (or none) plus progress; refreshes public data when needed. */
  const save = async (fields: Partial<TravelPreferences>, progress: UserProfile['preferenceSetup'], publicChange: boolean) => {
    if (!user || !profile) return false;
    setSaving(true);
    try {
      const clean = sanitizePreferences({ ...preferencesOf(profile), ...fields });
      const patch: Partial<UserProfile> = { preferenceSetup: progress };
      for (const k of Object.keys(fields) as (keyof TravelPreferences)[]) (patch as Record<string, unknown>)[k] = clean[k];
      // Profile and discovery record change together (withdrawing consent removes shared answers).
      const next = await saveProfileWithDiscovery(user.uid, profile, patch, trips);
      if (useAuthStore.getState().user?.uid === user.uid) setProfile(next);
      if (publicChange && next.profileVisibility === 'public') await upsertPublicProfile(user.uid, next);
      return true;
    } catch {
      addToast('Could not save. Check your connection and try again.', 'error');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const fieldsOf = (id: PreferenceStep) => Object.fromEntries(STEP_FIELDS[id].map((k) => [k, value[k]])) as Partial<TravelPreferences>;

  const handleNext = async () => {
    const now = Date.now();
    const ok = await save(fieldsOf(stepId), last ? finishedProgress('completed', now) : progressAt(step + 1, now), PUBLIC_STEPS.includes(stepId));
    if (!ok) return;
    if (last) { addToast('Travel preferences saved.', 'success'); leave(); } else setStep(step + 1);
  };

  /** Skip this question: keep what was saved before, move on. */
  const handleSkipQuestion = async () => {
    const saved = preferencesOf(profile);
    setValue((v) => ({ ...v, ...Object.fromEntries(STEP_FIELDS[stepId].map((k) => [k, saved[k]])) }));
    const now = Date.now();
    const ok = await save({}, last ? finishedProgress('completed', now) : progressAt(step + 1, now), false);
    if (!ok) return;
    if (last) leave(); else setStep(step + 1);
  };

  /** Skip the whole setup; a completed setup stays completed. */
  const handleSkipSetup = async () => {
    const done = profile?.preferenceSetup?.status === 'completed';
    const ok = await save({}, done ? profile!.preferenceSetup : finishedProgress('skipped', Date.now()), false);
    if (ok) leave();
  };

  const handleBack = () => (step > 0 ? setStep(step - 1) : leave());

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.navBar}>
        <TouchableOpacity onPress={handleBack} hitSlop={12} accessibilityLabel="Back" accessibilityRole="button">
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Travel preferences</Text>
        <TouchableOpacity onPress={handleSkipQuestion} disabled={saving} hitSlop={12} accessibilityRole="button" accessibilityLabel="Skip this question">
          <Text style={styles.skip}>Skip</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.progress}>
        <Text style={styles.progressLabel}>Step {step + 1} of {PREFERENCE_STEPS.length} · optional</Text>
        <ProgressBar progress={(step + 1) / PREFERENCE_STEPS.length} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{STEP_TITLES[stepId].title}</Text>
        <Text style={styles.hint}>{STEP_TITLES[stepId].hint}</Text>
        <PreferenceField step={stepId} value={value} onChange={setValue} discoverable={isDiscoverable(profile)} />
      </ScrollView>
      <View style={styles.footer}>
        <Button label={last ? 'Finish' : 'Next'} onPress={handleNext} loading={saving} fullWidth size="lg" />
        <TouchableOpacity onPress={handleSkipSetup} disabled={saving} style={styles.later} accessibilityRole="button">
          <Text style={styles.laterLabel}>Skip setup for now</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  navBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  navTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  skip: { fontSize: FontSize.md, color: Colors.primary, fontWeight: FontWeight.semibold },
  progress: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, gap: Spacing.xs },
  progressLabel: { fontSize: FontSize.sm, color: Colors.textSecondary },
  content: { padding: Spacing.lg, gap: Spacing.md },
  title: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  hint: { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: Spacing.sm },
  footer: { padding: Spacing.lg, gap: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.surface },
  later: { alignItems: 'center', paddingVertical: Spacing.sm },
  laterLabel: { fontSize: FontSize.sm, color: Colors.textSecondary },
});
