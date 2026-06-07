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
import { Text, Avatar, Button, Chip } from '@/components/ui';
import { subscribeNearbyTravelers, subscribeDestinationTravelers } from '@solotravelsoul/firebase';
import type { NearbyTraveler } from '@solotravelsoul/shared';
import { useAuthStore } from '@/stores/authStore';
import { useBlockStore } from '@/stores/blockStore';
import { getUserInitials } from '@solotravelsoul/shared';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/constants/theme';

export default function DiscoverTravelersScreen() {
  const profile = useAuthStore((s) => s.profile);
  const { blockedUids } = useBlockStore();
  const [travelers, setTravelers] = useState<NearbyTraveler[]>([]);
  const [loading, setLoading] = useState(true);
  const [destination, setDestination] = useState('');
  const [query, setQuery] = useState(profile?.city ?? '');
  const unsubRef = useRef<(() => void) | null>(null);

  const isOptedIn = profile?.showInNearbyTravelers ?? false;

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
          <Ionicons name="earth" size={64} color={Colors.primary} />
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
          renderItem={({ item }) => <TravelerCard traveler={item} />}
        />
      )}
    </SafeAreaView>
  );
}

function NavBar() {
  return (
    <View style={styles.navBar}>
      <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
        <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
      </TouchableOpacity>
      <Text style={styles.navTitle}>Nearby Travelers</Text>
      <View style={{ width: 24 }} />
    </View>
  );
}

function TravelerCard({ traveler }: { traveler: NearbyTraveler }) {
  return (
    <TouchableOpacity
      style={styles.travelerCard}
      onPress={() => router.push(`/(app)/community/profile/${traveler.uid}` as never)}
      activeOpacity={0.85}
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
            {traveler.travelStyles.slice(0, 3).map((s) => <Chip key={s} label={s} />)}
          </View>
        )}
      </View>
      <Ionicons name="chevron-forward" size={16} color={Colors.placeholder} />
    </TouchableOpacity>
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
  filterBar: {
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
    height: 40,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: { flex: 1, fontSize: FontSize.md, color: Colors.textPrimary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing['2xl'], gap: Spacing.lg },
  optInTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, textAlign: 'center' },
  optInSubtitle: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  laterBtn: { paddingVertical: Spacing.sm },
  laterLabel: { fontSize: FontSize.sm, color: Colors.textSecondary },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.semibold, color: Colors.textPrimary, textAlign: 'center' },
  emptySubtitle: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  list: { padding: Spacing.lg },
  travelerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    gap: Spacing.md,
    ...Shadow.sm,
  },
  travelerInfo: { flex: 1, gap: Spacing.xs },
  travelerName: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  locationText: { fontSize: FontSize.sm, color: Colors.textSecondary },
  chips: { flexDirection: 'row', gap: Spacing.xs },
});
