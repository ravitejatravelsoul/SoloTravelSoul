import { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Avatar } from '@/components/ui';
import {
  subscribeTripJoinRequestsForOwner,
  subscribeGroupJoinRequestsForOwner,
  approveTripJoinRequest,
  rejectTripJoinRequest,
  approveGroupJoinRequest,
  rejectGroupJoinRequest,
} from '@solotravelsoul/firebase';
import type { TripJoinRequest, CommunityGroupJoinRequest } from '@solotravelsoul/shared';
import { useAuthStore } from '@/stores/authStore';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { formatDistanceToNowStrict } from 'date-fns';

type SectionItem =
  | ({ kind: 'trip' } & TripJoinRequest)
  | ({ kind: 'group' } & CommunityGroupJoinRequest);

function RequestCard({
  item,
  onApprove,
  onReject,
}: {
  item: SectionItem;
  onApprove: () => void;
  onReject: () => void;
}) {
  const name = item.requestorName;
  const photo = item.requestorPhotoURL;
  const bio = item.kind === 'trip' ? (item as TripJoinRequest).requestorBio : undefined;
  const message = item.message;
  const date = item.createdAt;

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Avatar uri={photo} initials={(name[0] ?? '?').toUpperCase()} size={44} />
        <View style={styles.cardInfo}>
          <Text style={styles.requesterName}>{name}</Text>
          <Text style={styles.requesterTime}>
            {formatDistanceToNowStrict(date, { addSuffix: true })}
          </Text>
        </View>
      </View>
      {bio ? <Text style={styles.bio} numberOfLines={2}>{bio}</Text> : null}
      {message ? <Text style={styles.message}>"{message}"</Text> : null}
      <View style={styles.actions}>
        <TouchableOpacity style={[styles.btn, styles.rejectBtn]} onPress={onReject} activeOpacity={0.8}>
          <Text style={[styles.btnLabel, styles.rejectLabel]}>Reject</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.approveBtn]} onPress={onApprove} activeOpacity={0.8}>
          <Text style={[styles.btnLabel, styles.approveLabel]}>Approve</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {count > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{count}</Text>
        </View>
      )}
    </View>
  );
}

export default function MyRequestsScreen() {
  const uid = useAuthStore((s) => s.user?.uid ?? '');
  const [tripRequests, setTripRequests] = useState<TripJoinRequest[]>([]);
  const [groupRequests, setGroupRequests] = useState<CommunityGroupJoinRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) return;
    let tripLoaded = false;
    let groupLoaded = false;

    const done = () => {
      if (tripLoaded && groupLoaded) setLoading(false);
    };

    const unsub1 = subscribeTripJoinRequestsForOwner(uid, (reqs) => {
      setTripRequests(reqs);
      tripLoaded = true;
      done();
    });
    const unsub2 = subscribeGroupJoinRequestsForOwner(uid, (reqs) => {
      setGroupRequests(reqs);
      groupLoaded = true;
      done();
    });
    return () => { unsub1(); unsub2(); };
  }, [uid]);

  // Group trip requests by tripTitle
  const tripsByTitle = tripRequests.reduce<Record<string, TripJoinRequest[]>>((acc, r) => {
    const key = r.tripTitle || r.tripId;
    (acc[key] ??= []).push(r);
    return acc;
  }, {});

  // Group group requests by groupName
  const groupsByName = groupRequests.reduce<Record<string, CommunityGroupJoinRequest[]>>((acc, r) => {
    const key = r.groupName || r.groupId;
    (acc[key] ??= []).push(r);
    return acc;
  }, {});

  const sections = [
    ...Object.entries(tripsByTitle).map(([title, reqs]) => ({
      kind: 'trip' as const,
      title,
      tripId: reqs[0].tripId,
      data: reqs.map((r) => ({ kind: 'trip' as const, ...r })) as SectionItem[],
    })),
    ...Object.entries(groupsByName).map(([name, reqs]) => ({
      kind: 'group' as const,
      title: name,
      groupId: reqs[0].groupId,
      data: reqs.map((r) => ({ kind: 'group' as const, ...r })) as SectionItem[],
    })),
  ];

  const totalPending = tripRequests.length + groupRequests.length;

  const handleApprove = (item: SectionItem) => {
    const label = item.kind === 'trip'
      ? `Approve ${item.requestorName}'s trip request?`
      : `Add ${item.requestorName} to the group?`;
    Alert.alert('Approve?', label, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Approve',
        onPress: async () => {
          try {
            if (item.kind === 'trip') {
              const req = item as TripJoinRequest & { kind: 'trip' };
              await approveTripJoinRequest(req.requestId, req.tripId, uid, {
                requestorUid: req.requestorUid,
                requestorName: req.requestorName,
                requestorPhotoURL: req.requestorPhotoURL,
              });
            } else {
              const req = item as CommunityGroupJoinRequest & { kind: 'group' };
              await approveGroupJoinRequest(req.requestId, req.groupId, {
                requestorUid: req.requestorUid,
                requestorName: req.requestorName,
                requestorPhotoURL: req.requestorPhotoURL,
              });
            }
          } catch (err) {
            Alert.alert('Error', (err as Error).message ?? 'Could not approve. Please try again.');
          }
        },
      },
    ]);
  };

  const handleReject = (item: SectionItem) => {
    Alert.alert(
      'Reject request?',
      `Decline ${item.requestorName}'s request?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            try {
              if (item.kind === 'trip') {
                await rejectTripJoinRequest(item.requestId, uid);
              } else {
                await rejectGroupJoinRequest(item.requestId, uid);
              }
            } catch {
              Alert.alert('Error', 'Could not reject. Please try again.');
            }
          },
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
        <View style={styles.navCenter}>
          <Text style={styles.navTitle}>My Requests</Text>
          {totalPending > 0 && (
            <View style={styles.navBadge}>
              <Text style={styles.navBadgeText}>{totalPending}</Text>
            </View>
          )}
        </View>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : sections.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="checkmark-circle-outline" size={56} color={Colors.success} />
          <Text style={styles.emptyTitle}>All clear!</Text>
          <Text style={styles.emptySubtitle}>
            No pending join requests for your trips or groups.
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.requestId}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.md }} />}
          renderSectionHeader={({ section }) => (
            <SectionHeader
              title={
                section.kind === 'trip'
                  ? `✈ ${section.title}`
                  : `👥 ${section.title}`
              }
              count={section.data.length}
            />
          )}
          renderSectionFooter={() => <View style={{ height: Spacing.xl }} />}
          renderItem={({ item }) => (
            <RequestCard
              item={item}
              onApprove={() => handleApprove(item)}
              onReject={() => handleReject(item)}
            />
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
  navCenter: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  navTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  navBadge: {
    backgroundColor: Colors.error,
    borderRadius: Radius.full,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  navBadgeText: { fontSize: 11, fontWeight: FontWeight.bold, color: Colors.white },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, padding: Spacing['2xl'] },
  emptyTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  emptySubtitle: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  list: { paddingBottom: Spacing['3xl'] },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.sm,
  },
  sectionTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary, flex: 1 },
  badge: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: { fontSize: 11, fontWeight: FontWeight.bold, color: Colors.white },
  card: {
    marginHorizontal: Spacing.lg,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  cardInfo: { flex: 1 },
  requesterName: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  requesterTime: { fontSize: FontSize.xs, color: Colors.placeholder, marginTop: 2 },
  bio: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 18 },
  message: { fontSize: FontSize.sm, color: Colors.textSecondary, fontStyle: 'italic', lineHeight: 20 },
  actions: { flexDirection: 'row', gap: Spacing.md },
  btn: { flex: 1, paddingVertical: Spacing.sm + 2, borderRadius: Radius.md, borderWidth: 1, alignItems: 'center' },
  btnLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  rejectBtn: { borderColor: Colors.error + '50', backgroundColor: Colors.error + '08' },
  rejectLabel: { color: Colors.error },
  approveBtn: { backgroundColor: Colors.success, borderColor: Colors.success },
  approveLabel: { color: Colors.white },
});
