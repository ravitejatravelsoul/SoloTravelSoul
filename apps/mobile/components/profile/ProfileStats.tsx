import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from '@/components/ui';
import { Colors, Spacing, FontSize, FontWeight } from '@/constants/theme';

interface StatItem {
  label: string;
  value: number;
  onPress?: () => void;
}

interface Props {
  stats: StatItem[];
}

function Stat({ label, value, onPress }: StatItem) {
  const content = (
    <View style={styles.stat}>
      <Text style={styles.value}>{value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value)}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }
  return content;
}

export function ProfileStats({ stats }: Props) {
  return (
    <View style={styles.row}>
      {stats.map((s, i) => (
        <View key={s.label} style={styles.statWrap}>
          {i > 0 && <View style={styles.divider} />}
          <Stat {...s} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
  },
  statWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stat: {
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  value: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  label: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  divider: {
    width: 1,
    height: 28,
    backgroundColor: Colors.border,
  },
});
