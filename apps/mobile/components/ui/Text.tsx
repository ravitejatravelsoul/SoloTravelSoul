import {
  Text as RNText,
  type TextProps,
  type TextStyle,
  StyleSheet,
} from 'react-native';
import { Colors, FontSize, FontWeight } from '@/constants/theme';

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
  h1: {
    fontSize: FontSize['3xl'],
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    lineHeight: 36,
  },
  h2: {
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    lineHeight: 30,
  },
  h3: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    lineHeight: 26,
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
