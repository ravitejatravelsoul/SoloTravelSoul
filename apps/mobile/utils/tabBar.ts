// Bottom tab bar metrics from the device's real bottom safe-area inset (Android three-button
// or gesture navigation bar, iPhone home indicator). React Navigation uses a numeric style
// height as-is, so the inset must be part of it; the tab content area stays the same size.
const TAB_CONTENT_HEIGHT = 58;
const TOP_PADDING = 6;
/** Spacing below labels when the system reserves no bottom area. */
const MIN_BOTTOM_PADDING = 8;

export function tabBarInsets(bottomInset: number): { height: number; paddingTop: number; paddingBottom: number } {
  const paddingBottom = Math.max(Math.round(bottomInset), MIN_BOTTOM_PADDING);
  return { height: TOP_PADDING + TAB_CONTENT_HEIGHT + paddingBottom, paddingTop: TOP_PADDING, paddingBottom };
}
