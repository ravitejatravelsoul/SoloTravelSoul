import { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Switch,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, BackButton } from '@/components/ui';
import { useUIStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { updateProfileVisibility } from '@solotravelsoul/firebase';
import type { UserProfile } from '@solotravelsoul/shared';
import { useTripStore } from '@/stores/tripStore';
import { applyDiscoverySettings, upcomingTrips } from '@/utils/discovery';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow, Fonts } from '@/constants/theme';
import { ShadowView } from '@/components/ui/ShadowClip';

export default function PrivacySettingsScreen() {
  const profile = useAuthStore((s) => s.profile);
  const setProfile = useAuthStore((s) => s.setProfile);
  const user = useAuthStore((s) => s.user);
  const addToast = useUIStore((s) => s.addToast);

  const [isPublic, setIsPublic] = useState(profile?.profileVisibility === 'public');
  const [discoverable, setDiscoverable] = useState(profile?.showInNearbyTravelers ?? false);
  const [savingVisibility, setSavingVisibility] = useState(false);
  const [savingDiscovery, setSavingDiscovery] = useState(false);
  const [shareCompat, setShareCompat] = useState(profile?.shareCompatibility === true);
  const [savingShare, setSavingShare] = useState(false);
  const [savingTrip, setSavingTrip] = useState(false);
  const trips = useTripStore((s) => s.trips);
  const shareableTrips = upcomingTrips(trips);
  const sharedTripId = profile?.discoveryTripId ?? null;

  useEffect(() => {
    setIsPublic(profile?.profileVisibility === 'public');
    setDiscoverable(profile?.showInNearbyTravelers ?? false);
    setShareCompat(profile?.shareCompatibility === true);
  }, [profile?.profileVisibility, profile?.showInNearbyTravelers, profile?.shareCompatibility]);

  /**
   * Saves a discovery setting and the discovery record together (one batch). Success is
   * reported only after both are written; on failure nothing changed and we say so.
   */
  const saveDiscovery = async (patch: Partial<UserProfile>): Promise<boolean> => {
    if (!user || !profile) return false;
    try {
      const next = await applyDiscoverySettings(user.uid, profile, patch, trips);
      if (useAuthStore.getState().user?.uid === user.uid) setProfile(next);
      addToast('Discovery settings updated.', 'success');
      return true;
    } catch {
      addToast('Could not update discovery settings. Nothing was changed; please try again.', 'error');
      return false;
    }
  };

  const handleShareToggle = async (value: boolean) => {
    if (savingShare) return;
    setSavingShare(true);
    setShareCompat(value);
    if (!(await saveDiscovery({ shareCompatibility: value }))) setShareCompat(!value);
    setSavingShare(false);
  };

  const handleSharedTrip = async (tripId: string | null) => {
    if (tripId === sharedTripId || savingTrip) return;
    setSavingTrip(true);
    await saveDiscovery({ discoveryTripId: tripId });
    setSavingTrip(false);
  };

  const handleVisibilityToggle = async (value: boolean) => {
    if (!user || !profile || savingVisibility) return;
    setSavingVisibility(true);
    setIsPublic(value);
    try {
      // One batch: going private also turns discovery off and removes the discovery record.
      await updateProfileVisibility(user.uid, profile, value ? 'public' : 'private');
      if (useAuthStore.getState().user?.uid === user.uid) {
        setProfile({ ...profile, profileVisibility: value ? 'public' : 'private', ...(value ? {} : { showInNearbyTravelers: false }) });
      }
      addToast('Profile visibility updated.', 'success');
    } catch {
      setIsPublic(!value);
      addToast('Could not update profile visibility. Nothing was changed; please try again.', 'error');
    } finally {
      setSavingVisibility(false);
    }
  };

  const handleDiscoveryToggle = async (value: boolean) => {
    if (!user || !profile || savingDiscovery) return;
    setSavingDiscovery(true);
    setDiscoverable(value);
    if (!(await saveDiscovery({ showInNearbyTravelers: value }))) setDiscoverable(!value);
    setSavingDiscovery(false);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.navBar}>
        <BackButton />
        <Text style={styles.navTitle}>Privacy Settings</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Profile Visibility */}
        <Text style={styles.sectionLabel}>Profile visibility</Text>
        <ShadowView style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconBox, { backgroundColor: Colors.primary + '15' }]}>
                <Ionicons name="globe-outline" size={18} color={Colors.primary} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>Public profile</Text>
                <Text style={styles.rowSubtitle}>
                  {isPublic
                    ? 'Other travelers can view your profile'
                    : 'Only you can see your full profile'}
                </Text>
              </View>
            </View>
            {savingVisibility ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <Switch
                accessibilityLabel="Public profile"
                value={isPublic}
                onValueChange={handleVisibilityToggle}
                trackColor={{ false: Colors.border, true: Colors.primary }}
                thumbColor={Colors.white}
              />
            )}
          </View>

          <View style={styles.infoCard}>
            <Ionicons name="information-circle-outline" size={16} color={Colors.textSecondary} />
            <Text style={styles.infoText}>
              {isPublic
                ? 'Travelers can see your bio, travel style, and destinations. Your email is never shown.'
                : 'Visitors see only your name and photo. All other profile data is hidden.'}
            </Text>
          </View>
        </ShadowView>

        {/* Traveler Discovery */}
        <Text style={styles.sectionLabel}>Traveler discovery</Text>
        <ShadowView style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconBox, { backgroundColor: Colors.accent + '15' }]}>
                <Ionicons name="people-outline" size={18} color={Colors.accent} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>Show me to other travelers</Text>
                <Text style={styles.rowSubtitle}>
                  Appear to travelers in your city, and for the trip you choose below
                </Text>
              </View>
            </View>
            {savingDiscovery ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <Switch
                accessibilityLabel="Show me to other travelers"
                value={discoverable}
                onValueChange={handleDiscoveryToggle}
                trackColor={{ false: Colors.border, true: Colors.primary }}
                thumbColor={Colors.white}
                disabled={!isPublic}
              />
            )}
          </View>
          {!isPublic && (
            <View style={styles.infoCard}>
              <Ionicons name="lock-closed-outline" size={16} color={Colors.textSecondary} />
              <Text style={styles.infoText}>
                Make your profile public first to enable traveler discovery.
              </Text>
            </View>
          )}
        </ShadowView>

        {/* Travel compatibility */}
        <Text style={styles.sectionLabel}>Travel compatibility</Text>
        <ShadowView style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconBox, { backgroundColor: Colors.primary + '15' }]}>
                <Ionicons name="options-outline" size={18} color={Colors.primary} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>Share pace, schedule and group size</Text>
                <Text style={styles.rowSubtitle}>Shown to travelers who can find you in discovery</Text>
              </View>
            </View>
            {savingShare ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <Switch
                value={shareCompat}
                onValueChange={handleShareToggle}
                trackColor={{ false: Colors.border, true: Colors.primary }}
                thumbColor={Colors.white}
                accessibilityLabel="Share pace, schedule and group size"
              />
            )}
          </View>
          <TouchableOpacity
            style={styles.row}
            onPress={() => router.push({ pathname: '/(app)/profile/preferences', params: { from: 'privacy' } } as never)}
            activeOpacity={0.7}
          >
            <View style={styles.rowLeft}>
              <View style={[styles.iconBox, { backgroundColor: Colors.accent + '15' }]}>
                <Ionicons name="list-outline" size={18} color={Colors.accent} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>Travel preferences</Text>
                <Text style={styles.rowSubtitle}>Styles, interests, languages, pace, schedule, group size</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={16} color={Colors.placeholder} />
          </TouchableOpacity>
        </ShadowView>

        {/* Trip shown in discovery */}
        <Text style={styles.sectionLabel}>Trip shown in discovery</Text>
        <ShadowView style={styles.card}>
          {[{ id: null as string | null, label: "Don't show a trip", sub: 'Only your city is shown' },
            ...shareableTrips.map((t) => ({ id: t.id as string | null, label: t.destination, sub: `${t.startDate.toLocaleDateString()} – ${t.endDate.toLocaleDateString()}` }))]
            .map((o) => (
              <TouchableOpacity
                key={o.id ?? 'none'}
                style={styles.row}
                onPress={() => handleSharedTrip(o.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected: sharedTripId === o.id }}
                activeOpacity={0.7}
              >
                <Ionicons name={sharedTripId === o.id ? 'radio-button-on' : 'radio-button-off'} size={20} color={sharedTripId === o.id ? Colors.primary : Colors.placeholder} />
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle}>{o.label}</Text>
                  <Text style={styles.rowSubtitle}>{o.sub}</Text>
                </View>
              </TouchableOpacity>
            ))}
          <View style={styles.infoCard}>
            <Ionicons name="information-circle-outline" size={16} color={Colors.textSecondary} />
            <Text style={styles.infoText}>
              {discoverable
                ? 'Only the destination and dates of the chosen trip are shown, so travelers going there can find you. Your itinerary, notes and exact location stay private.'
                : 'Takes effect when traveler discovery is on. Only the destination and dates are ever shown.'}
            </Text>
          </View>
        </ShadowView>

        {/* Blocked Users */}
        <Text style={styles.sectionLabel}>Safety</Text>
        <ShadowView style={styles.card}>
          <TouchableOpacity
            style={styles.row}
            onPress={() => router.push('/(app)/profile/blocked-users' as never)}
            activeOpacity={0.7}
          >
            <View style={styles.rowLeft}>
              <View style={[styles.iconBox, { backgroundColor: Colors.error + '15' }]}>
                <Ionicons name="ban-outline" size={18} color={Colors.error} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>Blocked users</Text>
                <Text style={styles.rowSubtitle}>Manage your block list</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={16} color={Colors.placeholder} />
          </TouchableOpacity>
        </ShadowView>

        <Text style={styles.footer}>
          Your exact location is never stored or shared. Traveler discovery uses city names only.
        </Text>
      </ScrollView>
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
    backgroundColor: Colors.background,
  },
  navTitle: { fontFamily: Fonts.display, fontSize: FontSize.lg, color: Colors.textPrimary },
  content: { padding: Spacing.lg, paddingBottom: Spacing['3xl'], gap: Spacing.sm },
  sectionLabel: { fontFamily: Fonts.display, fontSize: FontSize.lg, color: Colors.textPrimary, marginTop: Spacing.xl, marginBottom: Spacing.sm },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  rowLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1 },
  rowTitle: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  rowSubtitle: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: Colors.background,
    padding: Spacing.md,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    borderRadius: Radius.md,
  },
  infoText: { flex: 1, fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 18 },
  footer: {
    fontSize: FontSize.xs,
    color: Colors.placeholder,
    textAlign: 'center',
    marginTop: Spacing.xl,
    lineHeight: 18,
    paddingHorizontal: Spacing.lg,
  },
});
