import { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Avatar, Chip, Button } from '@/components/ui';
import { JoinRequestModal as GroupJoinModal } from '@/components/community/GroupJoinModal';
import {
  getTravelGroup,
  subscribeGroupMembers,
  getGroupJoinRequestStatus,
} from '@solotravelsoul/firebase';
import type { CommunityGroup, CommunityGroupMember, RequestStatus } from '@solotravelsoul/shared';
import { useAuthStore } from '@/stores/authStore';
import { getUserInitials } from '@solotravelsoul/shared';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/constants/theme';

export default function GroupDetailScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const uid = useAuthStore((s) => s.user?.uid ?? '');
  const profile = useAuthStore((s) => s.profile);

  const [group, setGroup] = useState<CommunityGroup | null>(null);
  const [members, setMembers] = useState<CommunityGroupMember[]>([]);
  const [requestStatus, setRequestStatus] = useState<RequestStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (!groupId) return;
    let unsub: (() => void) | null = null;

    getTravelGroup(groupId).then((g) => {
      setGroup(g);
      setLoading(false);
      if (g) {
        unsub = subscribeGroupMembers(groupId, setMembers);
      }
    }).catch(() => setLoading(false));

    getGroupJoinRequestStatus(groupId, uid).then(setRequestStatus).catch(() => {});

    return () => { if (unsub) unsub(); };
  }, [groupId, uid]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <NavBar />
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      </SafeAreaView>
    );
  }

  if (!group) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <NavBar />
        <View style={styles.center}><Text style={styles.emptyTitle}>Group not found</Text></View>
      </SafeAreaView>
    );
  }

  const isOwner = group.ownerUid === uid;
  const isMember = members.some((m) => m.uid === uid);
  const isPending = requestStatus === 'pending';
  const isFull = group.memberCount >= group.capacity;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.navTitle} numberOfLines={1}>{group.name}</Text>
        <TouchableOpacity onPress={() => Alert.alert('Report group', undefined, [
          { text: 'Report', onPress: () => router.push({ pathname: '/(app)/community/report', params: { targetType: 'group', targetId: groupId } } as never) },
          { text: 'Cancel', style: 'cancel' },
        ])} hitSlop={12}>
          <Ionicons name="ellipsis-horizontal" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.destBadge}>
            <Ionicons name="location" size={14} color={Colors.white} />
            <Text style={styles.destText}>{group.destination}</Text>
          </View>
          <Text style={styles.heroName}>{group.name}</Text>
          <Text style={styles.heroMeta}>{group.memberCount}/{group.capacity} members</Text>
        </View>

        {/* Owner card */}
        <TouchableOpacity
          style={styles.ownerCard}
          onPress={() => router.push(`/(app)/community/profile/${group.ownerUid}` as never)}
          activeOpacity={0.7}
        >
          <Avatar uri={group.ownerPhotoURL} initials={getUserInitials(group.ownerName)} size={40} />
          <View style={styles.ownerInfo}>
            <Text style={styles.ownerName}>{group.ownerName}</Text>
            <Text style={styles.ownerLabel}>Group organizer</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={Colors.placeholder} />
        </TouchableOpacity>

        {/* About */}
        {group.description ? (
          <Section title="ABOUT">
            <Text style={styles.bodyText}>{group.description}</Text>
          </Section>
        ) : null}

        {/* Rules */}
        {group.rules ? (
          <Section title="GROUP RULES">
            <Text style={styles.bodyText}>{group.rules}</Text>
          </Section>
        ) : null}

        {/* Tags */}
        {group.tags.length > 0 && (
          <Section title="TAGS">
            <View style={styles.tags}>
              {group.tags.map((t) => <Chip key={t} label={t} />)}
            </View>
          </Section>
        )}

        {/* Members */}
        {members.length > 0 && (
          <Section title={`MEMBERS (${members.length})`}>
            <View style={styles.membersGrid}>
              {members.map((m) => (
                <TouchableOpacity
                  key={m.uid}
                  style={styles.memberItem}
                  onPress={() => router.push(`/(app)/community/profile/${m.uid}` as never)}
                  activeOpacity={0.7}
                >
                  <Avatar uri={m.photoURL} initials={getUserInitials(m.displayName)} size={40} />
                  <Text style={styles.memberName} numberOfLines={1}>{m.displayName}</Text>
                  {m.role === 'owner' && (
                    <Text style={styles.ownerBadge}>organizer</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </Section>
        )}

        {/* Join / Action button */}
        <View style={styles.actionsCard}>
          {isOwner ? (
            <Button
              label="Manage Requests"
              onPress={() => router.push(`/(app)/community/groups/${groupId}/requests` as never)}
              fullWidth
            />
          ) : isMember ? (
            group.chatGroupId ? (
              <Button
                label="Open Chat"
                onPress={() => router.push(`/(app)/groups/${group.chatGroupId}/chat` as never)}
                fullWidth
              />
            ) : (
              <Button label="You're a member" variant="secondary" disabled fullWidth onPress={() => {}} />
            )
          ) : isPending ? (
            <Button label="Request Pending" variant="secondary" disabled fullWidth onPress={() => {}} />
          ) : isFull ? (
            <Button label="Group is Full" variant="secondary" disabled fullWidth onPress={() => {}} />
          ) : (
            <Button label="Request to Join" onPress={() => setShowModal(true)} fullWidth />
          )}
        </View>
      </ScrollView>

      {showModal && profile && (
        <GroupJoinModal
          group={group}
          requestor={profile}
          onClose={() => setShowModal(false)}
          onSubmitted={() => { setRequestStatus('pending'); setShowModal(false); }}
        />
      )}
    </SafeAreaView>
  );
}

function NavBar() {
  return (
    <View style={styles.navBar}>
      <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
        <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
      </TouchableOpacity>
      <Text style={styles.navTitle}>Group</Text>
      <View style={{ width: 24 }} />
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  navBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  navTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, flex: 1, textAlign: 'center' },
  content: { paddingBottom: Spacing['3xl'] },
  hero: {
    backgroundColor: Colors.accent,
    padding: Spacing['2xl'],
    paddingTop: Spacing['3xl'],
    gap: Spacing.sm,
  },
  destBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  destText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.white },
  heroName: { fontSize: FontSize['2xl'], fontWeight: FontWeight.bold, color: Colors.white, lineHeight: 32 },
  heroMeta: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.8)' },
  ownerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: Spacing.lg,
    gap: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  ownerInfo: { flex: 1 },
  ownerName: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  ownerLabel: { fontSize: FontSize.sm, color: Colors.textSecondary },
  section: { marginHorizontal: Spacing.lg, marginTop: Spacing.xl },
  sectionLabel: { fontSize: 11, fontWeight: FontWeight.bold, color: Colors.textSecondary, letterSpacing: 0.7, marginBottom: Spacing.sm },
  sectionCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    gap: Spacing.md,
    ...Shadow.sm,
  },
  bodyText: { fontSize: FontSize.md, color: Colors.textSecondary, lineHeight: 22 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  membersGrid: { gap: Spacing.sm },
  memberItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  memberName: { flex: 1, fontSize: FontSize.sm, color: Colors.textPrimary, fontWeight: FontWeight.medium },
  ownerBadge: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.semibold },
  actionsCard: { marginHorizontal: Spacing.lg, marginTop: Spacing.xl },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
});
