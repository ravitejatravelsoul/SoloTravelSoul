import { useCallback, useRef } from 'react';
import { Animated, Platform, Pressable, type GestureResponderEvent, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { splitShadowClip } from '@/utils/shadowClip';
import { Motion } from '@/constants/theme';
import { useReducedMotion } from '@/hooks/useReducedMotion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface Props extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  /** Scale while pressed (the control itself never moves: the touch target keeps its place). */
  scaleTo?: number;
  /** Presses closer together than this are ignored, so a double tap cannot fire an action twice. */
  guardMs?: number;
}

/**
 * Gentle press feedback: a quick spring down to `scaleTo` and back. Layout size never changes (transforms only), so the
 * target stays where the finger is. Skipped under reduced motion; presses are debounced against accidental repeats.
 */
export function PressableScale({ style, scaleTo = Motion.pressScale, guardMs = 0, onPress, onPressIn, onPressOut, disabled, children, ...rest }: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const reduced = useReducedMotion();
  const last = useRef(0);

  const animate = useCallback((to: number) => {
    if (reduced) return;
    Animated.spring(scale, { toValue: to, useNativeDriver: true, damping: Motion.spring.damping, stiffness: Motion.spring.stiffness, mass: Motion.spring.mass }).start();
  }, [reduced, scale]);

  const handlePress = useCallback((e: GestureResponderEvent) => {
    if (guardMs > 0) {
      const now = Date.now();
      if (now - last.current < guardMs) return;
      last.current = now;
    }
    onPress?.(e);
  }, [guardMs, onPress]);

  const handlers = {
    disabled,
    onPress: handlePress,
    onPressIn: (e: GestureResponderEvent) => { animate(scaleTo); onPressIn?.(e); },
    onPressOut: (e: GestureResponderEvent) => { animate(1); onPressOut?.(e); },
  };

  // iPhone: a card that casts a shadow and clips its content needs two layers or the shadow disappears (utils/shadowClip.ts).
  const parts = Platform.OS === 'ios' ? splitShadowClip(style) : null;
  if (parts) {
    return (
      <Animated.View style={[parts.outer, { transform: [{ scale }] }]}>
        <Pressable {...rest} {...handlers} style={parts.inner}>{children}</Pressable>
      </Animated.View>
    );
  }

  return (
    <AnimatedPressable {...rest} {...handlers} style={[style, { transform: [{ scale }] }]}>
      {children}
    </AnimatedPressable>
  );
}
