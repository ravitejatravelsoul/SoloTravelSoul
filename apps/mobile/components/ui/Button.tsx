import {
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  type ViewStyle,
} from 'react-native';
import { Text } from './Text';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '@/constants/theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
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
  const loaderColor =
    variant === 'primary' || variant === 'danger'
      ? Colors.white
      : Colors.primary;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={inactive}
      activeOpacity={0.75}
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
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  primary: { backgroundColor: Colors.primary },
  secondary: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  ghost: { backgroundColor: 'transparent' },
  danger: { backgroundColor: Colors.error },
  fullWidth: { width: '100%' },
  disabled: { opacity: 0.45 },
  label: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
  },
});

const sizeStyle = StyleSheet.create({
  sm: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs + 2, minHeight: 36 },
  md: { paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm + 2, minHeight: 46 },
  lg: { paddingHorizontal: Spacing['2xl'], paddingVertical: Spacing.md, minHeight: 54 },
});

const labelColor = StyleSheet.create({
  primary: { color: Colors.white },
  secondary: { color: Colors.textPrimary },
  ghost: { color: Colors.primary },
  danger: { color: Colors.white },
});
