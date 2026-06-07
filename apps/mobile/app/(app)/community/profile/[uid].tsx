import { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Avatar, Chip } from '@/components/ui';
import { getPublicProfile } from '@solotravelsoul/firebase';
import type { PublicProfile } from '@solotravelsoul/shared';
import { useAuthStore } from '@/stores/authStore';
import { useBlockStore } from '@/stores/blockStore';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/constants/theme';
import { getUserInitials } from '@solotravelsoul/shared';

const TRAVEL_STYLE_LABELS: Record<string, string> = {
  solo: 'Solo', budget: 'Budget', luxury: 'Luxury', adventure: 'Adventure',
  cultural: 'Cultural', food: 'Food', 'digital-nomad': 'Digital Nomad', eco: 'Eco',
};
const INTEREST_LABELS: Record<string, string> = {
  hiking: 'Hiking', photography: 'Photography', food: 'Food', nightlife: 'Nightlife',
  history: 'History', beach: 'Beach', languages: 'Languages', volunteering: 'Volunteering',
  yoga: 'Yoga', art: 'Art', sports: 'Sports', music: 'Music',
};

function formatDate(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export default function PublicProfileScreen() {
  const { uid } = useLocalSearchParams<{ uid: string }>();
  const currentUid = useAuthStore((s) => s.user?.uid ?? '');
  const { blockedUids, blockUser, unblockUser } = useBlockStore();

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const isOwnProfile = uid === currentUid;
  const hasBlocked = blockedUids.includes(uid ?? '');

  useEffect(() => {
    if (!uid) return;
    setLoading(true);
    getPublicProfile(uid)
      .then((p) => { setProfile(p); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, [uid]);

  const handleBlockToggle = () => {
    if (!uid) return;
    if (hasBlocked) {
      Alert.alert('Unblock user?', 'They will be able to see your profile again.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Unblock', onPress: () => unblockUser(uid) },
      ]);
    } else {
      Alert.alert(
        `Block this user?`,
        'They will not be able to see your profile, send you messages, or find you in discovery.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Block', style: 'destructive', onPress: () => blockUser(uid) },
        ]
      );
    }
  };

  const handleReport = () => {
    router.push({ pathname: '/(app)/community/report', params: { targetType: 'user', targetId: uid } } as never);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <NavBar />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <NavBar />
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Couldn't load profile</Text>
          <TouchableOpacity onPress={() => {
            setError(false);
            setLoading(true);
            getPublicProfile(uid ?? '').then(setProfile).catch(() => setError(true)).finally(() => setLoading(false));
          }}>
            <Text style={styles.retryLink}>Try again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <NavBar />
        <View style={styles.center}>
          <Ionicons name="lock-closed-outline" size={48} color={Colors.placeholder} />
          <Text style={styles.emptyTitle}>This profile is private</Text>
          <Text style={styles.emptySubtitle}>This traveler has chosen to keep their profile private.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (hasBlocked) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <NavBar />
        <View style={styles.center}>
          <Ionicons name="ban-outline" size={48} color={Colors.placeholder} />
          <Text style={styles.emptyTitle}>You have blocked this user</Text>
          <TouchableOpacity onPress={handleBlockToggle} style={styles.unblockBtn}>
            <Text style={styles.unblockLabel}>Unblock</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const initials = getUserInitials(profile.displayName);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Traveler Profile</Text>
        {!isOwnProfile ? (
          <TouchableOpacity onPress={() => Alert.alert('Options', undefined, [
            { text: 'Report', onPress: handleReport },
            { text: hasBlocked ? 'Unblock' : 'Block', style: 'destructive', onPress: handleBlockToggle },
            { text: 'Cancel', style: 'cancel' },
          ])} hitSlop={12}>
            <Ionicons name="ellipsis-horizontal" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
        ) : <View style={{ width: 24 }} />}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.hero}>
          <Avatar uri={profile.photoURL} initials={initials} size={88} />
          <Text style={styles.heroName}>{profile.displayName}</Text>
          {(profile.currentCity || profile.homeCountry) ? (
            <View style={styles.locationRow}>
              <Ionicons name="location-outline" size={14} color={Colors.textSecondary} />
              <Text style={styles.locationText}>
                {[profile.currentCity, profile.homeCountry].filter(Boolean).join(', ')}
              </Text>
            </View>
          ) : null}
          <Text style={styles.memberSince}>Member since {formatDate(profile.memberSince)}</Text>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <StatPill icon="map" label="Trips" value={String(profile.tripCount)} />
          <StatPill icon="earth" label="Countries" value={String(profile.countriesVisited.length)} />
          <StatPill icon="language" label="Languages" value={String(profile.languages.length)} />
        </View>

        {/* Bio */}
        {profile.bio ? (
          <Section title="ABOUT">
            <Text style={styles.bioText}>{profile.bio}</Text>
          </Section>
        ) : null}

        {/* Travel Style */}
        {profile.travelStyles.length > 0 && (
          <Section title="TRAVEL STYLE">
            <View style={styles.chips}>
              {profile.travelStyles.map((s) => (
                <Chip key={s} label={TRAVEL_STYLE_LABELS[s] ?? s} />
              ))}
            </View>
          </Section>
        )}

        {/* Interests */}
        {profile.interests.length > 0 && (
          <Section title="INTERESTS">
            <View style={styles.chips}>
              {profile.interests.map((i) => (
                <Chip key={i} label={INTEREST_LABELS[i] ?? i} />
              ))}
            </View>
          </Section>
        )}

        {/* Languages */}
        {profile.languages.length > 0 && (
          <Section title="LANGUAGES">
            <View style={styles.chips}>
              {profile.languages.map((l) => <Chip key={l} label={l} />)}
            </View>
          </Section>
        )}

        {/* Dream Destinations */}
        {profile.dreamDestinations.length > 0 && (
          <Section title="DREAM DESTINATIONS">
            <View style={styles.chips}>
              {profile.dreamDestinations.map((d) => <Chip key={d} label={d} />)}
            </View>
          </Section>
        )}

        {/* Countries Visited */}
        {profile.countriesVisited.length > 0 && (
          <Section title={`COUNTRIES VISITED (${profile.countriesVisited.length})`}>
            <Text style={styles.countriesText}>{profile.countriesVisited.join(', ')}</Text>
          </Section>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function NavBar() {
  return (
    <View style={styles.navBar}>
      <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
        <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
      </TouchableOpacity>
      <Text style={styles.navTitle}>Traveler Profile</Text>
      <View style={{ width: 24 }} />
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

function StatPill({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.statPill}>
      <Ionicons name={icon as never} size={18} color={Colors.primary} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing['2xl'], gap: Spacing.md },
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
  content: { paddingBottom: Spacing['3xl'] },
  hero: {
    alignItems: 'center',
    paddingVertical: Spacing['2xl'],
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  heroName: { fontSize: FontSize['2xl'], fontWeight: FontWeight.bold, color: Colors.textPrimary },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  locationText: { fontSize: FontSize.sm, color: Colors.textSecondary },
  memberSince: { fontSize: FontSize.xs, color: Colors.placeholder },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: Colors.surface,
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  statPill: { alignItems: 'center', gap: 4 },
  statValue: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  statLabel: { fontSize: FontSize.xs, color: Colors.textSecondary },
  section: { marginHorizontal: Spacing.lg, marginTop: Spacing.xl },
  sectionLabel: {
    fontSize: 11, fontWeight: FontWeight.bold, color: Colors.textSecondary,
    letterSpacing: 0.7, marginBottom: Spacing.sm,
  },
  sectionCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    ...Shadow.sm,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  bioText: { fontSize: FontSize.md, color: Colors.textSecondary, lineHeight: 22 },
  countriesText: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20 },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.semibold, color: Colors.textPrimary, textAlign: 'center' },
  emptySubtitle: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  retryLink: { fontSize: FontSize.md, color: Colors.primary, fontWeight: FontWeight.semibold },
  unblockBtn: { marginTop: Spacing.sm, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.lg },
  unblockLabel: { fontSize: FontSize.md, color: Colors.primary, fontWeight: FontWeight.semibold },
});
