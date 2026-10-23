import { ActivityIndicator, StyleSheet, type ViewStyle } from 'react-native';
import { Text } from './Text';
import { PressableScale } from './PressableScale';
import { Colors, FontSize, FontWeight, Radius, Shadow, Spacing } from '@/constants/theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'coral';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps {
  onPress: () => void;
  label: string;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
}

/**
 * Pill button. Teal is the primary action, white-with-teal-outline the secondary, coral a selective highlight (ink label).
 * Press feedback is a transform only, and presses within 350 ms of each other are ignored so a double tap cannot repeat an action.
 */
export function Button({
  onPress,
  label,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  fullWidth = false,
  style,
}: ButtonProps) {
  const inactive = disabled || loading;
  const loaderColor = variant === 'primary' || variant === 'danger' ? Colors.white : variant === 'coral' ? Colors.textPrimary : Colors.primary;

  return (
    <PressableScale
      onPress={onPress}
      disabled={inactive}
      guardMs={350}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={[
        styles.base,
        styles[variant],
        sizeStyle[size],
        fullWidth && styles.fullWidth,
        inactive && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={loaderColor} size="small" />
      ) : (
        <Text
          style={[
            styles.label,
            labelColor[variant],
            size === 'sm' ? { fontSize: FontSize.sm } : undefined,
            size === 'lg' ? { fontSize: FontSize.lg } : undefined,
          ]}
        >
          {label}
        </Text>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  primary: { backgroundColor: Colors.primary, ...Shadow.sm },
  secondary: {
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  ghost: { backgroundColor: 'transparent' },
  danger: { backgroundColor: Colors.error },
  coral: { backgroundColor: Colors.coral, ...Shadow.sm },
  fullWidth: { width: '100%' },
  disabled: { opacity: 0.45 },
  label: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
});

const sizeStyle = StyleSheet.create({
  sm: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs + 2, minHeight: 40 },
  md: { paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm + 2, minHeight: 48 },
  lg: { paddingHorizontal: Spacing['2xl'], paddingVertical: Spacing.md, minHeight: 56 },
});

const labelColor = StyleSheet.create({
  primary: { color: Colors.white },
  secondary: { color: Colors.primaryDark },
  ghost: { color: Colors.primaryDark },
  danger: { color: Colors.white },
  coral: { color: Colors.textPrimary },
});
