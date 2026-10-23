import { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, PressableScale } from '@/components/ui';
import {
  subscribeTripJoinRequestsForOwner,
  subscribeGroupJoinRequestsForOwner,
} from '@solotravelsoul/firebase';
import { useAuthStore } from '@/stores/authStore';
import { shouldOfferPreferenceSetup } from '@solotravelsoul/shared';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow, Fonts } from '@/constants/theme';

function FeatureCard({
  icon,
  title,
  subtitle,
  onPress,
  badge,
  comingSoon,
  tint = Colors.tealSoft,
  tintIcon = Colors.primaryDark,
}: {
  icon: string;
  title: string;
  subtitle: string;
  onPress?: () => void;
  badge?: number;
  comingSoon?: boolean;
  tint?: string;
  tintIcon?: string;
}) {
  return (
    <PressableScale
      style={[styles.featureCard, comingSoon && styles.featureCardDim]}
      onPress={onPress}
      disabled={!onPress || comingSoon}
      guardMs={500}
      scaleTo={0.98}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}${badge ? `. ${badge} waiting` : ''}`}
    >
      <View style={[styles.featureIcon, { backgroundColor: tint }]}>
        <Ionicons name={icon as never} size={28} color={comingSoon ? Colors.textSecondary : tintIcon} />
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
      {!comingSoon && <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />}
    </PressableScale>
  );
}

export default function CommunityScreen() {
  const uid = useAuthStore((s) => s.user?.uid ?? '');
  const profile = useAuthStore((s) => s.profile);
  const offerSetup = shouldOfferPreferenceSetup(profile);
  const resuming = profile?.preferenceSetup?.status === 'in_progress';
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
        <Text style={styles.navTitle} accessibilityRole="header">Community</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Owner dashboard — only shown when there are pending requests */}
        {totalPending > 0 && (
          <>
            <Text style={styles.sectionLabel}>Action needed</Text>
            <View style={styles.card}>
              <FeatureCard
                icon="notifications"
                tint={Colors.coralSoft}
                tintIcon={Colors.coral}
                title="Pending Requests"
                subtitle="Review join requests for your trips and groups"
                onPress={() => router.push('/(app)/community/my-requests' as never)}
                badge={totalPending}
              />
            </View>
          </>
        )}

        {offerSetup && (
          <TouchableOpacity
            style={styles.setupCard}
            onPress={() => router.push({ pathname: '/(app)/profile/preferences', params: { from: 'community' } } as never)}
            accessibilityRole="button"
          >
            <Ionicons name="sparkles-outline" size={22} color={Colors.primaryDark} />
            <View style={{ flex: 1 }}>
              <Text style={styles.setupTitle}>{resuming ? 'Finish your travel preferences' : 'Set up travel preferences'}</Text>
              <Text style={styles.setupText}>Optional, about a minute. Helps explain which travelers suit your trips.</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={Colors.textSecondary} />
          </TouchableOpacity>
        )}

        <Text style={styles.sectionLabel}>Manage</Text>
        <View style={styles.card}>
          <FeatureCard
            icon="shield-checkmark"
            title="My Requests"
            subtitle="Approve or reject join requests for your trips and groups"
            onPress={() => router.push('/(app)/community/my-requests' as never)}
            badge={totalPending}
          />
        </View>

        <Text style={styles.sectionLabel}>Travel groups</Text>
        <View style={styles.card}>
          <FeatureCard
            icon="people"
            tint="#FFF1CC"
            tintIcon="#A06A00"
            title="Travel Groups"
            subtitle="Discover and join groups traveling to your destination"
            onPress={() => router.push('/(app)/community/groups' as never)}
          />
        </View>

        <Text style={styles.sectionLabel}>Explore</Text>
        <View style={styles.card}>
          <FeatureCard
            icon="map"
            tint="#E9E6FB"
            tintIcon="#5B4BC4"
            title="Public Trips"
            subtitle="Browse trips and request to join as a co-traveler"
            onPress={() => router.push('/(app)/discover/trips' as never)}
          />
        </View>

        <Text style={styles.sectionLabel}>Discover</Text>
        <View style={styles.card}>
          <FeatureCard
            icon="git-compare"
            title="Find Travel Companions"
            subtitle="Match one of your trips by destination, dates and preferences"
            onPress={() => router.push('/(app)/community/companions' as never)}
          />
          <View style={styles.divider} />
          <FeatureCard
            icon="location"
            tint={Colors.coralSoft}
            tintIcon={Colors.coral}
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
  setupCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.lg, marginTop: Spacing.md,
    borderRadius: Radius.xl, backgroundColor: Colors.tealSoft, borderWidth: 1, borderColor: Colors.accent,
  },
  setupTitle: { fontFamily: Fonts.display, fontSize: FontSize.lg, color: Colors.textPrimary },
  setupText: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  safe: { flex: 1, backgroundColor: Colors.background },
  navBar: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.background,
  },
  navTitle: { fontFamily: Fonts.displayHeavy, fontSize: 28, lineHeight: 36, color: Colors.textPrimary },
  content: { padding: Spacing.lg, paddingBottom: Spacing['3xl'], gap: Spacing.sm },
  sectionLabel: {
    fontFamily: Fonts.display,
    fontSize: FontSize.xl,
    color: Colors.textPrimary,
    marginTop: Spacing.xl,
    marginBottom: Spacing.xs,
    marginLeft: 2,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.borderLight,
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: { flex: 1 },
  featureTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  featureTitle: { fontFamily: Fonts.display, fontSize: FontSize.lg, color: Colors.textPrimary },
  featureSubtitle: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2, lineHeight: 20 },
  soonBadge: {
    backgroundColor: Colors.warning + '20',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  soonLabel: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.warning },
  pendingBadge: {
    backgroundColor: Colors.coral,
    borderRadius: Radius.full,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  pendingBadgeText: { fontSize: 11, fontWeight: FontWeight.bold, color: Colors.white },
});
