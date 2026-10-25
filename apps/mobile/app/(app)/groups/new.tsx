import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  createGroup,
  inviteToGroup,
  sendGroupMessage,
} from '@solotravelsoul/firebase';
import { getUserInitials } from '@solotravelsoul/shared';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { Colors, FontSize, FontWeight, Radius, Spacing, Fonts } from '@/constants/theme';
import { KeyboardAvoid } from '@/components/ui/KeyboardAvoid';

function generateClientId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_INVITES = 20;

export default function NewGroupScreen() {
  const router = useRouter();
  const { top } = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);

  const [groupName, setGroupName] = useState('');
  const [memberEmail, setMemberEmail] = useState('');
  const [emails, setEmails] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  // Invitations are addressed to an e-mail address and nothing is looked up: this screen cannot tell whether an
  // address has an account, and nobody is added to the group until they accept.
  const handleAddEmail = useCallback(() => {
    const trimmed = memberEmail.trim().toLowerCase();
    if (!trimmed) return;
    if (!EMAIL_PATTERN.test(trimmed)) { setEmailError('Enter a valid email.'); return; }
    if (trimmed === user?.email?.toLowerCase()) { setEmailError("That's your own email."); return; }
    if (emails.includes(trimmed)) { setEmailError('Already on the list.'); return; }
    if (emails.length >= MAX_INVITES) { setEmailError(`You can invite up to ${MAX_INVITES} people at a time.`); return; }
    setEmails((prev) => [...prev, trimmed]);
    setMemberEmail('');
    setEmailError(null);
  }, [memberEmail, user?.email, emails]);

  const removeEmail = useCallback((email: string) => {
    setEmails((prev) => prev.filter((e) => e !== email));
  }, []);

  const handleCreate = useCallback(async () => {
    if (!user || !groupName.trim()) return;
    if (emails.length === 0) { setCreateError('Add at least one email to invite.'); return; }

    setCreating(true);
    setCreateError(null);

    try {
      const myName = profile?.name ?? user.email ?? 'Traveler';
      const myInitials = getUserInitials(myName) || myName[0]?.toUpperCase() || 'T';
      const name = groupName.trim();
      const groupId = await createGroup(user.uid, name, { name: myName, initials: myInitials });

      await sendGroupMessage(groupId, user.uid, myName, `${myName} created the group`, generateClientId(), 'system').catch(() => {});

      const results = await Promise.allSettled(emails.map((email) => inviteToGroup({ id: groupId, name }, { uid: user.uid, name: myName }, email)));
      const failed = results.filter((r) => r.status === 'rejected').length;
      useUIStore.getState().addToast(
        failed === 0
          ? `Invitations sent. Anyone with an account at those addresses will see an invitation in their Chats and joins only if they accept.`
          : `${emails.length - failed} of ${emails.length} invitations sent. You can invite the others from Group Info.`,
        failed === 0 ? 'success' : 'error',
      );
      router.replace(`/groups/${groupId}/chat`);
    } catch {
      setCreateError('Could not create group. Please try again.');
      setCreating(false);
    }
  }, [user, profile, groupName, emails, router]);

  const canCreate = groupName.trim().length > 0 && emails.length > 0 && !creating;

  return (
    <KeyboardAvoid
      style={styles.root}
      behavior="padding"
    >
      <View style={[styles.header, { paddingTop: top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>New Group</Text>
        <TouchableOpacity
          onPress={handleCreate}
          disabled={!canCreate}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          {creating
            ? <ActivityIndicator color={Colors.primary} size="small" />
            : <Text style={[styles.createText, !canCreate && styles.createTextDisabled]}>Create</Text>
          }
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {/* Group name */}
        <Text style={styles.label}>Group name</Text>
        <TextInput
          style={styles.input}
          value={groupName}
          onChangeText={setGroupName}
          placeholder="Weekend Wanderers"
          placeholderTextColor={Colors.placeholder}
          maxLength={60}
          returnKeyType="next"
        />

        {/* Invite people */}
        <Text style={[styles.label, { marginTop: Spacing.lg }]}>Invite people by email</Text>
        <Text style={styles.hint}>They are added only if they accept. You will not be told whether an address has an account.</Text>
        <View style={styles.searchRow}>
          <TextInput
            style={styles.input}
            value={memberEmail}
            onChangeText={(t) => { setMemberEmail(t); setEmailError(null); }}
            placeholder="friend@explorer.com"
            placeholderTextColor={Colors.placeholder}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={handleAddEmail}
          />
          <TouchableOpacity style={styles.addBtn} onPress={handleAddEmail} accessibilityRole="button" accessibilityLabel="Add email">
            <Ionicons name="add" size={22} color={Colors.white} />
          </TouchableOpacity>
        </View>
        {emailError && <Text style={styles.errorText}>{emailError}</Text>}

        {emails.length > 0 && (
          <View style={styles.membersList}>
            {emails.map((email) => (
              <View key={email} style={styles.memberRow}>
                <View style={styles.memberAvatar}>
                  <Ionicons name="mail-outline" size={18} color={Colors.white} />
                </View>
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>{email}</Text>
                  <Text style={styles.memberEmail}>Invitation</Text>
                </View>
                <TouchableOpacity onPress={() => removeEmail(email)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel={`Remove ${email}`}>
                  <Ionicons name="close-circle" size={22} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {createError && <Text style={[styles.errorText, { marginTop: Spacing.md }]}>{createError}</Text>}
      </ScrollView>
    </KeyboardAvoid>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: Spacing.md,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.background,
  },
  title: { fontFamily: Fonts.display, fontSize: FontSize.lg, color: Colors.textPrimary },
  createText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.primary },
  createTextDisabled: { color: Colors.placeholder },
  body: { padding: Spacing.lg, gap: Spacing.sm, paddingBottom: 40 },
  label: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textSecondary },
  input: {
    flex: 1,
    height: 48,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
  },
  searchRow: { flexDirection: 'row', gap: Spacing.sm },
  addBtn: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: { fontSize: FontSize.xs, color: Colors.textSecondary },
  errorText: { fontSize: FontSize.xs, color: Colors.error },
  membersList: { gap: Spacing.sm, marginTop: Spacing.sm },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    gap: Spacing.sm,
  },
  memberAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberInitials: { color: Colors.white, fontWeight: FontWeight.bold, fontSize: FontSize.sm },
  memberInfo: { flex: 1 },
  memberName: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.textPrimary },
  memberEmail: { fontSize: FontSize.xs, color: Colors.textSecondary },
});
