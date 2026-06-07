import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text, Avatar, Chip } from '@/components/ui';
import type { CommunityGroup } from '@solotravelsoul/shared';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/constants/theme';
import { getUserInitials } from '@solotravelsoul/shared';

interface Props {
  group: CommunityGroup;
  onPress: () => void;
}

export function TravelGroupCard({ group, onPress }: Props) {
  const spotsLeft = group.capacity - group.memberCount;
  const isFull = spotsLeft <= 0;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.header}>
        <View style={styles.destBadge}>
          <Ionicons name="location" size={12} color={Colors.primary} />
          <Text style={styles.destText} numberOfLines={1}>{group.destination}</Text>
        </View>
        {isFull ? (
          <View style={styles.fullBadge}>
            <Text style={styles.fullBadgeText}>FULL</Text>
          </View>
        ) : (
          <Text style={styles.spotsText}>{spotsLeft} spot{spotsLeft !== 1 ? 's' : ''} left</Text>
        )}
      </View>

      <Text style={styles.name} numberOfLines={2}>{group.name}</Text>

      <View style={styles.ownerRow}>
        <Avatar uri={group.ownerPhotoURL} initials={getUserInitials(group.ownerName)} size={22} />
        <Text style={styles.ownerName}>{group.ownerName}</Text>
        <Text style={styles.memberCount}>{group.memberCount}/{group.capacity}</Text>
        <Ionicons name="people-outline" size={13} color={Colors.textSecondary} />
      </View>

      {group.tags.length > 0 && (
        <View style={styles.tags}>
          {group.tags.slice(0, 3).map((t) => <Chip key={t} label={t} style={styles.tag} />)}
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
    maxWidth: '70%',
  },
  destText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.primary },
  fullBadge: {
    backgroundColor: Colors.error + '15',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
  },
  fullBadgeText: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.error },
  spotsText: { fontSize: FontSize.xs, color: Colors.success, fontWeight: FontWeight.semibold },
  name: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary, lineHeight: 24 },
  ownerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  ownerName: { flex: 1, fontSize: FontSize.sm, color: Colors.textSecondary },
  memberCount: { fontSize: FontSize.sm, color: Colors.textSecondary },
  tags: { flexDirection: 'row', gap: Spacing.xs },
  tag: { paddingHorizontal: Spacing.sm, paddingVertical: 2 },
});
