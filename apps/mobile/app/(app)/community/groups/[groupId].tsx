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
import { LinearGradient } from 'expo-linear-gradient';
import { Text, Avatar, Chip, Button, BackButton } from '@/components/ui';
import { JoinRequestModal as GroupJoinModal } from '@/components/community/GroupJoinModal';
import {
  getTravelGroup,
  subscribeGroupMembers,
  getGroupJoinRequestStatus,
  leaveGroup,
} from '@solotravelsoul/firebase';
import type { CommunityGroup, CommunityGroupMember, RequestStatus } from '@solotravelsoul/shared';
import { useAuthStore } from '@/stores/authStore';
import { getUserInitials, isListed } from '@solotravelsoul/shared';
import { Colors, Gradients, Spacing, Radius, FontSize, FontWeight, Shadow, Fonts, TapTarget } from '@/constants/theme';

export default function GroupDetailScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const uid = useAuthStore((s) => s.user?.uid ?? '');
  const profile = useAuthStore((s) => s.profile);

  const [group, setGroup] = useState<CommunityGroup | null>(null);
  const [members, setMembers] = useState<CommunityGroupMember[]>([]);
  const [requestStatus, setRequestStatus] = useState<RequestStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [leaving, setLeaving] = useState(false);

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
  const unavailable = !isListed(group);

  const confirmLeave = () => {
    Alert.alert('Leave this group?', 'You will no longer be a member. You can ask to join again later if the group is accepting requests.', [
      { text: 'Stay', style: 'cancel' },
      {
        text: 'Leave group',
        style: 'destructive',
        onPress: async () => {
          setLeaving(true);
          try {
            await leaveGroup(group.groupId, uid);
            setMembers((prev) => prev.filter((m) => m.uid !== uid));
            setRequestStatus(null);
            setGroup({ ...group, memberCount: Math.max(1, group.memberCount - 1) });
          } catch {
            Alert.alert('Could not leave', 'Please check your connection and try again.');
          } finally {
            setLeaving(false);
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.navBar}>
        <BackButton />
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
        <LinearGradient colors={Gradients.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <Ionicons name="people" size={120} color="rgba(255,255,255,0.14)" style={styles.heroArt} />
          <View style={styles.destBadge}>
            <Ionicons name="location" size={14} color={Colors.primaryDark} />
            <Text style={styles.destText} numberOfLines={1}>{group.destination}</Text>
          </View>
          <Text style={styles.heroName} accessibilityRole="header">{group.name}</Text>
          <Text style={styles.heroMeta}>{group.memberCount}/{group.capacity} members</Text>
        </LinearGradient>

        {/* Join / Action button */}
        <View style={styles.actionsCard}>
          {isOwner && unavailable ? (
            <Text style={styles.noticeText}>Requests are paused while this group is hidden.</Text>
          ) : isOwner ? (
            <Button
              label="Manage Requests"
              onPress={() => router.push(`/(app)/community/groups/${groupId}/requests` as never)}
              fullWidth
            />
          ) : isMember ? (
            <View style={{ gap: Spacing.sm }}>
              {group.chatGroupId ? (
                <Button
                  label="Open Chat"
                  onPress={() => router.push(`/(app)/groups/${group.chatGroupId}/chat` as never)}
                  fullWidth
                />
              ) : (
                <Text style={styles.noticeText}>You are a member of this group.</Text>
              )}
              <Button label="Leave group" variant="secondary" onPress={confirmLeave} loading={leaving} fullWidth />
            </View>
          ) : unavailable ? (
            <Button label="Not available" variant="secondary" disabled fullWidth onPress={() => {}} />
          ) : isPending ? (
            <Button label="Request Pending" variant="secondary" disabled fullWidth onPress={() => {}} />
          ) : isFull ? (
            <Button label="Group is Full" variant="secondary" disabled fullWidth onPress={() => {}} />
          ) : (
            <Button label="Request to Join" onPress={() => setShowModal(true)} fullWidth />
          )}
        </View>

        {unavailable && (
          <View style={styles.noticeBox} accessibilityRole="alert">
            <Text style={styles.noticeText}>
              {isOwner
                ? 'A moderator has hidden this group. It is not shown to other people, takes no new requests and cannot be edited or restored by you. Members can still leave.'
                : 'This group is currently not available. It takes no new requests.'}
            </Text>
          </View>
        )}

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
          <Ionicons name="chevron-forward" size={16} color={Colors.textSecondary} />
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
      <BackButton />
      <Text style={styles.navTitle}>Group</Text>
      <View style={{ width: 44 }} />
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel} accessibilityRole="header">{title.charAt(0) + title.slice(1).toLowerCase()}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  noticeBox: { marginHorizontal: Spacing.lg, marginTop: Spacing.md, padding: Spacing.md, borderRadius: Radius.md, backgroundColor: Colors.warning + '22', borderWidth: 1, borderColor: Colors.warning + '66' },
  noticeText: { fontSize: FontSize.sm, color: Colors.textPrimary },
  safe: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  navBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.background,
  },
  navTitle: { fontFamily: Fonts.display, fontSize: FontSize.lg, color: Colors.textPrimary, flex: 1, textAlign: 'center' },
  content: { paddingBottom: Spacing['3xl'] },
  hero: {
    marginHorizontal: Spacing.lg,
    borderRadius: Radius['2xl'],
    overflow: 'hidden',
    padding: Spacing['2xl'],
    paddingTop: Spacing['3xl'],
    gap: Spacing.sm,
    minHeight: 190,
    justifyContent: 'flex-end',
  },
  heroArt: { position: 'absolute', right: -6, top: 12 },
  destBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.surface,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  destText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.primaryDark, flexShrink: 1 },
  heroName: { fontFamily: Fonts.displayHeavy, fontSize: 30, color: Colors.white, lineHeight: 36 },
  heroMeta: { fontSize: FontSize.md, color: 'rgba(255,255,255,0.92)', fontWeight: FontWeight.medium },
  ownerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    padding: Spacing.lg,
    gap: Spacing.md,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    ...Shadow.sm,
  },
  ownerInfo: { flex: 1 },
  ownerName: { fontFamily: Fonts.display, fontSize: FontSize.lg, color: Colors.textPrimary },
  ownerLabel: { fontSize: FontSize.sm, color: Colors.textSecondary },
  section: { marginHorizontal: Spacing.lg, marginTop: Spacing.xl },
  sectionLabel: { fontFamily: Fonts.display, fontSize: FontSize.lg, color: Colors.textPrimary, marginBottom: Spacing.sm },
  sectionCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: Spacing.lg,
    gap: Spacing.md,
    ...Shadow.sm,
  },
  bodyText: { fontSize: FontSize.md, color: Colors.textPrimary, lineHeight: 22 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  membersGrid: { gap: Spacing.sm },
  memberItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  memberName: { flex: 1, fontSize: FontSize.md, color: Colors.textPrimary, fontWeight: FontWeight.medium },
  ownerBadge: { fontSize: FontSize.sm, color: Colors.primaryDark, fontWeight: FontWeight.bold },
  actionsCard: { marginHorizontal: Spacing.lg, marginTop: Spacing.lg },
  emptyTitle: { fontFamily: Fonts.display, fontSize: FontSize.xl, color: Colors.textPrimary },
});
