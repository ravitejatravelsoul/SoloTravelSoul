import { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@/components/ui';
import { ReceivedRequestCard } from '@/components/community/JoinRequestCard';
import { subscribeRequestsForTrip, approveTripJoinRequest, rejectTripJoinRequest } from '@solotravelsoul/firebase';
import type { TripJoinRequest, RequestStatus } from '@solotravelsoul/shared';
import { useAuthStore } from '@/stores/authStore';
import { useTripStore } from '@/stores/tripStore';
import { Colors, Spacing, FontSize, FontWeight } from '@/constants/theme';

type Filter = 'pending' | 'approved' | 'all';

export default function TripRequestsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const uid = useAuthStore((s) => s.user?.uid ?? '');
  const trip = useTripStore((s) => s.trips.find((t) => t.id === id));
  const [requests, setRequests] = useState<TripJoinRequest[]>([]);
  const [filter, setFilter] = useState<Filter>('pending');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const unsub = subscribeRequestsForTrip(id, (reqs) => {
      setRequests(reqs);
      setLoading(false);
    });
    return unsub;
  }, [id]);

  const filtered = requests.filter((r) => {
    if (filter === 'pending') return r.status === 'pending';
    if (filter === 'approved') return r.status === 'approved';
    return true;
  });

  const handleApprove = (req: TripJoinRequest) => {
    Alert.alert(
      'Approve request?',
      `Approve ${req.requestorName}'s request?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: () => approveTripJoinRequest(req.requestId, req.tripId, uid, {
            requestorUid: req.requestorUid,
            requestorName: req.requestorName,
            requestorPhotoURL: req.requestorPhotoURL,
          }).catch(() => Alert.alert('Error', 'Could not approve. Please try again.')),
        },
      ]
    );
  };

  const handleReject = (req: TripJoinRequest) => {
    rejectTripJoinRequest(req.requestId, uid).catch(() =>
      Alert.alert('Error', 'Could not reject. Please try again.')
    );
  };

  const pendingCount = requests.filter((r) => r.status === 'pending').length;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View>
          <Text style={styles.navTitle}>Join Requests</Text>
          {trip && <Text style={styles.navSubtitle} numberOfLines={1}>{trip.destination}</Text>}
        </View>
        <View style={{ width: 24 }} />
      </View>

      {/* Filter tabs */}
      <View style={styles.tabBar}>
        {(['pending', 'approved', 'all'] as Filter[]).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.tab, filter === f && styles.tabActive]}
            onPress={() => setFilter(f)}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabLabel, filter === f && styles.tabLabelActive]}>
              {f === 'pending' && pendingCount > 0 ? `Pending (${pendingCount})` : f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="checkmark-circle-outline" size={52} color={Colors.success} />
          <Text style={styles.emptyTitle}>
            {filter === 'pending' ? 'No pending requests' : 'Nothing here yet'}
          </Text>
          <Text style={styles.emptySubtitle}>All caught up!</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(r) => r.requestId}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.md }} />}
          renderItem={({ item }) => (
            <ReceivedRequestCard
              request={item}
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
  navTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, textAlign: 'center' },
  navSubtitle: { fontSize: FontSize.xs, color: Colors.textSecondary, textAlign: 'center' },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: Colors.primary },
  tabLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textSecondary },
  tabLabelActive: { color: Colors.primary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing['2xl'], gap: Spacing.md },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.semibold, color: Colors.textPrimary, textAlign: 'center' },
  emptySubtitle: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center' },
  list: { padding: Spacing.lg, paddingBottom: Spacing['3xl'] },
});
