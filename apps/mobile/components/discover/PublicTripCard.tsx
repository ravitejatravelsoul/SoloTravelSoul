import { useState } from 'react';
import { View, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Text, Avatar, Chip, PressableScale } from '@/components/ui';
import { useMediaSource } from '@/hooks/useMediaSource';
import type { PublicTrip } from '@solotravelsoul/shared';
import { Colors, Gradients, Spacing, Radius, FontSize, FontWeight, Fonts, Shadow } from '@/constants/theme';

function formatDateRange(start: Date, end: Date): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', { ...opts, year: 'numeric' })}`;
}

// Trips without a cover photo get a warm gradient picked from the destination, so the same place always looks the same.
const COVER_GRADIENTS = [Gradients.ocean, Gradients.sunset, Gradients.mountain, Gradients.adventure, Gradients.solo, Gradients.hidden] as const;
function coverGradient(destination: string) {
  let h = 0;
  for (let i = 0; i < destination.length; i++) h = (h * 31 + destination.charCodeAt(i)) >>> 0;
  return COVER_GRADIENTS[h % COVER_GRADIENTS.length];
}

interface PublicTripCardProps {
  trip: PublicTrip;
  onPress: () => void;
}

export function PublicTripCard({ trip, onPress }: PublicTripCardProps) {
  const mediaSrc = useMediaSource();
  const [coverFailed, setCoverFailed] = useState(false);
  const memberLabel = trip.maxMembers
    ? `${trip.memberCount} of ${trip.maxMembers} places taken`
    : `${trip.memberCount} member${trip.memberCount !== 1 ? 's' : ''}`;
  const open = trip.isAcceptingMembers && (trip.maxMembers == null || trip.memberCount < trip.maxMembers);
  const title = trip.title || trip.destination;
  const showPhoto = !!trip.coverPhotoURL && !coverFailed;

  return (
    <PressableScale
      style={styles.card}
      onPress={onPress}
      guardMs={500}
      scaleTo={0.98}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${trip.destination}, ${open ? 'open to join' : 'not accepting requests'}`}
    >
      <View style={styles.cover}>
        {showPhoto ? (
          <Image source={mediaSrc(trip.coverPhotoURL!)} style={StyleSheet.absoluteFill} resizeMode="cover" onError={() => setCoverFailed(true)} accessibilityIgnoresInvertColors />
        ) : (
          <LinearGradient colors={coverGradient(trip.destination)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill}>
            <Ionicons name="airplane" size={64} color="rgba(255,255,255,0.35)" style={styles.coverIcon} />
          </LinearGradient>
        )}
        <LinearGradient colors={Gradients.scrim} style={styles.coverScrim} />
        <View style={styles.coverBadges}>
          <View style={styles.destBadge}>
            <Ionicons name="location" size={12} color={Colors.primaryDark} />
            <Text style={styles.destText} numberOfLines={1}>{trip.destination}</Text>
          </View>
          <View style={[styles.statusBadge, open ? styles.statusOpen : styles.statusClosed]}>
            <Text style={styles.statusText}>{open ? 'Open' : trip.isAcceptingMembers ? 'Full' : 'Closed'}</Text>
          </View>
        </View>
      </View>

      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>{title}</Text>
        <View style={styles.ownerRow}>
          <Avatar uri={trip.ownerPhotoURL} initials={trip.ownerName[0] ?? '?'} size={26} />
          <Text style={styles.ownerName} numberOfLines={1}>{trip.ownerName}</Text>
        </View>
        <View style={styles.meta}>
          <View style={styles.metaItem}>
            <Ionicons name="calendar-outline" size={14} color={Colors.textSecondary} />
            <Text style={styles.metaText}>{formatDateRange(trip.startDate, trip.endDate)}</Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="people-outline" size={14} color={Colors.textSecondary} />
            <Text style={styles.metaText}>{memberLabel}</Text>
          </View>
        </View>
        {trip.tags.length > 0 && (
          <View style={styles.tags}>
            {trip.tags.slice(0, 3).map((t) => (
              <Chip key={t} label={t} style={styles.tag} />
            ))}
          </View>
        )}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.borderLight,
    ...Shadow.md,
  },
  cover: { height: 132, backgroundColor: Colors.chipBackground, justifyContent: 'flex-end' },
  coverIcon: { position: 'absolute', right: 16, top: 14 },
  coverScrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 70 },
  coverBadges: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.md, gap: Spacing.sm },
  destBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.surface,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
    flexShrink: 1,
  },
  destText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.primaryDark, flexShrink: 1 },
  statusBadge: { borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 5 },
  statusOpen: { backgroundColor: Colors.accent },
  statusClosed: { backgroundColor: Colors.coralSoft },
  statusText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  body: { padding: Spacing.lg, gap: Spacing.sm },
  title: { fontFamily: Fonts.display, fontSize: FontSize.xl, lineHeight: 27, color: Colors.textPrimary },
  ownerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  ownerName: { fontSize: FontSize.sm, color: Colors.textSecondary, flex: 1 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', columnGap: Spacing.lg, rowGap: Spacing.xs },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: FontSize.sm, color: Colors.textSecondary },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  tag: { paddingHorizontal: Spacing.sm, paddingVertical: 2, minHeight: 28 },
});
