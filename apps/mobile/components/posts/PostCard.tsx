import { memo, useCallback } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Share,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Text, Avatar } from '@/components/ui';
import { LikeButton } from './LikeButton';
import { SaveButton } from './SaveButton';
import { PostImageCarousel } from './PostImageCarousel';
import { useLikePost } from '@/hooks/usePosts';
import { getUserInitials } from '@solotravelsoul/shared';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/constants/theme';
import type { TravelPost } from '@solotravelsoul/shared';

const POST_TYPE_LABEL: Record<string, string> = {
  photo: '',
  carousel: '',
  hidden_gem: '💎 Hidden Gem',
  food: '🍜 Food',
  hotel: '🏨 Hotel',
  memory: '📸 Memory',
  story: '📖 Story',
};

interface Props {
  post: TravelPost;
  onPress?: () => void;
}

export const PostCard = memo(function PostCard({ post, onPress }: Props) {
  const initials = getUserInitials(post.authorName);
  const { liked, toggling, toggle } = useLikePost(post.postId);

  const handleLike = useCallback(() => toggle(post.likeCount), [toggle, post.likeCount]);

  const handleAuthorPress = useCallback(() => {
    router.push(`/(app)/community/profile/${post.authorId}` as never);
  }, [post.authorId]);

  const handlePress = useCallback(() => {
    if (onPress) { onPress(); return; }
    router.push(`/(app)/post/${post.postId}` as never);
  }, [onPress, post.postId]);

  const handleShare = useCallback(() => {
    Share.share({ message: `${post.caption}\n\nShared via SoloTravelSoul` }).catch(() => {});
  }, [post.caption]);

  const typeLabel = POST_TYPE_LABEL[post.postType] ?? '';

  return (
    <View style={styles.card}>
      {/* ── Author header ── */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.authorRow} onPress={handleAuthorPress} activeOpacity={0.8}>
          <Avatar uri={post.authorPhoto} initials={initials} size={38} />
          <View style={styles.authorInfo}>
            <Text style={styles.authorName}>{post.authorName}</Text>
            {post.location ? (
              <View style={styles.locationRow}>
                <Ionicons name="location-outline" size={11} color={Colors.textSecondary} />
                <Text style={styles.location}>{post.location}</Text>
              </View>
            ) : null}
          </View>
        </TouchableOpacity>
        {typeLabel ? (
          <View style={styles.typeBadge}>
            <Text style={styles.typeLabel}>{typeLabel}</Text>
          </View>
        ) : null}
      </View>

      {/* ── Images ── */}
      {post.images.length > 0 && (
        <TouchableOpacity onPress={handlePress} activeOpacity={0.98}>
          <PostImageCarousel images={post.images} height={280} />
        </TouchableOpacity>
      )}

      {/* ── Actions ── */}
      <View style={styles.actions}>
        <LikeButton
          liked={liked}
          count={post.likeCount}
          onToggle={handleLike}
          disabled={toggling}
        />
        <TouchableOpacity style={styles.actionBtn} onPress={handlePress} hitSlop={8}>
          <Ionicons name="chatbubble-outline" size={22} color={Colors.textSecondary} />
          {post.commentCount > 0 && (
            <Text style={styles.actionCount}>{post.commentCount}</Text>
          )}
        </TouchableOpacity>
        <SaveButton postId={post.postId} />
        <TouchableOpacity style={[styles.actionBtn, styles.shareBtn]} onPress={handleShare} hitSlop={8} accessibilityRole="button" accessibilityLabel="Share post">
          <Ionicons name="paper-plane-outline" size={22} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* ── Caption ── */}
      {post.caption ? (
        <TouchableOpacity onPress={handlePress} activeOpacity={0.9} style={styles.captionWrap}>
          <Text style={styles.caption} numberOfLines={3}>
            <Text style={styles.captionAuthor}>{post.authorName} </Text>
            {post.caption}
          </Text>
        </TouchableOpacity>
      ) : null}

      {/* ── Hashtags ── */}
      {post.hashtags.length > 0 && (
        <View style={styles.hashtagRow}>
          {post.hashtags.slice(0, 5).map((tag) => (
            <Text key={tag} style={styles.hashtag}>#{tag}</Text>
          ))}
        </View>
      )}

      {/* ── Comment peek ── */}
      {post.commentCount > 0 && (
        <TouchableOpacity onPress={handlePress} style={styles.commentPeek}>
          <Text style={styles.commentPeekText}>
            View all {post.commentCount} comment{post.commentCount !== 1 ? 's' : ''}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.borderLight,
    ...Shadow.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  authorInfo: { marginLeft: Spacing.sm, flex: 1 },
  authorName: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 1,
  },
  location: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  typeBadge: {
    backgroundColor: Colors.coralSoft,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  typeLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.md,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionCount: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    color: Colors.textSecondary,
  },
  shareBtn: {
    marginLeft: 'auto',
  },
  captionWrap: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  caption: {
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    lineHeight: 20,
  },
  captionAuthor: {
    fontWeight: FontWeight.semibold,
  },
  hashtagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  hashtag: {
    fontSize: FontSize.sm,
    color: Colors.primaryDark,
    fontWeight: FontWeight.medium,
  },
  commentPeek: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
  commentPeekText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
});
