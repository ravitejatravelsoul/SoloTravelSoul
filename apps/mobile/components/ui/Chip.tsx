import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, type ViewStyle } from 'react-native';
import { Text } from './Text';
import { PressableScale } from './PressableScale';
import { Colors, FontSize, FontWeight, Motion, Radius, Spacing } from '@/constants/theme';
import { useReducedMotion } from '@/hooks/useReducedMotion';

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
  disabled?: boolean;
}

/** Selection chip. Choosing one gives a short spring pop (transform only, so neighbours never shift). */
export function Chip({ label, selected = false, onPress, style, disabled = false }: ChipProps) {
  const pop = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (reduced || !selected) return;
    pop.setValue(0.9);
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, damping: 8, stiffness: 260, mass: 0.7 }).start();
  }, [selected, reduced, pop]);

  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled || !onPress}
      scaleTo={0.95}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled: disabled || !onPress }}
      style={[styles.base, selected ? styles.selected : styles.unselected, style]}
    >
      <Animated.View style={{ transform: [{ scale: pop }] }}>
        <Text style={[styles.label, { color: selected ? Colors.chipSelectedText : Colors.textPrimary }]}>{label}</Text>
      </Animated.View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: Spacing.md + 2,
    paddingVertical: Spacing.xs + 3,
    borderRadius: Radius.full,
    alignSelf: 'flex-start',
    minHeight: 36,
    justifyContent: 'center',
  },
  unselected: { backgroundColor: Colors.chipBackground },
  selected: { backgroundColor: Colors.chipSelected },
  label: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
});

export const CHIP_MOTION_MS = Motion.fast;
