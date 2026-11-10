import { EDITORIAL_APPEARANCE_ENABLED, useAppTheme } from '@/stores/appearanceStore';
import { themed } from '@/constants/appearance';
import { memo } from 'react';
import { View, StyleSheet, Image } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Text, Avatar } from '@/components/ui';
import { LikeButton } from '@/components/posts/LikeButton';
import { useLikeJournal } from '@/hooks/useJournals';
import { getUserInitials } from '@solotravelsoul/shared';
import { Spacing, Radius, FontSize, FontWeight, Fonts } from '@/constants/theme';
import type { TravelJournal } from '@solotravelsoul/shared';
import { ShadowTouchable } from '@/components/ui/ShadowClip';
import { useMediaSource } from '@/hooks/useMediaSource';
import { EditorialCover } from '@/components/ui/EditorialCover';

interface Props {
  journal: TravelJournal;
}

export const JournalCard = memo(function JournalCard({ journal }: Props) {
  const theme = useAppTheme();
  const { Colors } = theme;
  const styles = getStyles(theme);
  const mediaSrc = useMediaSource();
  const initials = getUserInitials(journal.authorName);
  const { liked, toggling, toggle } = useLikeJournal(journal.journalId);

  return (
    <ShadowTouchable
      style={styles.card}
      onPress={() => router.push(`/(app)/journal/${journal.journalId}` as never)}
      activeOpacity={0.88}
    >
      {EDITORIAL_APPEARANCE_ENABLED ? (
        <EditorialCover photoURL={journal.coverImageURL} style={styles.cover}>
          <Text style={styles.coverLabel}>{journal.location || 'Travel journal'}</Text>
          <Text style={styles.coverTitle} numberOfLines={3}>{journal.title}</Text>
        </EditorialCover>
      ) : journal.coverImageURL ? (
        <Image source={mediaSrc(journal.coverImageURL)} style={styles.legacyCover} resizeMode="cover" />
      ) : (
        <View style={[styles.legacyCover, styles.legacyCoverPlaceholder]}>
          <Ionicons name="book-outline" size={32} color={Colors.border} />
        </View>
      )}

      <View style={styles.content}>
        {!EDITORIAL_APPEARANCE_ENABLED && (
          <>
            {/* ── Location badge ── */}
            {journal.location ? (
              <View style={styles.locationBadge}>
                <Ionicons name="location-outline" size={11} color={Colors.primary} />
                <Text style={styles.locationText}>{journal.location}</Text>
              </View>
            ) : null}

            {/* ── Title ── */}
            <Text style={styles.title} numberOfLines={2}>{journal.title}</Text>
          </>
        )}
        {journal.subtitle ? (
          <Text style={styles.subtitle} numberOfLines={2}>{journal.subtitle}</Text>
        ) : null}

        {/* ── Author + meta ── */}
        {/* The metadata shrinks and wraps (long names ellipsise, read time moves under the author at
            large text sizes); the like control keeps its own space and is never overlapped. */}
        <View style={styles.footer}>
          <View style={styles.meta}>
            <View style={styles.author}>
              <Avatar uri={journal.authorPhoto} initials={initials} size={24} />
              <Text style={styles.authorName} numberOfLines={1}>{journal.authorName}</Text>
            </View>
            <View style={styles.readTimeRow}>
              <Ionicons name="time-outline" size={12} color={Colors.textSecondary} />
              <Text style={styles.readTime}>{journal.readTimeMinutes} min read</Text>
            </View>
          </View>
          <View style={styles.like}>
            <LikeButton
              liked={liked}
              count={journal.likeCount}
              onToggle={() => toggle(journal.likeCount)}
              disabled={toggling}
              size={18}
            />
          </View>
        </View>
      </View>
    </ShadowTouchable>
  );
});

const getStyles = themed(({ Colors, Shadow }) => (StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    ...Shadow.md,
    marginBottom: Spacing.md,
  },
  cover: { minHeight: 168, borderRadius: 0 },
  legacyCover: {
    width: '100%',
    height: 180,
    backgroundColor: Colors.borderLight,
  },
  legacyCoverPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginBottom: Spacing.sm,
  },
  locationText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.medium },
  title: {
    fontFamily: Fonts.display,
    fontSize: FontSize.xl,
    color: Colors.textPrimary,
    lineHeight: 26,
    marginBottom: Spacing.xs,
  },
  content: { padding: Spacing['2xl'] },
  coverLabel: { fontSize: FontSize.sm, color: Colors.white, fontWeight: FontWeight.semibold },
  coverTitle: {
    fontFamily: Fonts.display,
    fontSize: FontSize.xl,
    color: Colors.white,
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
  meta: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: Spacing.sm,
    rowGap: Spacing.xs,
  },
  author: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1, minWidth: 0 },
  authorName: { fontSize: FontSize.sm, color: Colors.textSecondary, flexShrink: 1 },
  readTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 0 },
  readTime: { fontSize: FontSize.sm, color: Colors.textSecondary },
  like: { flexShrink: 0, marginLeft: Spacing.sm },
})));
