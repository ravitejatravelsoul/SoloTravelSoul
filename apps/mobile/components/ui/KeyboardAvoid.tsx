import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, LayoutAnimation, Platform, View, type KeyboardAvoidingViewProps } from 'react-native';
import { isReducedMotion } from '@/hooks/useReducedMotion';

/** How far the keyboard covers a view, from the view's position in the window (not in its parent). */
export function keyboardOverlap(frameWindowY: number, frameHeight: number, keyboardScreenY: number, extraOffset = 0): number {
  return Math.max(0, frameWindowY + frameHeight - (keyboardScreenY - extraOffset));
}

/**
 * Keeps a screen's content above the keyboard.
 *
 * Android: React Native's KeyboardAvoidingView with "padding", exactly as before.
 *
 * iPhone: the same idea, measured correctly. React Native's version works out the overlap from the view's position inside
 * its parent, which is wrong in a page sheet or a modal card (they start part-way down the screen), so the composer or the
 * Send button stayed partly under the keyboard. This measures the view in the *window*, so it is right on a full screen, in
 * a page sheet and in a modal card, and it follows the keyboard's own animation unless reduced motion is on.
 */
export function KeyboardAvoid(props: KeyboardAvoidingViewProps) {
  if (Platform.OS !== 'ios') return <KeyboardAvoidingView behavior="padding" {...props} />;
  return <KeyboardAvoidIOS {...props} />;
}

function KeyboardAvoidIOS({ style, children, keyboardVerticalOffset = 0, onLayout, enabled = true, behavior: _behavior, contentContainerStyle: _contentContainerStyle, ...rest }: KeyboardAvoidingViewProps) {
  const ref = useRef<View>(null);
  const [padding, setPadding] = useState(0);
  const keyboardY = useRef<number | null>(null);

  const apply = useCallback((next: number, duration?: number) => {
    if (!isReducedMotion() && duration) {
      LayoutAnimation.configureNext({ duration, update: { type: LayoutAnimation.Types.keyboard } });
    }
    setPadding((p) => (Math.abs(p - next) < 0.5 ? p : next));
  }, []);

  const recompute = useCallback((duration?: number) => {
    if (!enabled || keyboardY.current === null) { apply(0, duration); return; }
    const kb = keyboardY.current;
    ref.current?.measureInWindow((_x, y, _w, h) => apply(keyboardOverlap(y, h, kb, keyboardVerticalOffset), duration));
  }, [apply, enabled, keyboardVerticalOffset]);

  useEffect(() => {
    const change = Keyboard.addListener('keyboardWillChangeFrame', (e) => {
      const { screenY, height } = e.endCoordinates;
      // A frame that starts at the bottom of the screen is a hidden keyboard.
      keyboardY.current = height > 0 ? screenY : null;
      recompute(e.duration);
    });
    const hide = Keyboard.addListener('keyboardWillHide', (e) => { keyboardY.current = null; apply(0, e.duration); });
    return () => { change.remove(); hide.remove(); };
  }, [apply, recompute]);

  return (
    <View
      {...rest}
      ref={ref}
      style={padding > 0 ? [style, { paddingBottom: padding }] : style}
      onLayout={(e) => { onLayout?.(e); if (keyboardY.current !== null) recompute(); }}
    >
      {children}
    </View>
  );
}
