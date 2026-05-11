import { TouchableOpacity, StyleSheet, type ViewStyle } from 'react-native';
import { Text } from './Text';
import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
  disabled?: boolean;
}

export function Chip({
  label,
  selected = false,
  onPress,
  style,
  disabled = false,
}: ChipProps) {
  const Component = onPress ? TouchableOpacity : (props: object) => <TouchableOpacity disabled {...props} />;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || !onPress}
      activeOpacity={0.7}
      style={[styles.base, selected ? styles.selected : styles.unselected, style]}
    >
      <Text
        style={[
          styles.label,
          { color: selected ? Colors.chipSelectedText : Colors.textPrimary },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.full,
    alignSelf: 'flex-start',
  },
  unselected: {
    backgroundColor: Colors.chipBackground,
  },
  selected: {
    backgroundColor: Colors.chipSelected,
  },
  label: {
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
});
