import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { PressableScale } from './PressableScale';
import { Colors, FontSize, Fonts, Spacing, TapTarget } from '@/constants/theme';

interface Props {
  title: string;
  subtitle?: string;
  /** Show a back button (default true). */
  back?: boolean;
  onBack?: () => void;
  right?: ReactNode;
}

/** Friendly header: round back button, display-font title that wraps instead of clipping at large text, optional actions. */
export function ScreenHeader({ title, subtitle, back = true, onBack, right }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {back ? (
          <PressableScale
            onPress={onBack ?? (() => router.back())}
            guardMs={400}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={styles.back}
            hitSlop={8}
          >
            <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
          </PressableScale>
        ) : null}
        <View style={styles.titles}>
          <Text style={styles.title} accessibilityRole="header">{title}</Text>
          {subtitle ? <Text variant="caption">{subtitle}</Text> : null}
        </View>
        {right ? <View style={styles.right}>{right}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: Spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  back: {
    width: TapTarget,
    height: TapTarget,
    borderRadius: TapTarget / 2,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titles: { flex: 1, gap: 2 },
  title: { fontFamily: Fonts.displayHeavy, fontSize: FontSize['2xl'], lineHeight: 32, color: Colors.textPrimary },
  right: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
});
