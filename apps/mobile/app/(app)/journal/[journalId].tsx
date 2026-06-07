import { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Share,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Avatar, EmptyState } from '@/components/ui';
import { LikeButton } from '@/components/posts/LikeButton';
import { CommentsSheet } from '@/components/posts/CommentsSheet';
import { useLikeJournal } from '@/hooks/useJournals';
import { getJournal } from '@solotravelsoul/firebase';
import { getUserInitials } from '@solotravelsoul/shared';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import type { TravelJournal } from '@solotravelsoul/shared';

export default function JournalDetailScreen() {
  const { journalId } = useLocalSearchParams<{ journalId: string }>();
  const [journal, setJournal] = useState<TravelJournal | null>(null);
  const [loading, setLoading] = useState(true);
  const [showComments, setShowComments] = useState(false);

  const { liked, toggling, toggle } = useLikeJournal(journalId ?? '');

  useEffect(() => {
    if (!journalId) return;
    getJournal(journalId)
      .then(setJournal)
      .finally(() => setLoading(false));
  }, [journalId]);

  const handleShare = async () => {
    if (!journal) return;
    await Share.share({ message: `${journal.title}\n\nShared via SoloTravelSoul` });
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

  if (!journal) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <EmptyState emoji="📖" title="Journal not found" subtitle="This journal may have been removed." />
      </SafeAreaView>
    );
  }

  const initials = getUserInitials(journal.authorName);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>Journal</Text>
        <TouchableOpacity onPress={handleShare} hitSlop={12}>
          <Ionicons name="share-outline" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* ── Cover ── */}
        {journal.coverImageURL ? (
          <Image source={{ uri: journal.coverImageURL }} style={styles.cover} resizeMode="cover" />
        ) : null}

        <View style={styles.article}>
          {/* ── Location ── */}
          {journal.location ? (
            <View style={styles.locationBadge}>
              <Ionicons name="location-outline" size={12} color={Colors.primary} />
              <Text style={styles.locationText}>{journal.location}{journal.country ? `, ${journal.country}` : ''}</Text>
            </View>
          ) : null}

          {/* ── Title ── */}
          <Text style={styles.title}>{journal.title}</Text>
          {journal.subtitle ? <Text style={styles.subtitle}>{journal.subtitle}</Text> : null}

          {/* ── Author + meta ── */}
          <View style={styles.authorRow}>
            <TouchableOpacity
              style={styles.authorInner}
              onPress={() => router.push(`/(app)/community/profile/${journal.authorId}` as never)}
              activeOpacity={0.8}
            >
              <Avatar uri={journal.authorPhoto} initials={initials} size={36} />
              <View style={styles.authorInfo}>
                <Text style={styles.authorName}>{journal.authorName}</Text>
                <View style={styles.metaRow}>
                  <Ionicons name="time-outline" size={12} color={Colors.textSecondary} />
                  <Text style={styles.metaText}>{journal.readTimeMinutes} min read</Text>
                </View>
              </View>
            </TouchableOpacity>

            <View style={styles.actions}>
              <LikeButton
                liked={liked}
                count={journal.likeCount}
                onToggle={() => toggle(journal.likeCount)}
                disabled={toggling}
                size={22}
              />
              <TouchableOpacity
                style={styles.commentBtn}
                onPress={() => setShowComments(true)}
                hitSlop={8}
              >
                <Ionicons name="chatbubble-outline" size={22} color={Colors.textSecondary} />
                {journal.commentCount > 0 && (
                  <Text style={styles.commentCount}>{journal.commentCount}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Body ── */}
          <Text style={styles.body}>{journal.body}</Text>

          {/* ── Hashtags ── */}
          {journal.hashtags.length > 0 && (
            <View style={styles.tagRow}>
              {journal.hashtags.map((tag) => (
                <Text key={tag} style={styles.hashtag}>#{tag}</Text>
              ))}
            </View>
          )}
        </View>

        {/* ── Comments CTA ── */}
        <TouchableOpacity style={styles.commentsBtn} onPress={() => setShowComments(true)}>
          <Ionicons name="chatbubbles-outline" size={18} color={Colors.primary} />
          <Text style={styles.commentsBtnText}>
            {journal.commentCount > 0 ? `View all ${journal.commentCount} comments` : 'Add a comment'}
          </Text>
        </TouchableOpacity>

        <View style={{ height: 60 }} />
      </ScrollView>

      {showComments && (
        <CommentsSheet
          postId={journal.journalId}
          authorId={journal.authorId}
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
  headerTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.semibold, flex: 1, textAlign: 'center' },
  cover: { width: '100%', height: 240, backgroundColor: Colors.borderLight },
  article: { padding: Spacing['2xl'] },
  locationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: Spacing.md,
  },
  locationText: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: FontWeight.medium },
  title: {
    fontSize: FontSize['3xl'],
    fontWeight: FontWeight.extrabold,
    color: Colors.textPrimary,
    lineHeight: 36,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: FontSize.lg,
    color: Colors.textSecondary,
    lineHeight: 24,
    marginBottom: Spacing.xl,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.lg,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.borderLight,
    marginBottom: Spacing['2xl'],
  },
  authorInner: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  authorInfo: { marginLeft: Spacing.sm },
  authorName: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  metaText: { fontSize: FontSize.xs, color: Colors.textSecondary },
  actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  commentBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  commentCount: { fontSize: FontSize.sm, color: Colors.textSecondary },
  body: {
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    lineHeight: 26,
    marginBottom: Spacing['2xl'],
  },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  hashtag: { fontSize: FontSize.sm, color: Colors.primary },
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
