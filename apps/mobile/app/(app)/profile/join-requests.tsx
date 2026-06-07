import { useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@/components/ui';
import { SentRequestCard, ReceivedRequestCard } from '@/components/community/JoinRequestCard';
import { useMyJoinRequests, useOwnerJoinRequests } from '@/hooks/useTripJoinRequest';
import { useAuthStore } from '@/stores/authStore';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

type Tab = 'sent' | 'received';

export default function JoinRequestsScreen() {
  const uid = useAuthStore((s) => s.user?.uid ?? '');
  const [activeTab, setActiveTab] = useState<Tab>('sent');

  const { sent, loading: sentLoading, cancel } = useMyJoinRequests(uid);
  const { received, loading: receivedLoading, approve, reject } = useOwnerJoinRequests(uid);

  const handleApprove = (req: (typeof received)[0]) => {
    Alert.alert(
      'Approve request?',
      `Approve ${req.requestorName}'s request to join ${req.tripTitle}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Approve', onPress: () => approve(req) },
      ]
    );
  };

  const handleReject = (req: (typeof received)[0]) => {
    reject(req.requestId, req.ownerUid);
  };

  const handleCancel = (req: (typeof sent)[0]) => {
    Alert.alert('Cancel request?', undefined, [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Cancel request', style: 'destructive', onPress: () => cancel(req.requestId, uid) },
    ]);
  };

  const loading = activeTab === 'sent' ? sentLoading : receivedLoading;
  const data = activeTab === 'sent' ? sent : received;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Join Requests</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'sent' && styles.tabActive]}
          onPress={() => setActiveTab('sent')}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabLabel, activeTab === 'sent' && styles.tabLabelActive]}>
            Sent ({sent.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'received' && styles.tabActive]}
          onPress={() => setActiveTab('received')}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabLabel, activeTab === 'received' && styles.tabLabelActive]}>
            Received {received.length > 0 ? `(${received.length})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : data.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="paper-plane-outline" size={52} color={Colors.placeholder} />
          <Text style={styles.emptyTitle}>
            {activeTab === 'sent' ? 'No requests sent yet' : 'No requests received'}
          </Text>
          <Text style={styles.emptySubtitle}>
            {activeTab === 'sent'
              ? 'Explore public trips and request to join one.'
              : 'Make your trips public to receive join requests.'}
          </Text>
          {activeTab === 'sent' && (
            <TouchableOpacity
              style={styles.browseBtn}
              onPress={() => router.push('/(app)/discover/trips' as never)}
              activeOpacity={0.7}
            >
              <Text style={styles.browseBtnLabel}>Browse Public Trips</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={activeTab === 'sent' ? sent : received}
          keyExtractor={(r) => r.requestId}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.md }} />}
          renderItem={({ item }) =>
            activeTab === 'sent' ? (
              <SentRequestCard
                request={item}
                onCancel={item.status === 'pending' ? () => handleCancel(item) : undefined}
                onViewTrip={item.status === 'approved' ? () => router.push(`/(app)/trips/${item.tripId}` as never) : undefined}
              />
            ) : (
              <ReceivedRequestCard
                request={item}
                onApprove={() => handleApprove(item)}
                onReject={() => handleReject(item)}
              />
            )
          }
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
  emptySubtitle: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  browseBtn: {
    marginTop: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
  },
  browseBtnLabel: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.white },
  list: { padding: Spacing.lg, paddingBottom: Spacing['3xl'] },
});
