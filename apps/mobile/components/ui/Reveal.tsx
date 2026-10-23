import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';
import { Motion } from '@/constants/theme';
import { isReducedMotion } from '@/hooks/useReducedMotion';

interface Props {
  children: ReactNode;
  /** Position in a list: later items start a little later (capped, so long lists never feel slow). */
  index?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * One-time entrance (a short fade and a small rise) for the first items on a screen. Transform and opacity only, never
 * layout, so nothing a person is about to tap moves once it has appeared; skipped under reduced motion.
 */
export function Reveal({ children, index = 0, style }: Props) {
  const reduced = isReducedMotion();
  const v = useRef(new Animated.Value(reduced ? 1 : 0)).current;

  useEffect(() => {
    if (reduced) return;
    Animated.timing(v, { toValue: 1, duration: Motion.base + 80, delay: Math.min(index, 6) * 55, useNativeDriver: true }).start();
  }, [index, reduced, v]);

  return (
    <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}
