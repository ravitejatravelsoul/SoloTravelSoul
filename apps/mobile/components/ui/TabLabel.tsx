import { useState } from 'react';
import { Text, View, StyleSheet, type LayoutChangeEvent, type NativeSyntheticEvent, type TextLayoutEventData } from 'react-native';

// Six tabs share about 60–68 dp each on a 360–411 dp phone. "Community" truncated to "Communi…"
// on an SM-S711U (384 dp), so the label is scaled down to fit its tab on one line. It still
// follows the system text size, up to what the fixed-height tab bar can hold.
// (adjustsFontSizeToFit did not shrink it on Android's new architecture, and minimumFontScale is
// iOS-only, so the fit is computed here from measured widths.)

const LABEL_FONT_SIZE = 10;
/** Never smaller than this fraction of the (system-scaled) label size. */
export const TAB_LABEL_MIN_SCALE = 0.65;
/** Growth cap for enlarged system text; the tab content area is 58 dp tall. */
export const TAB_LABEL_MAX_FONT_MULTIPLIER = 1.3;

/** Slack for Android rounding the scaled font to whole pixels (an exact fit still ellipsised). */
export const TAB_LABEL_FIT_MARGIN = 2;

/** Font scale that fits a label of natural width `natural` into `available` (both in dp). */
export function fitScale(natural: number, available: number): number {
  if (!(natural > 0) || !(available > 0)) return 1;
  return Math.max(TAB_LABEL_MIN_SCALE, Math.min(1, (available - TAB_LABEL_FIT_MARGIN) / natural));
}

export function TabLabel({ color, children }: { color: string; children: string }) {
  const [natural, setNatural] = useState(0);
  const [available, setAvailable] = useState(0);
  const scale = fitScale(natural, available);

  return (
    <View style={styles.box} pointerEvents="none" onLayout={(e: LayoutChangeEvent) => setAvailable(e.nativeEvent.layout.width)}>
      {/* Invisible copy, unconstrained, to measure the label's natural width at this text size. */}
      <Text
        style={[styles.label, styles.measure]}
        maxFontSizeMultiplier={TAB_LABEL_MAX_FONT_MULTIPLIER}
        onTextLayout={(e: NativeSyntheticEvent<TextLayoutEventData>) =>
          setNatural(e.nativeEvent.lines.reduce((w, l) => w + l.width, 0))
        }
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      >
        {children}
      </Text>
      <Text
        style={[styles.label, { color, fontSize: LABEL_FONT_SIZE * scale }]}
        numberOfLines={1}
        maxFontSizeMultiplier={TAB_LABEL_MAX_FONT_MULTIPLIER}
      >
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignSelf: 'stretch', marginTop: 2 },
  label: {
    textAlign: 'center',
    fontSize: LABEL_FONT_SIZE,
    fontWeight: '600',
  },
  measure: { position: 'absolute', left: 0, top: 0, width: 1000, opacity: 0 },
});
