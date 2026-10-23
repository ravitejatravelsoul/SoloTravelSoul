import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { Colors, Motion } from '@/constants/theme';
import { reducedMotionKnown } from '@/hooks/useReducedMotion';

// Same size as the native splash image (see app.json: 220 dp canvas, logo at 62% of it) so the hand-over is seamless.
const LOGO_DP = Math.round(220 * 0.62);

interface Props {
  /** True once fonts and the first auth state are ready (or the bounded fallback fired). */
  ready: boolean;
  /** Called once the overlay is laid out, so the native splash can be dismissed behind an identical picture. */
  onShown: () => void;
}

/**
 * The picture the native splash shows (ivory background, the app logo), drawn in JavaScript so the native splash can
 * hand over to it with no blank frame. When the app is ready it fades and the logo lifts slightly into the first screen.
 * No artificial delay: it starts leaving the moment the app is ready. No network, no travel photo (those belong to
 * onboarding), nothing to tap.
 */
export function LaunchOverlay({ ready, onShown }: Props) {
  const [gone, setGone] = useState(false);
  const fade = useRef(new Animated.Value(1)).current;
  const lift = useRef(new Animated.Value(0)).current;
  const shown = useRef(false);

  useEffect(() => {
    if (!ready || gone) return;
    let live = true;
    // The system's reduce-motion answer is read asynchronously; wait for it (a few milliseconds) rather than guess.
    void reducedMotionKnown().then((reduced) => {
      if (!live) return;
      if (reduced) { setGone(true); return; }
      Animated.parallel([
        Animated.timing(fade, { toValue: 0, duration: Motion.base, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(lift, { toValue: 1, duration: Motion.base, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]).start(() => setGone(true));
    });
    return () => { live = false; };
  }, [ready, gone, fade, lift]);

  if (gone) return null;
  return (
    <Animated.View
      pointerEvents={ready ? 'none' : 'auto'}
      style={[styles.root, { opacity: fade }]}
      onLayout={() => { if (!shown.current) { shown.current = true; onShown(); } }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={styles.center}>
        <Animated.Image
          source={require('../assets/images/brand-mark.png')}
          style={[styles.logo, { transform: [{ translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [0, -18] }) }, { scale: lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }] }]}
          resizeMode="contain"
          fadeDuration={0}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, backgroundColor: Colors.background, zIndex: 100, elevation: 100 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logo: { width: LOGO_DP, height: LOGO_DP },
});
