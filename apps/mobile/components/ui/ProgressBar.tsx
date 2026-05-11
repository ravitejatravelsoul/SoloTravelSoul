import { View, StyleSheet, type ViewStyle } from 'react-native';
import { Colors, Radius } from '@/constants/theme';

interface ProgressBarProps {
  progress: number;   // 0–1
  color?: string;
  height?: number;
  style?: ViewStyle;
}

export function ProgressBar({
  progress,
  color = Colors.primary,
  height = 4,
  style,
}: ProgressBarProps) {
  const pct = `${Math.min(100, Math.max(0, progress * 100))}%` as `${number}%`;

  return (
    <View style={[styles.track, { height }, style]}>
      <View
        style={[styles.fill, { width: pct, backgroundColor: color, height }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    backgroundColor: Colors.chipBackground,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  fill: {
    borderRadius: Radius.full,
  },
});
