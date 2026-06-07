import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text, Avatar, Chip } from '@/components/ui';
import type { PublicTrip } from '@solotravelsoul/shared';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/constants/theme';

function formatDateRange(start: Date, end: Date): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', { ...opts, year: 'numeric' })}`;
}

interface PublicTripCardProps {
  trip: PublicTrip;
  onPress: () => void;
}

export function PublicTripCard({ trip, onPress }: PublicTripCardProps) {
  const memberLabel = trip.maxMembers
    ? `${trip.memberCount} / ${trip.maxMembers}`
    : `${trip.memberCount} member${trip.memberCount !== 1 ? 's' : ''}`;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      {/* Destination badge */}
      <View style={styles.header}>
        <View style={styles.destBadge}>
          <Ionicons name="location" size={12} color={Colors.primary} />
          <Text style={styles.destText} numberOfLines={1}>{trip.destination}</Text>
        </View>
        {!trip.isAcceptingMembers && (
          <View style={styles.fullBadge}>
            <Text style={styles.fullBadgeText}>FULL</Text>
          </View>
        )}
      </View>

      {/* Trip title */}
      <Text style={styles.title} numberOfLines={2}>{trip.title || trip.destination}</Text>

      {/* Owner */}
      <View style={styles.ownerRow}>
        <Avatar uri={trip.ownerPhotoURL} initials={trip.ownerName[0] ?? '?'} size={24} />
        <Text style={styles.ownerName} numberOfLines={1}>{trip.ownerName}</Text>
      </View>

      {/* Meta */}
      <View style={styles.meta}>
        <View style={styles.metaItem}>
          <Ionicons name="calendar-outline" size={13} color={Colors.textSecondary} />
          <Text style={styles.metaText}>{formatDateRange(trip.startDate, trip.endDate)}</Text>
        </View>
        <View style={styles.metaItem}>
          <Ionicons name="people-outline" size={13} color={Colors.textSecondary} />
          <Text style={styles.metaText}>{memberLabel}</Text>
        </View>
      </View>

      {/* Tags */}
      {trip.tags.length > 0 && (
        <View style={styles.tags}>
          {trip.tags.slice(0, 3).map((t) => (
            <Chip key={t} label={t} style={styles.tag} />
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    gap: Spacing.sm,
    ...Shadow.sm,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  destBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary + '12',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    maxWidth: '75%',
  },
  destText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.primary },
  fullBadge: {
    backgroundColor: Colors.error + '15',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
  },
  fullBadgeText: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.error, letterSpacing: 0.5 },
  title: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, lineHeight: 24 },
  ownerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  ownerName: { fontSize: FontSize.sm, color: Colors.textSecondary, flex: 1 },
  meta: { flexDirection: 'row', gap: Spacing.lg },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: FontSize.xs, color: Colors.textSecondary },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  tag: { paddingHorizontal: Spacing.sm, paddingVertical: 2 },
});
