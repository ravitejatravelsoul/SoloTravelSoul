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
import { Text } from '@/components/ui';
import { useProfile } from '@/hooks/useProfile';
import { useAuthStore } from '@/stores/authStore';
import { updateProfileVisibility, upsertNearbyTraveler, deleteNearbyTraveler } from '@solotravelsoul/firebase';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/constants/theme';

export default function PrivacySettingsScreen() {
  const { profile, updateProfile } = useProfile();
  const user = useAuthStore((s) => s.user);

  const [isPublic, setIsPublic] = useState(profile?.profileVisibility === 'public');
  const [discoverable, setDiscoverable] = useState(profile?.showInNearbyTravelers ?? false);
  const [savingVisibility, setSavingVisibility] = useState(false);
  const [savingDiscovery, setSavingDiscovery] = useState(false);

  useEffect(() => {
    setIsPublic(profile?.profileVisibility === 'public');
    setDiscoverable(profile?.showInNearbyTravelers ?? false);
  }, [profile?.profileVisibility, profile?.showInNearbyTravelers]);

  const handleVisibilityToggle = async (value: boolean) => {
    if (!user || !profile || savingVisibility) return;
    setSavingVisibility(true);
    setIsPublic(value);
    try {
      await updateProfileVisibility(user.uid, profile, value ? 'public' : 'private');
      await updateProfile({ profileVisibility: value ? 'public' : 'private' });
    } catch {
      setIsPublic(!value);
    } finally {
      setSavingVisibility(false);
    }
  };

  const handleDiscoveryToggle = async (value: boolean) => {
    if (!user || !profile || savingDiscovery) return;
    setSavingDiscovery(true);
    setDiscoverable(value);
    try {
      await updateProfile({ showInNearbyTravelers: value });
      if (value) {
        await upsertNearbyTraveler(user.uid, profile);
      } else {
        await deleteNearbyTraveler(user.uid);
      }
    } catch {
      setDiscoverable(!value);
    } finally {
      setSavingDiscovery(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Privacy Settings</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Profile Visibility */}
        <Text style={styles.sectionLabel}>PROFILE VISIBILITY</Text>
        <View style={styles.card}>
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
        </View>

        {/* Traveler Discovery */}
        <Text style={styles.sectionLabel}>TRAVELER DISCOVERY</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconBox, { backgroundColor: Colors.accent + '15' }]}>
                <Ionicons name="people-outline" size={18} color={Colors.accent} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>Show me to other travelers</Text>
                <Text style={styles.rowSubtitle}>
                  Appear in the Nearby Travelers list for your city
                </Text>
              </View>
            </View>
            {savingDiscovery ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <Switch
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
        </View>

        {/* Blocked Users */}
        <Text style={styles.sectionLabel}>SAFETY</Text>
        <View style={styles.card}>
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
        </View>

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
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  navTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  content: { padding: Spacing.lg, paddingBottom: Spacing['3xl'], gap: Spacing.sm },
  sectionLabel: {
    fontSize: 11,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
    letterSpacing: 0.7,
    marginTop: Spacing.md,
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
