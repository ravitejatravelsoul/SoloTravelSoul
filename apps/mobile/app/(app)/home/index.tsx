import { memo } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import { Text, Avatar, EmptyState, OfflineBanner } from '@/components/ui';
import { TripCard } from '@/components/trips/TripCard';
import { TripHeroCard } from '@/components/trips/TripHeroCard';
import { useAuthStore } from '@/stores/authStore';
import { useTrips } from '@/hooks/useTrips';
import { useNetworkState } from '@/hooks/useNetworkState';
import { getUserInitials } from '@solotravelsoul/shared';
import { tripStatus } from '@/utils/dateUtils';
import { Colors, Gradients, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/constants/theme';
import type { PlannedTrip } from '@solotravelsoul/shared';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Still up?';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function HomeScreen() {
  const profile = useAuthStore((s) => s.profile);
  const { upcoming, past, loading } = useTrips();
  const { isConnected } = useNetworkState();

  const firstName = profile?.name?.split(' ')[0] ?? 'Traveler';
  const initials = getUserInitials(profile?.name ?? '?');

  const activeTrip = upcoming.find((t) => tripStatus(t.startDate, t.endDate) === 'active');
  const nextTrip = activeTrip ?? upcoming.find((t) => tripStatus(t.startDate, t.endDate) === 'upcoming');
  const recentPast = past.slice(0, 3);
  const totalTrips = upcoming.length + past.length;

  return (
    <SafeAreaView style={styles.safe}>
      {!isConnected && <OfflineBanner />}
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <View>
            <Text variant="caption" style={styles.greetingLabel}>{greeting()}</Text>
            <Text variant="h2" style={styles.firstName}>{firstName}</Text>
          </View>
          <TouchableOpacity onPress={() => router.push('/(app)/profile')} activeOpacity={0.8}>
            <Avatar uri={profile?.photoURL} initials={initials} size={46} />
          </TouchableOpacity>
        </View>

        {/* ── Hero ── */}
        {nextTrip ? (
          <TripHeroCard trip={nextTrip} />
        ) : loading ? (
          <View style={[styles.emptyHero, styles.heroSkeleton]}>
            <View style={{ padding: Spacing['2xl'], gap: Spacing.lg, minHeight: 180 }}>
              <View style={styles.skeletonPill} />
              <View style={[styles.skeletonBar, { width: '65%', height: 26 }]} />
              <View style={[styles.skeletonBar, { width: '45%' }]} />
            </View>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.emptyHero}
            onPress={() => router.push('/(app)/trips/create')}
            activeOpacity={0.88}
          >
            <LinearGradient colors={Gradients.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.emptyHeroGradient}>
              <View style={styles.emptyHeroDecCircle} />
              <Text style={styles.emptyHeroEmoji}>🌍</Text>
              <Text style={styles.emptyHeroTitle}>Where to next?</Text>
              <Text style={styles.emptyHeroSub}>Plan your first adventure</Text>
              <View style={styles.emptyHeroCta}>
                <Text style={styles.emptyHeroCtaText}>Start planning</Text>
                <Ionicons name="arrow-forward" size={14} color={Colors.white} />
              </View>
            </LinearGradient>
          </TouchableOpacity>
        )}

        {/* ── Passport stats ── */}
        {totalTrips > 0 && (
          <View style={styles.passport}>
            <StatItem
              value={upcoming.filter(t => tripStatus(t.startDate, t.endDate) === 'active').length}
              label="Active"
              icon="airplane"
              color={Colors.success}
            />
            <View style={styles.passportDivider} />
            <StatItem
              value={upcoming.filter(t => tripStatus(t.startDate, t.endDate) === 'upcoming').length}
              label="Upcoming"
              icon="calendar-outline"
              color={Colors.primary}
            />
            <View style={styles.passportDivider} />
            <StatItem
              value={past.length}
              label="Completed"
              icon="checkmark-circle-outline"
              color={Colors.textSecondary}
            />
          </View>
        )}

        {/* ── Quick actions ── */}
        <Text variant="label" style={styles.sectionLabel}>Quick actions</Text>
        <View style={styles.actionsGrid}>
          <QuickActionTile
            gradient={Gradients.primary}
            icon="add-circle-outline"
            label="New Trip"
            onPress={() => router.push('/(app)/trips/create')}
          />
          <QuickActionTile
            gradient={Gradients.ocean}
            icon="compass-outline"
            label="Discover"
            onPress={() => router.push('/(app)/discover')}
          />
          <QuickActionTile
            gradient={Gradients.success}
            icon="map-outline"
            label="My Trips"
            onPress={() => router.push('/(app)/trips')}
          />
          <QuickActionTile
            gradient={Gradients.sunset}
            icon="person-outline"
            label="Profile"
            onPress={() => router.push('/(app)/profile')}
          />
        </View>

        {/* ── Recent trips ── */}
        {recentPast.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text variant="label" style={styles.sectionLabel}>Recent adventures</Text>
              <TouchableOpacity onPress={() => router.push('/(app)/trips')}>
                <Text style={styles.seeAll}>See all</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.tripList}>
              {recentPast.map((t) => <TripCard key={t.id} trip={t} />)}
            </View>
          </>
        )}

        {/* ── Empty state — no trips at all ── */}
        {totalTrips === 0 && !loading && (
          <View style={styles.emptySection}>
            <EmptyState
              emoji="🗺️"
              title="Your journey starts here"
              subtitle="Plan a trip, explore destinations, and capture every memory along the way."
              actionLabel="Plan your first trip"
              onAction={() => router.push('/(app)/trips/create')}
            />
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

// ── Sub-components ────────────────────────────────────────────────────

const StatItem = memo(function StatItem({
  value, label, icon, color,
}: { value: number; label: string; icon: string; color: string }) {
  return (
    <View style={styles.statItem}>
      <Ionicons name={icon as never} size={16} color={color} />
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text variant="caption">{label}</Text>
    </View>
  );
});

const QuickActionTile = memo(function QuickActionTile({
  gradient, icon, label, onPress,
}: { gradient: readonly [string, string]; icon: string; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.actionWrapper} onPress={onPress} activeOpacity={0.82}>
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.actionGradient}
      >
        <Ionicons name={icon as never} size={26} color={Colors.white} />
      </LinearGradient>
      <Text variant="label" center style={styles.actionLabel}>{label}</Text>
    </TouchableOpacity>
  );
});

// ── Styles ────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, paddingBottom: Spacing['4xl'] },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xl,
    paddingTop: Spacing.sm,
  },
  greetingLabel: { color: Colors.textSecondary, marginBottom: 2 },
  firstName: { lineHeight: 30 },

  // Empty hero CTA
  emptyHero: {
    borderRadius: Radius.xl,
    overflow: 'hidden',
    marginBottom: Spacing.xl,
    ...Shadow.hero,
  },
  emptyHeroGradient: {
    padding: Spacing['2xl'],
    minHeight: 180,
    alignItems: 'flex-start',
    gap: Spacing.xs,
    overflow: 'hidden',
  },
  emptyHeroDecCircle: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.07)',
    top: -50,
    right: -30,
  },
  emptyHeroEmoji: { fontSize: 36, lineHeight: 46, marginBottom: Spacing.xs },
  emptyHeroTitle: {
    fontSize: FontSize['2xl'],
    lineHeight: 30,
    fontWeight: FontWeight.extrabold,
    color: Colors.white,
  },
  emptyHeroSub: {
    fontSize: FontSize.md,
    color: 'rgba(255,255,255,0.72)',
    marginBottom: Spacing.md,
  },
  emptyHeroCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  emptyHeroCtaText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.white,
  },

  // Passport stats
  passport: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.xl,
    ...Shadow.sm,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.md,
    gap: 3,
  },
  statValue: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
  },
  passportDivider: {
    width: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.md,
  },

  // Section headers
  sectionLabel: {
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  seeAll: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: FontWeight.medium,
  },

  // Quick actions
  actionsGrid: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  actionWrapper: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  actionGradient: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.md,
  },
  actionLabel: {
    color: Colors.textPrimary,
    fontSize: FontSize.xs,
  },

  tripList: { gap: Spacing.md },
  emptySection: { marginTop: Spacing.xl },

  // Loading skeleton for hero slot
  heroSkeleton: {
    backgroundColor: Colors.chipBackground,
    overflow: 'hidden',
  },
  skeletonBar: {
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.border,
  },
  skeletonPill: {
    width: 80,
    height: 24,
    borderRadius: Radius.full,
    backgroundColor: Colors.border,
  },
});
