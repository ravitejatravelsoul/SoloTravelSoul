import { View, StyleSheet, FlatList, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Avatar } from '@/components/ui';
import { useOwnerGroupJoinRequests } from '@/hooks/useGroupJoinRequests';
import type { CommunityGroupJoinRequest } from '@solotravelsoul/shared';
import { useAuthStore } from '@/stores/authStore';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { formatDistanceToNowStrict } from 'date-fns';

export default function GroupRequestsScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const uid = useAuthStore((s) => s.user?.uid ?? '');
  const { received: allRequests, loading, approve, reject } = useOwnerGroupJoinRequests(uid);

  const requests = allRequests.filter((r) => r.groupId === groupId);

  const handleApprove = (req: CommunityGroupJoinRequest) => {
    Alert.alert(
      'Approve request?',
      `Add ${req.requestorName} to ${req.groupName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: () =>
            approve(req).catch((err: Error) =>
              Alert.alert('Error', err.message ?? 'Could not approve. Please try again.')
            ),
        },
      ]
    );
  };

  const handleReject = (req: CommunityGroupJoinRequest) => {
    Alert.alert(
      'Reject request?',
      `Decline ${req.requestorName}'s request?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: () =>
            reject(req.requestId).catch(() =>
              Alert.alert('Error', 'Could not reject. Please try again.')
            ),
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>
          Join Requests{requests.length > 0 ? ` (${requests.length})` : ''}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : requests.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="checkmark-circle-outline" size={52} color={Colors.success} />
          <Text style={styles.emptyTitle}>No pending requests</Text>
          <Text style={styles.emptySubtitle}>All caught up!</Text>
        </View>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(r) => r.requestId}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.md }} />}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.requesterRow}>
                <Avatar
                  uri={item.requestorPhotoURL}
                  initials={(item.requestorName[0] ?? '?').toUpperCase()}
                  size={44}
                />
                <View style={styles.requesterInfo}>
                  <Text style={styles.requesterName}>{item.requestorName}</Text>
                  <Text style={styles.requesterTime}>
                    {formatDistanceToNowStrict(item.createdAt, { addSuffix: true })}
                  </Text>
                </View>
              </View>
              {item.message ? (
                <Text style={styles.message}>&ldquo;{item.message}&rdquo;</Text>
              ) : null}
              <View style={styles.actionsRow}>
                <TouchableOpacity
                  style={[styles.btn, styles.rejectBtn]}
                  onPress={() => handleReject(item)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.btnLabel, styles.rejectLabel]}>Reject</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btn, styles.approveBtn]}
                  onPress={() => handleApprove(item)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.btnLabel, styles.approveLabel]}>Approve</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
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
  navTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, padding: Spacing['2xl'] },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.semibold, color: Colors.textPrimary, textAlign: 'center' },
  emptySubtitle: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center' },
  list: { padding: Spacing.lg, paddingBottom: Spacing['3xl'] },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  requesterRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  requesterInfo: { flex: 1 },
  requesterName: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  requesterTime: { fontSize: FontSize.xs, color: Colors.placeholder, marginTop: 2 },
  message: { fontSize: FontSize.sm, color: Colors.textSecondary, fontStyle: 'italic', lineHeight: 20 },
  actionsRow: { flexDirection: 'row', gap: Spacing.md },
  btn: { flex: 1, paddingVertical: Spacing.sm + 2, borderRadius: Radius.md, borderWidth: 1, alignItems: 'center' },
  btnLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  rejectBtn: { borderColor: Colors.error + '50', backgroundColor: Colors.error + '08' },
  rejectLabel: { color: Colors.error },
  approveBtn: { backgroundColor: Colors.success, borderColor: Colors.success },
  approveLabel: { color: Colors.white },
});
