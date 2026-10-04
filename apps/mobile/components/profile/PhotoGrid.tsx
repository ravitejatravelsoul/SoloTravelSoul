import { memo } from 'react';
import { useMediaSource } from '@/hooks/useMediaSource';
import { View, StyleSheet, TouchableOpacity, Image, Dimensions } from 'react-native';
import { router } from 'expo-router';
import { Colors } from '@/constants/theme';
import type { TravelPost } from '@solotravelsoul/shared';

const SCREEN_W = Dimensions.get('window').width;
const CELL_SIZE = Math.floor((SCREEN_W - 2) / 3); // 2px total gap

interface Props {
  posts: TravelPost[];
}

export const PhotoGrid = memo(function PhotoGrid({ posts }: Props) {
  const mediaSrc = useMediaSource();
  const withImages = posts.filter((p) => p.images.length > 0);

  return (
    <View style={styles.grid}>
      {withImages.map((post, i) => (
        <TouchableOpacity
          key={post.postId}
          style={[styles.cell, { marginRight: (i + 1) % 3 === 0 ? 0 : 1, marginBottom: 1 }]}
          onPress={() => router.push(`/(app)/post/${post.postId}` as never)}
          activeOpacity={0.85}
        >
          <Image
            source={mediaSrc(post.images[0])}
            style={styles.image}
            resizeMode="cover"
          />
          {post.images.length > 1 && (
            <View style={styles.multiIcon}>
              {/* Carousel indicator dot */}
              <View style={styles.dot} />
              <View style={styles.dot} />
              <View style={styles.dot} />
            </View>
          )}
        </TouchableOpacity>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    backgroundColor: Colors.borderLight,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  multiIcon: {
    position: 'absolute',
    top: 6,
    right: 6,
    flexDirection: 'row',
    gap: 2,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
});
