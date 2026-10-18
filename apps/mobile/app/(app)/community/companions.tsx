// Find travel companions for one of your trips. Ranks travelers who shared a trip to the
// same destination, and public trips there, by date overlap first and then by stated
// preferences — with reasons, differences and what was not provided. Reads are one-shot
// and bounded (≤ 30 travelers, ≤ 20 trips, one batched owner lookup); no listeners.
// Actions reuse existing flows: view profile, view trip / request to join. Nothing is sent
// automatically.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Avatar, Button, Chip } from '@/components/ui';
import { getCompanionTravelers, getCompanionTrips, getDiscoveryRecords } from '@solotravelsoul/firebase';
import {
  compareTravelers, rankByCompatibility, preferencesOf, destinationKey, isDiscoverable, getUserInitials, LEVEL_LABELS,
} from '@solotravelsoul/shared';
import type { CompatibilityResult, NearbyTraveler, PlannedTrip, PublicTrip, TripWindow } from '@solotravelsoul/shared';
import { useAuthStore } from '@/stores/authStore';
import { useBlockStore } from '@/stores/blockStore';
import { useTripStore } from '@/stores/tripStore';
import { upcomingTrips } from '@/utils/discovery';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/constants/theme';

type TravelerItem = { id: string; name: string; traveler: NearbyTraveler; result: CompatibilityResult };
type TripItem = { id: string; name: string; trip: PublicTrip; owner: NearbyTraveler | null; result: CompatibilityResult };

const windowOf = (t: { destination: string | null; startDate: Date | null; endDate: Date | null }): TripWindow => ({
  destination: t.destination, destinationKey: destinationKey(t.destination), startDate: t.startDate, endDate: t.endDate,
});
const range = (a: Date, b: Date) => `${a.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${b.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;

export default function CompanionsScreen() {
  const params = useLocalSearchParams<{ tripId?: string }>();
  const uid = useAuthStore((s) => s.user?.uid ?? '');
  const profile = useAuthStore((s) => s.profile);
  const blockedUids = useBlockStore((s) => s.blockedUids);
  const trips = useTripStore((s) => s.trips);
  const myTrips = useMemo(() => upcomingTrips(trips), [trips]);
  const [tripId, setTripId] = useState<string | null>(params.tripId ?? null);
  const selected: PlannedTrip | null = myTrips.find((t) => t.id === tripId) ?? myTrips[0] ?? null;

  const [travelers, setTravelers] = useState<TravelerItem[]>([]);
  const [publicTrips, setPublicTrips] = useState<TripItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const discoverable = isDiscoverable(profile);
  const me = useMemo(() => preferencesOf(profile), [profile]);

  const load = useCallback(async () => {
    if (!selected) return;
    setLoading(true);
    setError(false);
    const mine = windowOf(selected);
    const hidden = (other: string) => other === uid || blockedUids.includes(other);
    try {
      // Travelers: only for people who are discoverable themselves (reciprocal, as Nearby Travelers).
      const [records, tripsThere] = await Promise.all([
        discoverable ? getCompanionTravelers(selected.destination) : Promise.resolve([] as NearbyTraveler[]),
        getCompanionTrips(selected.destination),
      ]);
      setTravelers(rankByCompatibility(records.filter((r) => !hidden(r.uid)).map((r) => ({
        id: r.uid, name: r.displayName, traveler: r,
        result: compareTravelers(me, r, mine, windowOf({ destination: r.destination, startDate: r.destinationStartDate, endDate: r.destinationEndDate })),
      }))));
      const openTrips = tripsThere.filter((t) => !hidden(t.ownerUid) && t.tripId !== selected.id);
      const owners = await getDiscoveryRecords(openTrips.map((t) => t.ownerUid));
      setPublicTrips(rankByCompatibility(openTrips.map((t) => {
        const owner = owners.find((o) => o.uid === t.ownerUid) ?? null;
        return { id: t.tripId, name: t.title, trip: t, owner, result: compareTravelers(me, owner ?? {}, mine, windowOf(t)) };
      })));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [selected, uid, blockedUids, discoverable, me]);

  useEffect(() => { load(); }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Find travel companions</Text>
        <TouchableOpacity onPress={load} hitSlop={12} accessibilityLabel="Refresh" disabled={!selected || loading}>
          <Ionicons name="refresh" size={22} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {myTrips.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="airplane-outline" size={48} color={Colors.placeholder} />
            <Text style={styles.emptyTitle}>Plan a trip first</Text>
            <Text style={styles.emptyText}>Companion matching starts from one of your upcoming trips: its destination and dates.</Text>
            <Button label="Plan a trip" onPress={() => router.push('/(app)/trips/create' as never)} />
            <TouchableOpacity onPress={() => router.push('/(app)/community/travelers' as never)}>
              <Text style={styles.link}>Browse travelers by destination instead</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={styles.sectionLabel}>MATCH FOR TRIP</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tripChips}>
              {myTrips.map((t) => (
                <Chip key={t.id} label={`${t.destination} · ${t.startDate.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`} selected={selected?.id === t.id} onPress={() => setTripId(t.id)} />
              ))}
            </ScrollView>

            {me.travelStyles.length + me.interests.length === 0 || !me.travelPace ? (
              <TouchableOpacity style={styles.hintCard} onPress={() => router.push({ pathname: '/(app)/profile/preferences', params: { from: 'companions' } } as never)}>
                <Ionicons name="sparkles-outline" size={18} color={Colors.primary} />
                <Text style={styles.hintText}>Answer a few optional questions so matches can be explained. Unanswered questions are never counted against anyone.</Text>
              </TouchableOpacity>
            ) : null}

            {loading ? <ActivityIndicator style={{ marginTop: Spacing.xl }} color={Colors.primary} /> : error ? (
              <Text style={styles.emptyText}>Could not load matches. Check your connection and tap refresh.</Text>
            ) : (
              <>
                <Text style={styles.sectionLabel}>TRAVELERS GOING TO {selected?.destination.toUpperCase()}</Text>
                {!discoverable ? (
                  <View style={styles.hintCard}>
                    <Ionicons name="lock-closed-outline" size={18} color={Colors.textSecondary} />
                    <Text style={styles.hintText}>To see other travelers, make your profile public and turn on traveler discovery in Privacy Settings. Discovery is off unless you choose it.</Text>
                  </View>
                ) : travelers.length === 0 ? (
                  <Text style={styles.emptyText}>No travelers have shared a trip to {selected?.destination} yet.</Text>
                ) : travelers.map((t) => (
                  <MatchCard
                    key={t.id}
                    title={t.traveler.displayName}
                    photoURL={t.traveler.photoURL}
                    subtitle={t.traveler.destinationStartDate && t.traveler.destinationEndDate ? `${t.traveler.destination} · ${range(t.traveler.destinationStartDate, t.traveler.destinationEndDate)}` : t.traveler.destination ?? ''}
                    result={t.result}
                    actionLabel="View profile"
                    onAction={() => router.push(`/(app)/community/profile/${t.traveler.uid}` as never)}
                  />
                ))}

                <Text style={styles.sectionLabel}>PUBLIC TRIPS TO {selected?.destination.toUpperCase()}</Text>
                {publicTrips.length === 0 ? (
                  <Text style={styles.emptyText}>No public trips to {selected?.destination} yet.</Text>
                ) : publicTrips.map((t) => (
                  <MatchCard
                    key={t.id}
                    title={t.trip.title}
                    photoURL={t.trip.ownerPhotoURL}
                    initialsFrom={t.trip.ownerName}
                    subtitle={`by ${t.trip.ownerName} · ${range(t.trip.startDate, t.trip.endDate)}${t.trip.isAcceptingMembers ? '' : ' · not accepting'}`}
                    result={t.result}
                    ownerNote={t.owner ? null : 'Organizer preferences not shared'}
                    actionLabel="View trip"
                    onAction={() => router.push(`/(app)/discover/trips/${t.trip.tripId}` as never)}
                  />
                ))}
                <TouchableOpacity onPress={() => router.push('/(app)/community/travelers' as never)} style={styles.browse}>
                  <Text style={styles.link}>Browse by destination only</Text>
                </TouchableOpacity>
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

export function MatchCard({ title, subtitle, photoURL, initialsFrom, result, actionLabel, onAction, ownerNote }: {
  title: string; subtitle: string; photoURL: string | null; initialsFrom?: string; result: CompatibilityResult;
  actionLabel: string; onAction: () => void; ownerNote?: string | null;
}) {
  const levelColor = result.level === 'strong' ? Colors.success : result.level === 'good' ? Colors.primary : Colors.textSecondary;
  return (
    <View style={styles.card} accessible accessibilityLabel={`${title}. ${LEVEL_LABELS[result.level]}. ${result.reasons.join('. ')}`}>
      <View style={styles.cardHeader}>
        <Avatar uri={photoURL} initials={getUserInitials(initialsFrom ?? title)} size={44} />
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{title}</Text>
          {subtitle ? <Text style={styles.cardSubtitle}>{subtitle}</Text> : null}
        </View>
        <Text style={[styles.level, { color: levelColor, borderColor: levelColor }]}>{LEVEL_LABELS[result.level]}</Text>
      </View>
      {result.reasons.map((r) => (
        <View key={r} style={styles.line}><Ionicons name="checkmark-circle" size={14} color={Colors.success} /><Text style={styles.lineText}>{r}</Text></View>
      ))}
      {result.differences.map((d) => (
        <View key={d} style={styles.line}><Ionicons name="swap-horizontal" size={14} color={Colors.warning} /><Text style={styles.lineText}>{d}</Text></View>
      ))}
      {ownerNote ? <Text style={styles.notProvided}>{ownerNote}</Text> : result.notProvided.length ? (
        <Text style={styles.notProvided}>Not provided: {result.notProvided.join(', ')}</Text>
      ) : null}
      <Button label={actionLabel} variant="secondary" size="sm" onPress={onAction} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  navBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.surface,
  },
  navTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  content: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing['3xl'] },
  sectionLabel: { fontSize: 11, fontWeight: FontWeight.bold, color: Colors.textSecondary, letterSpacing: 0.7, marginTop: Spacing.md },
  tripChips: { gap: Spacing.sm },
  hintCard: { flexDirection: 'row', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.md, backgroundColor: Colors.primary + '10', alignItems: 'flex-start' },
  hintText: { flex: 1, fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20 },
  empty: { alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing['2xl'] },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  emptyText: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  link: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: FontWeight.semibold },
  browse: { alignItems: 'center', paddingVertical: Spacing.md },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.lg, gap: Spacing.sm, ...Shadow.sm },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  cardTitle: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  cardSubtitle: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  level: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, borderWidth: 1, borderRadius: Radius.full, paddingHorizontal: Spacing.sm, paddingVertical: 2 },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.xs },
  lineText: { flex: 1, fontSize: FontSize.sm, color: Colors.textPrimary, lineHeight: 19 },
  notProvided: { fontSize: FontSize.xs, color: Colors.textSecondary, fontStyle: 'italic' },
});
