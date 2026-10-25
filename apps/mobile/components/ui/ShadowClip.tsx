import { type ComponentType } from 'react';
import { Platform, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { splitShadowClip } from '@/utils/shadowClip';

/**
 * Wraps a view-like component whose style both casts a shadow and clips its content (overflow hidden). On iPhone that
 * combination loses the shadow, so there the component is rendered inside an outer view that carries the shadow and the
 * layout (see utils/shadowClip.ts). On Android, and for styles that need no split, it is the component unchanged.
 */
export function withShadowClip<P extends { style?: StyleProp<ViewStyle> }>(Inner: ComponentType<P>): ComponentType<P> {
  function ShadowClipped(props: P) {
    if (Platform.OS !== 'ios') return <Inner {...props} />;
    const parts = splitShadowClip(props.style);
    if (!parts) return <Inner {...props} />;
    return (
      <View style={parts.outer}>
        <Inner {...props} style={parts.inner} />
      </View>
    );
  }
  ShadowClipped.displayName = `ShadowClip(${Inner.displayName ?? Inner.name ?? 'View'})`;
  return ShadowClipped;
}

/** A View that keeps its shadow on iPhone even though it clips its content. */
export const ShadowView = withShadowClip(View);
/** The same for a TouchableOpacity card. */
export const ShadowTouchable = withShadowClip(TouchableOpacity);
