import { View, StyleSheet, type ViewStyle } from 'react-native';
import { Colors, Spacing } from '@/constants/theme';

interface DividerProps {
  style?: ViewStyle;
  color?: string;
}

export function Divider({ style, color = Colors.border }: DividerProps) {
  return (
    <View style={[styles.divider, { backgroundColor: color }, style]} />
  );
}

const styles = StyleSheet.create({
  divider: {
    height: 1,
    marginVertical: Spacing.sm,
  },
});
