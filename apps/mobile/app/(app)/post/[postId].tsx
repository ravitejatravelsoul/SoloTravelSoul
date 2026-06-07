import { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Share,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Avatar, EmptyState } from '@/components/ui';
import { PostImageCarousel } from '@/components/posts/PostImageCarousel';
import { LikeButton } from '@/components/posts/LikeButton';
import { CommentsSheet } from '@/components/posts/CommentsSheet';
import { useLikePost } from '@/hooks/usePosts';
import { getPost } from '@solotravelsoul/firebase';
import { getUserInitials } from '@solotravelsoul/shared';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/constants/theme';
import type { TravelPost } from '@solotravelsoul/shared';

export default function PostDetailScreen() {
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const [post, setPost] = useState<TravelPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [showComments, setShowComments] = useState(false);

  const { liked, toggling, toggle } = useLikePost(postId ?? '');

  useEffect(() => {
    if (!postId) return;
    getPost(postId)
      .then(setPost)
      .finally(() => setLoading(false));
  }, [postId]);

  const handleShare = async () => {
    if (!post) return;
    await Share.share({ message: `${post.caption}\n\nShared via SoloTravelSoul` });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!post) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <EmptyState emoji="🔍" title="Post not found" subtitle="This post may have been removed." />
      </SafeAreaView>
    );
  }

  const initials = getUserInitials(post.authorName);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Post</Text>
        <TouchableOpacity onPress={handleShare} hitSlop={12}>
          <Ionicons name="share-outline" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* ── Author ── */}
        <View style={styles.authorRow}>
          <TouchableOpacity
            style={styles.authorInner}
            onPress={() => router.push(`/(app)/community/profile/${post.authorId}` as never)}
            activeOpacity={0.8}
          >
            <Avatar uri={post.authorPhoto} initials={initials} size={42} />
            <View style={styles.authorInfo}>
              <Text style={styles.authorName}>{post.authorName}</Text>
              {post.location ? (
                <View style={styles.locationRow}>
                  <Ionicons name="location-outline" size={11} color={Colors.textSecondary} />
                  <Text style={styles.locationText}>{post.location}{post.country ? `, ${post.country}` : ''}</Text>
                </View>
              ) : null}
            </View>
          </TouchableOpacity>
        </View>

        {/* ── Images ── */}
        {post.images.length > 0 && (
          <PostImageCarousel images={post.images} height={320} />
        )}

        {/* ── Actions ── */}
        <View style={styles.actions}>
          <LikeButton
            liked={liked}
            count={post.likeCount}
            onToggle={() => toggle(post.likeCount)}
            disabled={toggling}
            size={26}
          />
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => setShowComments(true)}
            hitSlop={8}
          >
            <Ionicons name="chatbubble-outline" size={26} color={Colors.textSecondary} />
            {post.commentCount > 0 && (
              <Text style={styles.actionCount}>{post.commentCount}</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, styles.shareBtn]} onPress={handleShare} hitSlop={8}>
            <Ionicons name="paper-plane-outline" size={26} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* ── Caption ── */}
        {post.caption ? (
          <View style={styles.captionWrap}>
            <Text style={styles.caption}>
              <Text style={styles.captionAuthor}>{post.authorName} </Text>
              {post.caption}
            </Text>
          </View>
        ) : null}

        {/* ── Hashtags ── */}
        {post.hashtags.length > 0 && (
          <View style={styles.tagRow}>
            {post.hashtags.map((tag) => (
              <Text key={tag} style={styles.hashtag}>#{tag}</Text>
            ))}
          </View>
        )}

        {/* ── Body (long-form) ── */}
        {post.body ? (
          <View style={styles.body}>
            <Text style={styles.bodyText}>{post.body}</Text>
          </View>
        ) : null}

        {/* ── Comments preview ── */}
        <TouchableOpacity style={styles.commentsBtn} onPress={() => setShowComments(true)}>
          <Ionicons name="chatbubbles-outline" size={18} color={Colors.primary} />
          <Text style={styles.commentsBtnText}>
            {post.commentCount > 0 ? `View all ${post.commentCount} comments` : 'Add a comment'}
          </Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Comments sheet ── */}
      {showComments && (
        <CommentsSheet
          postId={post.postId}
          authorId={post.authorId}
          onClose={() => setShowComments(false)}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  backBtn: { padding: Spacing['2xl'] },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing['2xl'],
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  headerTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.semibold },
  authorRow: {
    paddingHorizontal: Spacing['2xl'],
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surface,
  },
  authorInner: { flexDirection: 'row', alignItems: 'center' },
  authorInfo: { marginLeft: Spacing.md, flex: 1 },
  authorName: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2 },
  locationText: { fontSize: FontSize.sm, color: Colors.textSecondary },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing['2xl'],
    paddingVertical: Spacing.md,
    gap: Spacing.xl,
    backgroundColor: Colors.surface,
  },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionCount: { fontSize: FontSize.md, color: Colors.textSecondary, fontWeight: FontWeight.medium },
  shareBtn: { marginLeft: 'auto' },
  captionWrap: { padding: Spacing['2xl'], backgroundColor: Colors.surface },
  caption: { fontSize: FontSize.md, color: Colors.textPrimary, lineHeight: 22 },
  captionAuthor: { fontWeight: FontWeight.semibold },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: Spacing['2xl'],
    paddingBottom: Spacing.md,
    backgroundColor: Colors.surface,
  },
  hashtag: { fontSize: FontSize.sm, color: Colors.primary },
  body: { padding: Spacing['2xl'], backgroundColor: Colors.surface, marginTop: Spacing.sm },
  bodyText: { fontSize: FontSize.md, color: Colors.textPrimary, lineHeight: 24 },
  commentsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    margin: Spacing['2xl'],
    padding: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  commentsBtnText: { fontSize: FontSize.md, color: Colors.primary, fontWeight: FontWeight.medium },
});
