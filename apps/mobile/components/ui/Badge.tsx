import { View, StyleSheet } from 'react-native';
import { Text } from './Text';
import { Colors, FontSize, Radius } from '@/constants/theme';

interface BadgeProps {
  count: number;
  max?: number;
}

export function Badge({ count, max = 99 }: BadgeProps) {
  if (count === 0) return null;

  const label = count > max ? `${max}+` : String(count);

  return (
    <View style={[styles.badge, label.length > 2 ? styles.wide : undefined]}>
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: Colors.error,
    borderRadius: Radius.full,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  wide: {
    paddingHorizontal: 6,
  },
  text: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.white,
  },
});
