import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  searchUserByEmail,
  createGroup,
  sendGroupMessage,
} from '@solotravelsoul/firebase';
import { getUserInitials } from '@solotravelsoul/shared';
import { useAuthStore } from '@/stores/authStore';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '@/constants/theme';
import type { UserLookup, ChatParticipantInfo } from '@solotravelsoul/shared';

function generateClientId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export default function NewGroupScreen() {
  const router = useRouter();
  const { top } = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);

  const [groupName, setGroupName] = useState('');
  const [memberEmail, setMemberEmail] = useState('');
  const [members, setMembers] = useState<UserLookup[]>([]);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleAddMember = useCallback(async () => {
    const trimmed = memberEmail.trim().toLowerCase();
    if (!trimmed) return;
    if (!trimmed.includes('@')) { setSearchError('Enter a valid email.'); return; }
    if (trimmed === user?.email?.toLowerCase()) { setSearchError("That's your own email."); return; }
    if (members.some((m) => m.email === trimmed)) { setSearchError('Already added.'); return; }

    setSearching(true);
    setSearchError(null);
    try {
      const found = await searchUserByEmail(trimmed);
      if (found) {
        setMembers((prev) => [...prev, found]);
        setMemberEmail('');
      } else {
        setSearchError('No account found with that email.');
      }
    } catch {
      setSearchError('Search failed. Try again.');
    } finally {
      setSearching(false);
    }
  }, [memberEmail, user?.email, members]);

  const removeMember = useCallback((uid: string) => {
    setMembers((prev) => prev.filter((m) => m.uid !== uid));
  }, []);

  const handleCreate = useCallback(async () => {
    if (!user || !groupName.trim()) return;
    if (members.length === 0) { setCreateError('Add at least one member.'); return; }

    setCreating(true);
    setCreateError(null);

    try {
      const myName = profile?.name ?? user.email ?? 'Traveler';
      const myInitials = getUserInitials(myName) || myName[0]?.toUpperCase() || 'T';
      const allMembers = [user.uid, ...members.map((m) => m.uid)];
      const memberInfo: Record<string, ChatParticipantInfo> = {
        [user.uid]: { name: myName, initials: myInitials },
      };
      members.forEach((m) => {
        memberInfo[m.uid] = { name: m.displayName, initials: m.initials };
      });

      const groupId = await createGroup(user.uid, groupName.trim(), allMembers, memberInfo);

      // Post system message
      await sendGroupMessage(
        groupId,
        user.uid,
        myName,
        `${myName} created the group`,
        generateClientId(),
        'system',
      );

      router.replace(`/groups/${groupId}/chat`);
    } catch {
      setCreateError('Could not create group. Please try again.');
      setCreating(false);
    }
  }, [user, profile, groupName, members, router]);

  const canCreate = groupName.trim().length > 0 && members.length > 0 && !creating;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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

        {/* Add members */}
        <Text style={[styles.label, { marginTop: Spacing.lg }]}>Add members by email</Text>
        <View style={styles.searchRow}>
          <TextInput
            style={styles.input}
            value={memberEmail}
            onChangeText={(t) => { setMemberEmail(t); setSearchError(null); }}
            placeholder="friend@explorer.com"
            placeholderTextColor={Colors.placeholder}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={handleAddMember}
          />
          <TouchableOpacity
            style={[styles.addBtn, searching && { opacity: 0.7 }]}
            onPress={handleAddMember}
            disabled={searching}
          >
            {searching
              ? <ActivityIndicator color={Colors.white} size="small" />
              : <Ionicons name="add" size={22} color={Colors.white} />
            }
          </TouchableOpacity>
        </View>
        {searchError && <Text style={styles.errorText}>{searchError}</Text>}

        {/* Member list */}
        {members.length > 0 && (
          <View style={styles.membersList}>
            {members.map((m) => (
              <View key={m.uid} style={styles.memberRow}>
                <View style={styles.memberAvatar}>
                  <Text style={styles.memberInitials}>{m.initials}</Text>
                </View>
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>{m.displayName}</Text>
                  <Text style={styles.memberEmail}>{m.email}</Text>
                </View>
                <TouchableOpacity onPress={() => removeMember(m.uid)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={22} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {createError && <Text style={[styles.errorText, { marginTop: Spacing.md }]}>{createError}</Text>}
      </ScrollView>
    </KeyboardAvoidingView>
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
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary },
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
