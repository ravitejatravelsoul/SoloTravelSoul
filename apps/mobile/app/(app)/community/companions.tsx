// Find travel companions for one of your trips. Ranks travelers who shared a trip to the
// same destination, and public trips there, by date overlap first and then by stated
// preferences — with reasons, differences and what was not provided. Reads are one-shot
// and bounded (≤ 30 travelers, ≤ 20 trips, one batched owner lookup); no listeners.
// Actions reuse existing flows: view profile, view trip / request to join. Nothing is sent
// automatically.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Avatar, Button, Chip, ScreenHeader, PressableScale } from '@/components/ui';
import { getCompanionTravelers, getCompanionTrips, getDiscoveryRecords } from '@solotravelsoul/firebase';
import { preferencesOf, isDiscoverable, getUserInitials, LEVEL_LABELS, PREFERENCE_LABELS } from '@solotravelsoul/shared';
import type { CompatibilityResult, NearbyTraveler, PlannedTrip } from '@solotravelsoul/shared';
import { useAuthStore } from '@/stores/authStore';
import { useBlockStore } from '@/stores/blockStore';
import { useTripStore } from '@/stores/tripStore';
import { upcomingTrips } from '@/utils/discovery';
import { buildMatches, createMatchLoader, matchQueryKey, EMPTY_RAW } from '@/utils/companions';
import type { LoadContext, LoadState, RawMatches } from '@/utils/companions';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow, Fonts } from '@/constants/theme';

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

  // Raw query results; the cards are derived from them below.
  const [{ raw, loading, error }, setState] = useState<LoadState>({ raw: EMPTY_RAW, loading: false, error: false });
  const discoverable = isDiscoverable(profile);
  const me = useMemo(() => preferencesOf(profile), [profile]);

  // Bounded queries for a destination (≤ 30 travelers, ≤ 20 trips, one batched owner lookup).
  const fetchMatches = useCallback(async (ctx: LoadContext & { selected: NonNullable<LoadContext['selected']> }): Promise<RawMatches> => {
    const { selected, discoverable } = ctx;
    // Travelers: only for people who are discoverable themselves (reciprocal, as Nearby Travelers).
    const [records, tripsThere] = await Promise.all([
      discoverable ? getCompanionTravelers(selected.destination) : Promise.resolve([] as NearbyTraveler[]),
      getCompanionTrips(selected.destination),
    ]);
    const owners = await getDiscoveryRecords(tripsThere.filter((t) => t.ownerUid !== ctx.uid).map((t) => t.ownerUid));
    return { travelers: records, trips: tripsThere, owners };
  }, []);
  const loader = useRef(createMatchLoader(fetchMatches, setState)).current;

  // Query again when the account, discoverability or the selected trip's destination changes
  // (including a destination edit on the same trip, e.g. after returning from Edit Trip).
  // Date-only edits keep the results; overlap is recomputed below. Only the latest load
  // may update the screen.
  const queryKey = matchQueryKey({ uid, discoverable, selected });
  useEffect(() => {
    loader.load({ uid, discoverable, selected });
  }, [queryKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => loader.cancel(), [loader]);
  const refresh = () => loader.load({ uid, discoverable, selected }, true);

  // Preferences, consent and block changes re-rank or hide cards without another query.
  const { travelers, trips: publicTrips } = useMemo(() => buildMatches(raw, { uid, blockedUids, me, selected }), [raw, uid, blockedUids, me, selected]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader
        title="Find travel companions"
        right={
          <PressableScale onPress={refresh} disabled={!selected || loading} guardMs={600} style={styles.refreshBtn} accessibilityRole="button" accessibilityLabel="Refresh">
            <Ionicons name="refresh" size={22} color={Colors.primaryDark} />
          </PressableScale>
        }
      />

      <ScrollView contentContainerStyle={styles.content}>
        {myTrips.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="airplane-outline" size={48} color={Colors.textSecondary} />
            <Text style={styles.emptyTitle}>Plan a trip first</Text>
            <Text style={styles.emptyText}>Companion matching starts from one of your upcoming trips: its destination and dates.</Text>
            <Button label="Plan a trip" onPress={() => router.push('/(app)/trips/create' as never)} />
            <TouchableOpacity onPress={() => router.push('/(app)/community/travelers' as never)}>
              <Text style={styles.link}>Browse travelers by destination instead</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={styles.sectionLabel}>Match for trip</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tripChips}>
              {myTrips.map((t) => (
                <Chip key={t.id} label={`${t.destination} · ${t.startDate.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`} selected={selected?.id === t.id} onPress={() => setTripId(t.id)} />
              ))}
            </ScrollView>

            {me.travelStyles.length + me.interests.length === 0 || !me.travelPace ? (
              <TouchableOpacity style={styles.hintCard} onPress={() => router.push({ pathname: '/(app)/profile/preferences', params: { from: 'companions' } } as never)}>
                <Ionicons name="sparkles-outline" size={18} color={Colors.primaryDark} />
                <Text style={styles.hintText}>Answer a few optional questions so matches can be explained. Unanswered questions are never counted against anyone.</Text>
              </TouchableOpacity>
            ) : null}

            {loading ? <ActivityIndicator style={{ marginTop: Spacing.xl }} color={Colors.primary} /> : error ? (
              <Text style={styles.emptyText}>Could not load matches. Check your connection and tap refresh.</Text>
            ) : (
              <>
                <Text style={styles.sectionLabel}>Travelers going to {selected?.destination}</Text>
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

                <Text style={styles.sectionLabel}>Public trips to {selected?.destination}</Text>
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
  const levelColor = result.level === 'strong' ? Colors.success : result.level === 'good' ? Colors.primaryDark : result.level === 'dates_differ' ? Colors.warning : Colors.textSecondary;
  return (
    <View style={styles.card} accessible accessibilityLabel={`${title}. ${LEVEL_LABELS[result.level]}. ${result.dates.label ? `${result.dates.label}. ` : ''}Preferences: ${PREFERENCE_LABELS[result.preferences.level]}. ${result.reasons.join('. ')}`}>
      <View style={styles.cardHeader}>
        <Avatar uri={photoURL} initials={getUserInitials(initialsFrom ?? title)} size={44} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.cardTitle}>{title}</Text>
          {subtitle ? <Text style={styles.cardSubtitle}>{subtitle}</Text> : null}
          {/* Under the name, not beside it: beside it the name was squeezed into a few letters per line at large text. */}
          <Text style={[styles.level, { color: levelColor, borderColor: levelColor, marginTop: Spacing.xs }]}>{LEVEL_LABELS[result.level]}</Text>
        </View>
      </View>
      {result.dates.label ? (
        <View style={styles.line}>
          <Ionicons name="calendar-outline" size={14} color={result.dates.status === 'overlap' ? Colors.success : Colors.textSecondary} />
          <Text style={[styles.lineText, styles.strong]}>{result.dates.label}</Text>
        </View>
      ) : null}
      <View style={styles.line}>
        <Ionicons name="options-outline" size={14} color={Colors.textSecondary} />
        <Text style={[styles.lineText, styles.strong]}>Preferences: {PREFERENCE_LABELS[result.preferences.level]}</Text>
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
  refreshBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.tealSoft, alignItems: 'center', justifyContent: 'center' },
  safe: { flex: 1, backgroundColor: Colors.background },
  navBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md, backgroundColor: Colors.background,
  },
  navTitle: { fontFamily: Fonts.display, fontSize: FontSize.lg, color: Colors.textPrimary },
  content: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing['3xl'] },
  sectionLabel: { fontFamily: Fonts.display, fontSize: FontSize.xl, color: Colors.textPrimary, marginTop: Spacing.md },
  tripChips: { gap: Spacing.sm },
  hintCard: { flexDirection: 'row', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.lg, backgroundColor: Colors.tealSoft, alignItems: 'flex-start' },
  hintText: { flex: 1, fontSize: FontSize.sm, color: Colors.textPrimary, lineHeight: 20 },
  empty: { alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing['2xl'] },
  emptyTitle: { fontFamily: Fonts.display, fontSize: FontSize.xl, color: Colors.textPrimary },
  emptyText: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  link: { fontSize: FontSize.sm, color: Colors.primaryDark, fontWeight: FontWeight.semibold },
  browse: { alignItems: 'center', paddingVertical: Spacing.md },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.borderLight, padding: Spacing.lg, gap: Spacing.sm, ...Shadow.sm },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  cardTitle: { fontFamily: Fonts.display, fontSize: FontSize.lg, lineHeight: 24, color: Colors.textPrimary },
  cardSubtitle: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  level: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, borderWidth: 1.5, borderRadius: Radius.full, paddingHorizontal: Spacing.sm, paddingVertical: 3, alignSelf: 'flex-start', overflow: 'hidden' },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.xs },
  lineText: { flex: 1, fontSize: FontSize.sm, color: Colors.textPrimary, lineHeight: 20 },
  notProvided: { fontSize: FontSize.sm, color: Colors.textSecondary, fontStyle: 'italic' },
  strong: { fontWeight: FontWeight.semibold },
});
