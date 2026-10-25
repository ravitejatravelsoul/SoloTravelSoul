import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

/**
 * iOS draws a view's shadow outside its bounds, and `overflow: 'hidden'` on the same view clips it away, so a card that
 * both rounds-and-clips its content and casts a shadow loses the shadow on iPhone (Android's `elevation` is unaffected).
 * The fix is two views: an outer one that casts the shadow and keeps the layout, and an inner one that clips.
 * This splits one flattened style into those two parts; it returns null when the style needs no split.
 */
const OUTER_ONLY = new Set([
  'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'marginHorizontal', 'marginVertical', 'marginStart', 'marginEnd',
  'position', 'top', 'bottom', 'left', 'right', 'start', 'end', 'zIndex', 'alignSelf',
  'flex', 'flexGrow', 'flexShrink', 'flexBasis',
  'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight', 'aspectRatio',
  'transform', 'opacity',
  'shadowColor', 'shadowOffset', 'shadowOpacity', 'shadowRadius', 'elevation',
]);
// Both layers need the same corners so the shadow follows the clipped shape; the outer also carries the colour so the
// shadow has a solid shape to cast.
const BOTH = new Set([
  'borderRadius', 'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius',
  'borderTopStartRadius', 'borderTopEndRadius', 'borderBottomStartRadius', 'borderBottomEndRadius', 'backgroundColor',
]);

export interface ShadowClipStyles {
  outer: ViewStyle;
  inner: ViewStyle;
}

export function splitShadowClip(style: StyleProp<ViewStyle>): ShadowClipStyles | null {
  const flat = (StyleSheet.flatten(style) ?? {}) as Record<string, unknown>;
  const casts = !!flat.shadowOpacity || !!flat.elevation;
  if (flat.overflow !== 'hidden' || !casts) return null;
  const outer: Record<string, unknown> = {};
  const inner: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(flat)) {
    if (OUTER_ONLY.has(key)) outer[key] = value;
    else if (BOTH.has(key)) { outer[key] = value; inner[key] = value; }
    else inner[key] = value;
  }
  // The inner layer fills the outer one (a fixed height or a flex share sits on the outer layer).
  inner.flexGrow = 1;
  return { outer: outer as ViewStyle, inner: inner as ViewStyle };
}
