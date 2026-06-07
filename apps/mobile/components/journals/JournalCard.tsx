import { memo } from 'react';
import { View, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Text, Avatar } from '@/components/ui';
import { LikeButton } from '@/components/posts/LikeButton';
import { useLikeJournal } from '@/hooks/useJournals';
import { getUserInitials } from '@solotravelsoul/shared';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/constants/theme';
import type { TravelJournal } from '@solotravelsoul/shared';

interface Props {
  journal: TravelJournal;
}

export const JournalCard = memo(function JournalCard({ journal }: Props) {
  const initials = getUserInitials(journal.authorName);
  const { liked, toggling, toggle } = useLikeJournal(journal.journalId);

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/(app)/journal/${journal.journalId}` as never)}
      activeOpacity={0.88}
    >
      {/* ── Cover image ── */}
      {journal.coverImageURL ? (
        <Image source={{ uri: journal.coverImageURL }} style={styles.cover} resizeMode="cover" />
      ) : (
        <View style={[styles.cover, styles.coverPlaceholder]}>
          <Ionicons name="book-outline" size={32} color={Colors.border} />
        </View>
      )}

      <View style={styles.content}>
        {/* ── Location badge ── */}
        {journal.location ? (
          <View style={styles.locationBadge}>
            <Ionicons name="location-outline" size={11} color={Colors.primary} />
            <Text style={styles.locationText}>{journal.location}</Text>
          </View>
        ) : null}

        {/* ── Title ── */}
        <Text style={styles.title} numberOfLines={2}>{journal.title}</Text>
        {journal.subtitle ? (
          <Text style={styles.subtitle} numberOfLines={2}>{journal.subtitle}</Text>
        ) : null}

        {/* ── Author + meta ── */}
        <View style={styles.footer}>
          <View style={styles.authorRow}>
            <Avatar uri={journal.authorPhoto} initials={initials} size={24} />
            <Text style={styles.authorName}>{journal.authorName}</Text>
            <Text style={styles.sep}>·</Text>
            <Ionicons name="time-outline" size={12} color={Colors.textSecondary} />
            <Text style={styles.readTime}>{journal.readTimeMinutes} min read</Text>
          </View>
          <LikeButton
            liked={liked}
            count={journal.likeCount}
            onToggle={() => toggle(journal.likeCount)}
            disabled={toggling}
            size={18}
          />
        </View>
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    ...Shadow.md,
    marginBottom: Spacing.md,
  },
  cover: {
    width: '100%',
    height: 180,
    backgroundColor: Colors.borderLight,
  },
  coverPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { padding: Spacing['2xl'] },
  locationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginBottom: Spacing.sm,
  },
  locationText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.medium },
  title: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    lineHeight: 26,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1 },
  authorName: { fontSize: FontSize.sm, color: Colors.textSecondary },
  sep: { fontSize: FontSize.sm, color: Colors.placeholder },
  readTime: { fontSize: FontSize.sm, color: Colors.textSecondary },
});
