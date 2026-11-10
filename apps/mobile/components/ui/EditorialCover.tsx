import { useState, type ReactNode } from 'react';
import { Image, StyleSheet, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useMediaSource } from '@/hooks/useMediaSource';
import { useAppTheme } from '@/stores/appearanceStore';
import { Radius, Spacing } from '@/constants/theme';
import { LocalCover } from './LocalCover';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro resolves bundled images through static require.
export const LISBON_COVER: number = require('../../assets/editorial/lisbon.jpg');

export function destinationCover(destination: string): number | undefined {
  const city = destination.trim().toLowerCase().split(/\s*[,·]\s*/)[0];
  return city === 'lisbon' || city === 'lisboa' ? LISBON_COVER : undefined;
}

function CoverImage({ source }: { source: ImageSourcePropType }) {
  const [failed, setFailed] = useState(false);
  return failed ? null : (
    <Image
      source={source}
      style={StyleSheet.absoluteFill}
      resizeMode="cover"
      onError={() => setFailed(true)}
      accessible={false}
      accessibilityIgnoresInvertColors
    />
  );
}

/** Image and scrim behind real, scalable text. Existing layout controls the cover height. */
export function EditorialBackdrop({
  source, photoURL,
}: { source?: number; photoURL?: string | null }) {
  const mediaSource = useMediaSource();
  if (!photoURL && !source) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" importantForAccessibility="no-hide-descendants">
      {source ? <LocalCover source={source} /> : null}
      {photoURL ? <CoverImage key={photoURL} source={mediaSource(photoURL)} /> : null}
      <LinearGradient
        colors={['rgba(13,26,31,0.12)', 'rgba(13,26,31,0.73)', '#111D22']}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

export function EditorialCover({
  children, source, photoURL, style,
}: {
  children: ReactNode; source?: number; photoURL?: string | null; style?: StyleProp<ViewStyle>;
}) {
  const { Gradients } = useAppTheme();
  return (
    <LinearGradient colors={Gradients.hero} style={[styles.cover, style]}>
      <EditorialBackdrop source={source} photoURL={photoURL} />
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  cover: {
    minHeight: 156, padding: Spacing.lg, borderRadius: Radius.xl,
    overflow: 'hidden', justifyContent: 'flex-end', gap: Spacing.xs,
  },
});
