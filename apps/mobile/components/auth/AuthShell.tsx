import { type ReactNode } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, LocalCover } from '@/components/ui';
import { Reveal } from '@/components/ui/Reveal';
import { Colors, Gradients, Radius, Shadow, Spacing } from '@/constants/theme';

interface Props {
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Shown under the card (links such as "Create one"). */
  footer?: ReactNode;
  /** Smaller photo for long forms. */
  compact?: boolean;
}

/**
 * Shared frame for sign-in, sign-up and password reset: a travel photograph that runs under the status bar, a rounded
 * ivory sheet that overlaps it, the title in the display face, and the form. The photo is a bundled, right-sized asset
 * (no network). Everything scrolls and the keyboard pushes the form up, so no field or button is ever hidden.
 */
export function AuthShell({ title, subtitle, children, footer, compact = false }: Props) {
  const insets = useSafeAreaInsets();
  const heroHeight = (compact ? 150 : 230) + insets.top;
  return (
    <KeyboardAvoidingView style={styles.root} behavior="padding">
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={{ height: heroHeight }}>
          <LocalCover source={require('../../assets/images/hero-hiker.jpg')} focalX={0.3} />
          <LinearGradient colors={Gradients.scrim} style={StyleSheet.absoluteFill} />
        </View>
        <View style={styles.sheet}>
          <Reveal>
            <Text variant="h1" style={styles.title} accessibilityRole="header">{title}</Text>
            {subtitle ? <Text variant="caption" style={styles.subtitle}>{subtitle}</Text> : null}
          </Reveal>
          <Reveal index={1} style={styles.body}>{children}</Reveal>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  scroll: { flexGrow: 1 },
  sheet: {
    flexGrow: 1,
    marginTop: -Radius['2xl'],
    backgroundColor: Colors.background,
    borderTopLeftRadius: Radius['2xl'],
    borderTopRightRadius: Radius['2xl'],
    paddingHorizontal: Spacing['2xl'],
    paddingTop: Spacing['2xl'],
    paddingBottom: Spacing['3xl'],
    ...Shadow.lg,
  },
  title: { fontSize: 32, lineHeight: 40 },
  subtitle: { marginTop: Spacing.xs },
  body: { marginTop: Spacing.xl, gap: Spacing.lg },
  footer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', marginTop: Spacing['2xl'] },
});
