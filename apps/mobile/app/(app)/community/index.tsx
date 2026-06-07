import { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@/components/ui';
import {
  subscribeTripJoinRequestsForOwner,
  subscribeGroupJoinRequestsForOwner,
} from '@solotravelsoul/firebase';
import { useAuthStore } from '@/stores/authStore';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/constants/theme';

function FeatureCard({
  icon,
  title,
  subtitle,
  onPress,
  badge,
  comingSoon,
}: {
  icon: string;
  title: string;
  subtitle: string;
  onPress?: () => void;
  badge?: number;
  comingSoon?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.featureCard, comingSoon && styles.featureCardDim]}
      onPress={onPress}
      disabled={!onPress || comingSoon}
      activeOpacity={0.8}
    >
      <View style={styles.featureIcon}>
        <Ionicons name={icon as never} size={28} color={comingSoon ? Colors.placeholder : Colors.primary} />
      </View>
      <View style={styles.featureText}>
        <View style={styles.featureTitleRow}>
          <Text style={[styles.featureTitle, comingSoon && { color: Colors.textSecondary }]}>{title}</Text>
          {comingSoon && (
            <View style={styles.soonBadge}>
              <Text style={styles.soonLabel}>Soon</Text>
            </View>
          )}
          {badge !== undefined && badge > 0 && (
            <View style={styles.pendingBadge}>
              <Text style={styles.pendingBadgeText}>{badge}</Text>
            </View>
          )}
        </View>
        <Text style={styles.featureSubtitle}>{subtitle}</Text>
      </View>
      {!comingSoon && <Ionicons name="chevron-forward" size={18} color={Colors.placeholder} />}
    </TouchableOpacity>
  );
}

export default function CommunityScreen() {
  const uid = useAuthStore((s) => s.user?.uid ?? '');
  const [pendingTripCount, setPendingTripCount] = useState(0);
  const [pendingGroupCount, setPendingGroupCount] = useState(0);

  useEffect(() => {
    if (!uid) return;
    const unsub1 = subscribeTripJoinRequestsForOwner(uid, (reqs) => setPendingTripCount(reqs.length));
    const unsub2 = subscribeGroupJoinRequestsForOwner(uid, (reqs) => setPendingGroupCount(reqs.length));
    return () => { unsub1(); unsub2(); };
  }, [uid]);

  const totalPending = pendingTripCount + pendingGroupCount;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.navBar}>
        <Text style={styles.navTitle}>Community</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Owner dashboard — only shown when there are pending requests */}
        {totalPending > 0 && (
          <>
            <Text style={styles.sectionLabel}>ACTION NEEDED</Text>
            <View style={styles.card}>
              <FeatureCard
                icon="notifications"
                title="Pending Requests"
                subtitle="Review join requests for your trips and groups"
                onPress={() => router.push('/(app)/community/my-requests' as never)}
                badge={totalPending}
              />
            </View>
          </>
        )}

        <Text style={styles.sectionLabel}>MANAGE</Text>
        <View style={styles.card}>
          <FeatureCard
            icon="shield-checkmark"
            title="My Requests"
            subtitle="Approve or reject join requests for your trips and groups"
            onPress={() => router.push('/(app)/community/my-requests' as never)}
            badge={totalPending}
          />
        </View>

        <Text style={styles.sectionLabel}>TRAVEL GROUPS</Text>
        <View style={styles.card}>
          <FeatureCard
            icon="people"
            title="Travel Groups"
            subtitle="Discover and join groups traveling to your destination"
            onPress={() => router.push('/(app)/community/groups' as never)}
          />
        </View>

        <Text style={styles.sectionLabel}>EXPLORE</Text>
        <View style={styles.card}>
          <FeatureCard
            icon="map"
            title="Public Trips"
            subtitle="Browse trips and request to join as a co-traveler"
            onPress={() => router.push('/(app)/discover/trips' as never)}
          />
        </View>

        <Text style={styles.sectionLabel}>DISCOVER</Text>
        <View style={styles.card}>
          <FeatureCard
            icon="location"
            title="Nearby Travelers"
            subtitle="Find travelers visiting the same destination"
            onPress={() => router.push('/(app)/community/travelers' as never)}
          />
          <View style={styles.divider} />
          <FeatureCard
            icon="pulse"
            title="Activity Feed"
            subtitle="See what fellow travelers are up to"
            onPress={() => router.push('/(app)/community/feed' as never)}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  navBar: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  navTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  content: { padding: Spacing.lg, paddingBottom: Spacing['3xl'], gap: Spacing.sm },
  sectionLabel: {
    fontSize: 11,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
    letterSpacing: 0.7,
    marginTop: Spacing.xl,
    marginBottom: Spacing.xs,
    marginLeft: 2,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  divider: { height: 1, backgroundColor: Colors.borderLight, marginLeft: 64 },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  featureCardDim: { opacity: 0.6 },
  featureIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: Colors.primary + '12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: { flex: 1 },
  featureTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  featureTitle: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  featureSubtitle: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2, lineHeight: 18 },
  soonBadge: {
    backgroundColor: Colors.warning + '20',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  soonLabel: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.warning },
  pendingBadge: {
    backgroundColor: Colors.error,
    borderRadius: Radius.full,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  pendingBadgeText: { fontSize: 11, fontWeight: FontWeight.bold, color: Colors.white },
});
