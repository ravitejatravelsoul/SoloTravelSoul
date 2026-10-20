import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getGroup, leaveChatGroup, inviteToGroup, cancelGroupInvite, subscribeToGroupInvitesSent } from '@solotravelsoul/firebase';
import { useAuthStore } from '@/stores/authStore';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '@/constants/theme';
import { format } from 'date-fns';
import type { TravelGroup, GroupInvite } from '@solotravelsoul/shared';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The creator invites people by e-mail address and can withdraw invitations that are still pending. */
function InvitePanel({ group, uid, myName }: { group: TravelGroup; uid: string; myName: string }) {
  const [invites, setInvites] = useState<GroupInvite[]>([]);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => subscribeToGroupInvitesSent(group.id, uid, setInvites), [group.id, uid]);

  const send = useCallback(async () => {
    const trimmed = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(trimmed)) { setMessage({ text: 'Enter a valid email.', error: true }); return; }
    setBusy(true);
    setMessage(null);
    try {
      await inviteToGroup({ id: group.id, name: group.name }, { uid, name: myName }, trimmed);
      setEmail('');
      setMessage({ text: 'Invitation sent. They join only if they accept.', error: false });
    } catch {
      setMessage({ text: 'Could not send that invitation. It may already be answered, or you may be offline.', error: true });
    } finally {
      setBusy(false);
    }
  }, [email, group.id, group.name, uid, myName]);

  const cancel = useCallback(async (inviteId: string) => {
    try {
      await cancelGroupInvite(inviteId);
    } catch {
      setMessage({ text: 'Could not withdraw the invitation. Try again.', error: true });
    }
  }, []);

  const now = Date.now();
  const pending = invites.filter((i) => i.status === 'pending' && i.expiresAt.getTime() > now);

  return (
    <View style={{ gap: Spacing.sm }}>
      <Text style={styles.sectionLabel}>Invite people</Text>
      <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
        <TextInput
          style={styles.inviteInput}
          value={email}
          onChangeText={(t) => { setEmail(t); setMessage(null); }}
          placeholder="friend@explorer.com"
          placeholderTextColor={Colors.placeholder}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Email to invite"
        />
        <TouchableOpacity style={[styles.inviteBtn, busy && { opacity: 0.6 }]} onPress={send} disabled={busy} accessibilityRole="button" accessibilityLabel="Send invitation">
          {busy ? <ActivityIndicator color={Colors.white} size="small" /> : <Text style={styles.inviteBtnText}>Invite</Text>}
        </TouchableOpacity>
      </View>
      <Text style={styles.inviteHint}>You will not be told whether an address has an account. People are added only if they accept.</Text>
      {message && <Text style={[styles.inviteHint, message.error && { color: Colors.error }]}>{message.text}</Text>}
      {pending.length > 0 && (
        <View style={styles.membersCard}>
          {pending.map((invite, i) => (
            <View key={invite.id}>
              {i > 0 && <View style={styles.memberDivider} />}
              <View style={styles.memberRow}>
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName} numberOfLines={1}>{invite.inviteeEmail}</Text>
                  <Text style={styles.memberRole}>Invitation pending</Text>
                </View>
                <TouchableOpacity onPress={() => cancel(invite.id)} accessibilityRole="button" accessibilityLabel={`Withdraw invitation to ${invite.inviteeEmail}`} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={styles.withdrawText}>Withdraw</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export default function GroupDetailScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();
  const uid = useAuthStore((s) => s.user?.uid ?? '');
  const myName = useAuthStore((s) => s.profile?.name ?? 'A member');

  const [group, setGroup] = useState<TravelGroup | null>(null);
  const [loading, setLoading] = useState(true);
  const [leaving, setLeaving] = useState(false);

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

  const confirmLeave = () => {
    Alert.alert('Leave this group?', 'You will stop receiving its messages and will no longer see the chat. Nobody can add you back without a new invitation that you choose to accept, and you can block someone if their invitations are unwanted.', [
      { text: 'Stay', style: 'cancel' },
      {
        text: 'Leave group',
        style: 'destructive',
        onPress: async () => {
          setLeaving(true);
          try {
            await leaveChatGroup(group.id, uid, myName);
            router.replace('/(app)/chats' as never);
          } catch {
            setLeaving(false);
            Alert.alert('Could not leave', 'Please check your connection and try again.');
          }
        },
      },
    ]);
  };

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

        {isCreator && <InvitePanel group={group} uid={uid} myName={myName} />}

        {/* Leave (the admin who created the group cannot leave yet) */}
        {!isCreator && group.members.includes(uid) && (
          <TouchableOpacity style={styles.leaveBtn} onPress={confirmLeave} disabled={leaving} accessibilityRole="button" accessibilityLabel="Leave group" activeOpacity={0.75}>
            {leaving ? <ActivityIndicator color={Colors.error} /> : (
              <>
                <Ionicons name="exit-outline" size={20} color={Colors.error} />
                <Text style={styles.leaveText}>Leave group</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  inviteInput: { flex: 1, height: 48, backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md, fontSize: FontSize.sm, color: Colors.textPrimary },
  inviteBtn: { minWidth: 72, height: 48, borderRadius: Radius.md, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.md },
  inviteBtnText: { color: Colors.white, fontWeight: FontWeight.semibold, fontSize: FontSize.sm },
  inviteHint: { fontSize: FontSize.xs, color: Colors.textSecondary },
  withdrawText: { fontSize: FontSize.sm, color: Colors.error, fontWeight: FontWeight.semibold },
  leaveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, marginTop: Spacing['2xl'], minHeight: 48, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.error + '60' },
  leaveText: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.error },
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
