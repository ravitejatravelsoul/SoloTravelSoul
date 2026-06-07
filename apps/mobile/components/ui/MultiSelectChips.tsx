import { View, StyleSheet } from 'react-native';
import { Chip } from './Chip';
import { Spacing } from '@/constants/theme';

interface MultiSelectChipsProps<T extends string> {
  options: T[];
  selected: T[];
  onToggle: (value: T) => void;
  labelMap?: Partial<Record<T, string>>;
}

export function MultiSelectChips<T extends string>({
  options,
  selected,
  onToggle,
  labelMap,
}: MultiSelectChipsProps<T>) {
  return (
    <View style={styles.wrap}>
      {options.map((opt) => (
        <Chip
          key={opt}
          label={labelMap?.[opt] ?? opt}
          selected={selected.includes(opt)}
          onPress={() => onToggle(opt)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
});
