import { memo } from 'react';
import { useMediaSource } from '@/hooks/useMediaSource';
import { View, StyleSheet, TouchableOpacity, Image, Dimensions } from 'react-native';
import { router } from 'expo-router';
import { Text } from '@/components/ui';
import { Colors, FontSize, Spacing } from '@/constants/theme';
import type { TravelPost } from '@solotravelsoul/shared';

const SCREEN_W = Dimensions.get('window').width;
const GAP = 6;
const SIDE = Spacing.lg;
const CELL_SIZE = Math.floor((SCREEN_W - SIDE * 2 - GAP * 2) / 3);

interface Props {
  posts: TravelPost[];
  /** Show posts without a photo as a text tile (Saved Posts): otherwise a saved text post would never appear. */
  includeTextOnly?: boolean;
}

export const PhotoGrid = memo(function PhotoGrid({ posts, includeTextOnly = false }: Props) {
  const mediaSrc = useMediaSource();
  const withImages = includeTextOnly ? posts : posts.filter((p) => p.images.length > 0);

  return (
    <View style={styles.grid}>
      {withImages.map((post, i) => (
        <TouchableOpacity
          key={post.postId}
          style={[styles.cell, { marginRight: (i + 1) % 3 === 0 ? 0 : GAP, marginBottom: GAP }]}
          accessibilityRole="button"
          accessibilityLabel={post.caption ? `Post: ${post.caption}` : 'Post'}
          onPress={() => router.push(`/(app)/post/${post.postId}` as never)}
          activeOpacity={0.85}
        >
          {post.images.length > 0 ? (
            <Image
              source={mediaSrc(post.images[0])}
              style={styles.image}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.textTile}>
              <Text style={styles.textTileText} numberOfLines={6}>{post.caption || post.body || 'Post'}</Text>
            </View>
          )}
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
    paddingHorizontal: SIDE,
    paddingTop: Spacing.xs,
  },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    backgroundColor: Colors.borderLight,
    position: 'relative',
    borderRadius: 14,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  textTile: { flex: 1, padding: Spacing.sm, justifyContent: 'center', backgroundColor: Colors.surface },
  textTileText: { fontSize: FontSize.sm, color: Colors.textPrimary },
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
