import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { Colors } from '@/constants/theme';
import { isReducedMotion } from '@/hooks/useReducedMotion';

const COLORS = [Colors.coral, Colors.accent, Colors.sun, Colors.primary, Colors.catMountain];
const COUNT = 14;

interface Props {
  /** Change this value to play the burst once (for example when a request is sent). */
  trigger: number;
}

/**
 * A small confetti burst (about 0.9 s) for completions: a trip saved, a request sent. It sits in an overlay that ignores
 * touches, never blocks content, is hidden from screen readers, and does nothing under reduced motion.
 */
export function Celebration({ trigger }: Props) {
  const t = useRef(new Animated.Value(0)).current;
  const first = useRef(true);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (isReducedMotion()) return;
    t.setValue(0);
    Animated.timing(t, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [trigger, t]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.origin}>
        {Array.from({ length: COUNT }, (_, i) => {
          const angle = (i / COUNT) * Math.PI * 2;
          const dist = 70 + (i % 3) * 28;
          return (
            <Animated.View
              key={i}
              style={[
                styles.dot,
                { backgroundColor: COLORS[i % COLORS.length], width: 8 + (i % 3) * 3, height: 8 + (i % 3) * 3 },
                {
                  opacity: t.interpolate({ inputRange: [0, 0.1, 0.8, 1], outputRange: [0, 1, 1, 0] }),
                  transform: [
                    { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(angle) * dist] }) },
                    { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(angle) * dist + 24] }) },
                    { scale: t.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.4, 1.1, 0.7] }) },
                  ],
                },
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  origin: { position: 'absolute', top: '38%', left: '50%', width: 0, height: 0 },
  dot: { position: 'absolute', borderRadius: 6 },
});
