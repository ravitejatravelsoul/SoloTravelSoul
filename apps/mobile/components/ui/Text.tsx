import {
  Text as RNText,
  type TextProps,
  type TextStyle,
  StyleSheet,
} from 'react-native';
import { Colors, FontSize, FontWeight, Fonts } from '@/constants/theme';

type Variant = 'h1' | 'h2' | 'h3' | 'body' | 'bodyLarge' | 'caption' | 'label' | 'error';

interface ThemedTextProps extends TextProps {
  variant?: Variant;
  color?: string;
  bold?: boolean;
  center?: boolean;
}

export function Text({
  variant = 'body',
  color,
  bold,
  center,
  style,
  ...props
}: ThemedTextProps) {
  return (
    <RNText
      style={[
        styles[variant],
        color ? { color } : undefined,
        bold ? { fontWeight: FontWeight.bold } : undefined,
        center ? { textAlign: 'center' } : undefined,
        style,
      ]}
      {...props}
    />
  );
}

const styles = StyleSheet.create<Record<Variant, TextStyle>>({
  // Headings use the bundled display face (it carries its own weight; no fontWeight, which would fake-bold it).
  h1: {
    fontFamily: Fonts.displayHeavy,
    fontSize: FontSize['3xl'],
    color: Colors.textPrimary,
    lineHeight: 38,
  },
  h2: {
    fontFamily: Fonts.display,
    fontSize: FontSize['2xl'],
    color: Colors.textPrimary,
    lineHeight: 32,
  },
  h3: {
    fontFamily: Fonts.display,
    fontSize: FontSize.xl,
    color: Colors.textPrimary,
    lineHeight: 28,
  },
  bodyLarge: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.regular,
    color: Colors.textPrimary,
    lineHeight: 26,
  },
  body: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.regular,
    color: Colors.textPrimary,
    lineHeight: 22,
  },
  caption: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.regular,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  label: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    color: Colors.textPrimary,
    lineHeight: 18,
  },
  error: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.regular,
    color: Colors.error,
    lineHeight: 18,
  },
});
