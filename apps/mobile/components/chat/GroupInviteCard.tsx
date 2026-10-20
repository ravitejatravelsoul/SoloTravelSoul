import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { acceptGroupInvite, declineGroupInvite } from '@solotravelsoul/firebase';
import { getUserInitials } from '@solotravelsoul/shared';
import type { GroupInvite } from '@solotravelsoul/shared';
import { useAuthStore } from '@/stores/authStore';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '@/constants/theme';

/** A group chat invitation the person can accept or decline. Nothing happens to them until they choose. */
export function GroupInviteCard({ invite }: { invite: GroupInvite }) {
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const respond = async (choice: 'accept' | 'decline') => {
    if (!user || busy) return;
    setBusy(choice);
    setError(null);
    try {
      if (choice === 'accept') {
        const name = profile?.name ?? user.email ?? 'Traveler';
        await acceptGroupInvite(invite, { uid: user.uid, info: { name, initials: getUserInitials(name) || name[0]?.toUpperCase() || 'T' } });
      } else {
        await declineGroupInvite(invite.id);
      }
      // The invitation disappears from the list through the live subscription.
    } catch {
      setError(choice === 'accept'
        ? 'Could not join. The invitation may have expired or been withdrawn, the group may no longer be available, or you may be offline.'
        : 'Could not decline. Check your connection and try again.');
      setBusy(null);
    }
  };

  return (
    <View style={styles.card} accessibilityLabel={`Invitation to ${invite.groupName}`}>
      <Text style={styles.title} numberOfLines={2}>{invite.groupName}</Text>
      <Text style={styles.meta}>
        {invite.inviterName} invited you to this group chat. You are not in it unless you accept.
      </Text>
      <View style={styles.row}>
        <TouchableOpacity style={[styles.btn, styles.decline]} onPress={() => respond('decline')} disabled={!!busy} accessibilityRole="button" accessibilityLabel="Decline invitation">
          {busy === 'decline' ? <ActivityIndicator color={Colors.textSecondary} size="small" /> : <Text style={styles.declineText}>Decline</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.accept]} onPress={() => respond('accept')} disabled={!!busy} accessibilityRole="button" accessibilityLabel="Accept invitation">
          {busy === 'accept' ? <ActivityIndicator color={Colors.white} size="small" /> : <Text style={styles.acceptText}>Accept</Text>}
        </TouchableOpacity>
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: Colors.surface, marginHorizontal: Spacing.lg, marginTop: Spacing.sm, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.sm },
  title: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  meta: { fontSize: FontSize.sm, color: Colors.textSecondary },
  row: { flexDirection: 'row', gap: Spacing.sm },
  btn: { flex: 1, minHeight: 44, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  decline: { borderWidth: 1, borderColor: Colors.border },
  accept: { backgroundColor: Colors.primary },
  declineText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textSecondary },
  acceptText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.white },
  error: { fontSize: FontSize.xs, color: Colors.error },
});
