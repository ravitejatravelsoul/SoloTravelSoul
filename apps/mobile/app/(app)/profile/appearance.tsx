import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Redirect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Input, PressableScale, ScreenHeader, Text } from '@/components/ui';
import { ACCENT_PRESETS, createAppTheme, DEFAULT_ACCENT, normalizeAccent } from '@/constants/appearance';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { EDITORIAL_APPEARANCE_ENABLED, useAppearanceStore, useAppTheme } from '@/stores/appearanceStore';
import { useAuthStore } from '@/stores/authStore';

export default function AppearanceScreen() {
  const uid = useAuthStore(state => state.user?.uid ?? '');
  const stored = useAppearanceStore(state => state.accents[uid]);
  const setAccent = useAppearanceStore(state => state.setAccent);
  const resetAccent = useAppearanceStore(state => state.resetAccent);
  const current = normalizeAccent(stored ?? '') ?? DEFAULT_ACCENT;
  const { Colors: palette } = useAppTheme();
  const [custom, setCustom] = useState(current);
  const [error, setError] = useState('');
  const draft = normalizeAccent(custom);
  const { Colors: preview } = createAppTheme(draft ?? current);

  function apply(value: string) {
    const hex = normalizeAccent(value);
    if (!hex) {
      setError('Enter a 3- or 6-digit hex color, such as #6D4DC4.');
      return;
    }
    setAccent(uid, hex);
    setCustom(hex);
    setError('');
  }

  if (!EDITORIAL_APPEARANCE_ENABLED) return <Redirect href="/(app)/profile" />;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScreenHeader title="Appearance" subtitle="Choose your accent color" />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <View style={[styles.preview, { backgroundColor: preview.accentSoft }]}>
          <Text variant="h3" style={{ color: preview.primaryDark }}>Your travel palette</Text>
          <Text>Buttons, links and selected controls use shades of your accent.</Text>
          <View style={[styles.sample, { backgroundColor: preview.primary }]}>
            <Text style={styles.sampleText}>Button preview</Text>
          </View>
        </View>

        <Text variant="h3" accessibilityRole="header">Presets</Text>
        <View style={styles.presets}>
          {ACCENT_PRESETS.map(({ name, hex }) => {
            const selected = current === hex;
            return (
              <PressableScale
                key={hex}
                onPress={() => apply(hex)}
                accessibilityRole="button"
                accessibilityLabel={`${name}, ${hex}`}
                accessibilityState={{ selected }}
                style={[styles.preset, selected && { borderColor: palette.primary }]}
              >
                <View style={[styles.swatch, { backgroundColor: hex }]} />
                <Text style={styles.presetLabel}>{name}</Text>
                {selected && <Ionicons name="checkmark-circle" size={18} color={palette.primaryDark} />}
              </PressableScale>
            );
          })}
        </View>

        <Text variant="h3" accessibilityRole="header">Custom color</Text>
        <Input
          label="Hex color"
          accessibilityLabel="Custom hex color"
          value={custom}
          onChangeText={value => { setCustom(value); setError(''); }}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={7}
          placeholder="#6D4DC4"
          error={error || undefined}
          returnKeyType="done"
          onSubmitEditing={() => apply(custom)}
        />
        <Button label="Apply custom color" onPress={() => apply(custom)} disabled={!uid} />
        <Button label="Reset to indigo" variant="ghost" onPress={() => {
          resetAccent(uid);
          setCustom(DEFAULT_ACCENT);
          setError('');
        }} />
        <Text variant="caption" accessibilityLiveRegion="polite">
          {current} is active. Your selection is saved for this account on this device.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing['3xl'] },
  preview: { padding: Spacing.xl, borderRadius: Radius.xl, gap: Spacing.sm },
  sample: { alignSelf: 'flex-start', borderRadius: Radius.full, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
  sampleText: { color: Colors.white },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  preset: {
    minHeight: 48, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexShrink: 1,
    backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border,
  },
  presetLabel: { flexShrink: 1 },
  swatch: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: Colors.border },
});
