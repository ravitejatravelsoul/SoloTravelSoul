import { memo, useState } from 'react';
import { useMediaSource } from '@/hooks/useMediaSource';
import {
  ScrollView,
  Image,
  View,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { Colors, Radius, Spacing } from '@/constants/theme';

const SCREEN_W = Dimensions.get('window').width;

interface Props {
  images: string[];
  height?: number;
}

export const PostImageCarousel = memo(function PostImageCarousel({ images, height = 300 }: Props) {
  const mediaSrc = useMediaSource();
  const [activeIndex, setActiveIndex] = useState(0);
  const isSingle = images.length === 1;

  if (images.length === 0) return null;

  return (
    <View>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
          setActiveIndex(idx);
        }}
        scrollEventThrottle={16}
      >
        {images.map((uri, i) => (
          <Image
            key={i}
            source={mediaSrc(uri)}
            style={[styles.image, { width: SCREEN_W, height }]}
            resizeMode="cover"
          />
        ))}
      </ScrollView>

      {!isSingle && (
        <View style={styles.dots}>
          {images.map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === activeIndex && styles.dotActive]}
            />
          ))}
        </View>
      )}

      {!isSingle && (
        <View style={styles.counter}>
          <View style={styles.counterPill}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.white, opacity: 0.9 }} />
          </View>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  image: {
    backgroundColor: Colors.borderLight,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 5,
    marginTop: Spacing.sm,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.border,
  },
  dotActive: {
    backgroundColor: Colors.primary,
    width: 18,
    borderRadius: 3,
  },
  counter: {
    position: 'absolute',
    top: Spacing.md,
    right: Spacing.md,
  },
  counterPill: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
});
