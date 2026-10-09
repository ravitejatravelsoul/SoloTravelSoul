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
      <Text style={styles.value} numberOfLines={1}>{value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value)}</Text>
      <Text style={styles.label} numberOfLines={1} adjustsFontSizeToFit>{label}</Text>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity style={styles.stat} onPress={onPress} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }
  return content;
}

// Every stat gets an equal share of the row, so all six fit on a phone-width screen.
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
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xs,
  },
  statWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing.xs,
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
