import { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getGroup } from '@solotravelsoul/firebase';
import { useAuthStore } from '@/stores/authStore';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '@/constants/theme';
import { format } from 'date-fns';
import type { TravelGroup } from '@solotravelsoul/shared';

export default function GroupDetailScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();
  const uid = useAuthStore((s) => s.user?.uid ?? '');

  const [group, setGroup] = useState<TravelGroup | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!groupId) return;
    getGroup(groupId)
      .then(setGroup)
      .finally(() => setLoading(false));
  }, [groupId]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  if (!group) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Group not found.</Text>
      </View>
    );
  }

  const isCreator = group.createdBy === uid;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={26} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>Group Info</Text>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {/* Group avatar */}
        <View style={styles.avatarWrap}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {group.name.split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')}
            </Text>
          </View>
          <Text style={styles.groupName}>{group.name}</Text>
          <Text style={styles.groupMeta}>
            {group.members.length} member{group.members.length !== 1 ? 's' : ''} · Created {format(group.createdAt, 'MMM d, yyyy')}
          </Text>
        </View>

        {/* Open Chat button */}
        <TouchableOpacity
          style={styles.chatBtn}
          onPress={() => router.push(`/groups/${group.id}/chat`)}
        >
          <Ionicons name="chatbubbles-outline" size={20} color={Colors.white} />
          <Text style={styles.chatBtnText}>Open Group Chat</Text>
        </TouchableOpacity>

        {/* Members */}
        <Text style={styles.sectionLabel}>Members</Text>
        <View style={styles.membersCard}>
          {group.members.map((memberId, i) => {
            const info = group.memberInfo[memberId];
            const isMe = memberId === uid;
            return (
              <View key={memberId}>
                {i > 0 && <View style={styles.memberDivider} />}
                <View style={styles.memberRow}>
                  <View style={styles.memberAvatar}>
                    <Text style={styles.memberInitials}>{info?.initials ?? '?'}</Text>
                  </View>
                  <View style={styles.memberInfo}>
                    <Text style={styles.memberName}>
                      {info?.name ?? 'Unknown'}{isMe ? ' (you)' : ''}
                    </Text>
                    {memberId === group.createdBy && (
                      <Text style={styles.memberRole}>Admin</Text>
                    )}
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: FontSize.sm, color: Colors.textSecondary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingBottom: Spacing.md,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  body: { padding: Spacing.lg, gap: Spacing.lg, paddingBottom: 40 },
  avatarWrap: { alignItems: 'center', gap: Spacing.sm },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: Radius.lg,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: Colors.white, fontSize: FontSize['2xl'], fontWeight: FontWeight.bold },
  groupName: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, textAlign: 'center' },
  groupMeta: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center' },
  chatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingVertical: Spacing.md,
  },
  chatBtnText: { color: Colors.white, fontWeight: FontWeight.semibold, fontSize: FontSize.sm },
  sectionLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8 },
  membersCard: { backgroundColor: Colors.surface, borderRadius: Radius.lg, overflow: 'hidden' },
  memberDivider: { height: 1, backgroundColor: Colors.borderLight, marginLeft: 56 },
  memberRow: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, gap: Spacing.md },
  memberAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  memberInitials: { color: Colors.white, fontWeight: FontWeight.bold, fontSize: FontSize.sm },
  memberInfo: { flex: 1 },
  memberName: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.textPrimary },
  memberRole: { fontSize: FontSize.xs, color: Colors.accent, fontWeight: FontWeight.semibold, marginTop: 2 },
});
