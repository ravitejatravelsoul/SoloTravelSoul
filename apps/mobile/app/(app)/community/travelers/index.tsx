import { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Avatar, Button, Chip, ScreenHeader, PressableScale } from '@/components/ui';
import { subscribeNearbyTravelers, subscribeDestinationTravelers } from '@solotravelsoul/firebase';
import type { NearbyTraveler, TravelPreferences } from '@solotravelsoul/shared';
import { useAuthStore } from '@/stores/authStore';
import { useBlockStore } from '@/stores/blockStore';
import { getUserInitials, compareTravelers, preferencesOf, LEVEL_LABELS, TRAVEL_STYLE_LABELS } from '@solotravelsoul/shared';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow, Fonts } from '@/constants/theme';

export default function DiscoverTravelersScreen() {
  const profile = useAuthStore((s) => s.profile);
  const { blockedUids } = useBlockStore();
  const [travelers, setTravelers] = useState<NearbyTraveler[]>([]);
  const [loading, setLoading] = useState(true);
  const [destination, setDestination] = useState('');
  const [query, setQuery] = useState(profile?.city ?? '');
  const unsubRef = useRef<(() => void) | null>(null);

  const isOptedIn = profile?.showInNearbyTravelers ?? false;
  const me = preferencesOf(profile);

  useEffect(() => {
    if (!isOptedIn) { setLoading(false); return; }
    if (unsubRef.current) unsubRef.current();
    setLoading(true);
    const target = destination.trim() || profile?.city || '';
    if (!target) { setTravelers([]); setLoading(false); return; }

    const unsub = destination.trim()
      ? subscribeDestinationTravelers(destination.trim(), (t) => { setTravelers(t); setLoading(false); })
      : subscribeNearbyTravelers(target, (t) => { setTravelers(t); setLoading(false); });
    unsubRef.current = unsub;
    return () => { if (unsubRef.current) unsubRef.current(); };
  }, [destination, isOptedIn, profile?.city]);

  const visible = travelers.filter((t) => {
    const uid = useAuthStore.getState().user?.uid;
    return t.uid !== uid && !blockedUids.includes(t.uid);
  });

  if (!isOptedIn) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <NavBar />
        <View style={styles.center}>
          <Ionicons name="earth" size={64} color={Colors.primaryDark} />
          <Text style={styles.optInTitle}>Find fellow solo travelers</Text>
          <Text style={styles.optInSubtitle}>
            Show your profile to other travelers visiting the same places. City-level only — no GPS.
          </Text>
          <Button
            label="Enable Discovery"
            onPress={() => router.push('/(app)/profile/privacy' as never)}
            fullWidth
          />
          <TouchableOpacity onPress={() => router.back()} style={styles.laterBtn}>
            <Text style={styles.laterLabel}>Maybe later</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <NavBar />

      <View style={styles.filterBar}>
        <TouchableOpacity
          style={styles.matchLink}
          onPress={() => router.push('/(app)/community/companions' as never)}
          accessibilityRole="button"
        >
          <Ionicons name="git-compare-outline" size={16} color={Colors.primary} />
          <Text style={styles.matchLinkText}>Match with one of my trips</Text>
        </TouchableOpacity>
        <View style={styles.searchBox}>
          <Ionicons name="location-outline" size={16} color={Colors.placeholder} />
          <TextInput
            style={styles.searchInput}
            value={destination}
            onChangeText={setDestination}
            placeholder={`Search destination (default: ${profile?.city || 'your city'})`}
            placeholderTextColor={Colors.placeholder}
          />
        </View>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      ) : visible.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="people-outline" size={56} color={Colors.placeholder} />
          <Text style={styles.emptyTitle}>No travelers found</Text>
          <Text style={styles.emptySubtitle}>
            No travelers are currently opted-in for {destination || profile?.city || 'this city'}.
          </Text>
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(t) => t.uid}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.md }} />}
          renderItem={({ item }) => <TravelerCard traveler={item} me={me} />}
        />
      )}
    </SafeAreaView>
  );
}

function NavBar() {
  return <ScreenHeader title="Nearby travelers" />;
}

function TravelerCard({ traveler, me }: { traveler: NearbyTraveler; me: TravelPreferences }) {
  // Explained on the device from what both travelers chose to share; no extra reads.
  const result = compareTravelers(me, traveler);
  return (
    <PressableScale
      style={styles.travelerCard}
      onPress={() => router.push(`/(app)/community/profile/${traveler.uid}` as never)}
      guardMs={500}
      scaleTo={0.98}
      accessibilityRole="button"
      accessibilityLabel={`${traveler.displayName}, ${traveler.destination ?? traveler.currentCity}, ${LEVEL_LABELS[result.level]}`}
    >
      <Avatar uri={traveler.photoURL} initials={getUserInitials(traveler.displayName)} size={48} />
      <View style={styles.travelerInfo}>
        <Text style={styles.travelerName}>{traveler.displayName}</Text>
        <View style={styles.locationRow}>
          <Ionicons name="location-outline" size={12} color={Colors.textSecondary} />
          <Text style={styles.locationText}>
            {traveler.destination ?? traveler.currentCity}
          </Text>
        </View>
        {traveler.travelStyles.length > 0 && (
          <View style={styles.chips}>
            {traveler.travelStyles.slice(0, 3).map((s) => <Chip key={s} label={TRAVEL_STYLE_LABELS[s] ?? s} />)}
          </View>
        )}
        <Text style={styles.matchLevel}>{LEVEL_LABELS[result.level]}</Text>
        {result.reasons.slice(0, 2).map((r) => <Text key={r} style={styles.reason}>✓ {r}</Text>)}
        {result.differences.slice(0, 1).map((d) => <Text key={d} style={styles.reason}>↔ {d}</Text>)}
      </View>
      <Ionicons name="chevron-forward" size={16} color={Colors.textSecondary} />
    </PressableScale>
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
    backgroundColor: Colors.background,
  },
  navTitle: { fontFamily: Fonts.display, fontSize: FontSize.lg, color: Colors.textPrimary },
  filterBar: {
    backgroundColor: Colors.background,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
    minHeight: 48,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: { flex: 1, fontSize: FontSize.md, color: Colors.textPrimary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing['2xl'], gap: Spacing.lg },
  optInTitle: { fontFamily: Fonts.displayHeavy, fontSize: 26, lineHeight: 34, color: Colors.textPrimary, textAlign: 'center' },
  optInSubtitle: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  laterBtn: { paddingVertical: Spacing.sm },
  laterLabel: { fontSize: FontSize.sm, color: Colors.textSecondary },
  emptyTitle: { fontFamily: Fonts.display, fontSize: FontSize.xl, color: Colors.textPrimary, textAlign: 'center' },
  emptySubtitle: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  list: { padding: Spacing.lg },
  travelerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: Spacing.lg,
    gap: Spacing.md,
    ...Shadow.sm,
  },
  travelerInfo: { flex: 1, gap: Spacing.xs },
  travelerName: { fontFamily: Fonts.display, fontSize: FontSize.lg, color: Colors.textPrimary },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  locationText: { fontSize: FontSize.sm, color: Colors.textSecondary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  matchLevel: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primaryDark, marginTop: 2 },
  reason: { fontSize: FontSize.sm, color: Colors.textSecondary },
  matchLink: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: Spacing.sm },
  matchLinkText: { fontSize: FontSize.sm, color: Colors.primaryDark, fontWeight: FontWeight.semibold },
});
