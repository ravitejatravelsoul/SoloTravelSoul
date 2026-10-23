import { useState } from 'react';
import { Image, StyleSheet, View, type ImageSourcePropType, type LayoutChangeEvent } from 'react-native';

interface Props {
  /** A bundled image (require(...)). */
  source: number;
  /** Which part of the picture stays in view when it is cropped: 0 = left/top edge, 1 = right/bottom edge. */
  focalX?: number;
  focalY?: number;
}

/**
 * Fills its parent with a bundled photograph, cropped like "cover". The size is worked out from the picture's own
 * proportions instead of relying on the platform's resize mode, because an Android resource image is otherwise drawn
 * at its density-scaled size and shows only a magnified corner. Nothing is fetched; the picture ships in the app.
 */
export function LocalCover({ source, focalX = 0.5, focalY = 0.5 }: Props) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const meta = Image.resolveAssetSource(source as ImageSourcePropType);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox((b) => (b.w === width && b.h === height ? b : { w: width, h: height }));
  };
  let style = null;
  if (box.w > 0 && box.h > 0 && meta?.width && meta?.height) {
    const scale = Math.max(box.w / meta.width, box.h / meta.height);
    const w = meta.width * scale;
    const h = meta.height * scale;
    style = { position: 'absolute' as const, width: w, height: h, left: -(w - box.w) * focalX, top: -(h - box.h) * focalY };
  }
  return (
    <View style={StyleSheet.absoluteFill} onLayout={onLayout} pointerEvents="none">
      {style ? <Image source={source} style={style} resizeMode="stretch" accessibilityIgnoresInvertColors /> : null}
    </View>
  );
}
