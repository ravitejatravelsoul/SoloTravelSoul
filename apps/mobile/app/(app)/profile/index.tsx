import { View, StyleSheet, Alert, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Avatar, Chip } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { useSavedPlaces } from '@/hooks/useSavedPlaces';
import { getUserInitials } from '@solotravelsoul/shared';
import { Colors, Gradients, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/constants/theme';

export default function ProfileScreen() {
  const { profile, logout } = useAuth();
  const { savedPlaces } = useSavedPlaces();

  if (!profile) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const initials = getUserInitials(profile.name);

  const handleLogout = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        {/* ── Gradient hero ── */}
        <LinearGradient
          colors={Gradients.hero}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroCircle} />
          <Avatar uri={profile.photoURL} initials={initials} size={80} />
          <Text style={styles.heroName}>{profile.name}</Text>
          <Text style={styles.heroEmail}>{profile.email}</Text>
          {(profile.city || profile.country) ? (
            <View style={styles.locationRow}>
              <Ionicons name="location-outline" size={12} color="rgba(255,255,255,0.7)" />
              <Text style={styles.heroLocation}>
                {[profile.city, profile.country].filter(Boolean).join(', ')}
              </Text>
            </View>
          ) : null}
          <TouchableOpacity
            style={styles.editBtn}
            onPress={() => router.push('/(app)/profile/edit')}
            activeOpacity={0.8}
          >
            <Ionicons name="pencil-outline" size={14} color={Colors.white} />
            <Text style={styles.editBtnLabel}>Edit profile</Text>
          </TouchableOpacity>
        </LinearGradient>

        {/* ── Bio ── */}
        {profile.bio ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>ABOUT</Text>
            <View style={styles.bioCard}>
              <Text variant="body" style={styles.bioText}>{profile.bio}</Text>
            </View>
          </View>
        ) : null}

        {/* ── Travel preferences ── */}
        {profile.preferences.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>TRAVEL STYLE</Text>
            <View style={styles.chips}>
              {profile.preferences.map((p) => <Chip key={p} label={p} />)}
            </View>
          </View>
        )}

        {profile.favoriteDestinations.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>FAVORITE DESTINATIONS</Text>
            <View style={styles.chips}>
              {profile.favoriteDestinations.map((d) => <Chip key={d} label={d} />)}
            </View>
          </View>
        )}

        {/* ── Library ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>LIBRARY</Text>
          <View style={styles.settingsCard}>
            <SettingsRow
              icon="heart"
              label="Saved Places"
              iconBg={Colors.error + '15'}
              iconColor={Colors.error}
              onPress={() => router.push('/(app)/saved-places' as never)}
              rightLabel={savedPlaces.length > 0 ? String(savedPlaces.length) : undefined}
            />
          </View>
        </View>

        {/* ── App settings ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>APP</Text>
          <View style={styles.settingsCard}>
            <SettingsRow
              icon="shield-checkmark-outline"
              label="Privacy Policy"
              iconBg={Colors.primary + '15'}
              iconColor={Colors.primary}
              onPress={() => router.push('/privacy')}
            />
            <View style={styles.rowDivider} />
            <SettingsRow
              icon="document-text-outline"
              label="Terms of Service"
              iconBg={Colors.primary + '15'}
              iconColor={Colors.primary}
              onPress={() => router.push('/terms')}
            />
            <View style={styles.rowDivider} />
            <SettingsRow
              icon="information-circle-outline"
              label="Version 1.0.0"
              iconBg={Colors.chipBackground}
              iconColor={Colors.textSecondary}
              onPress={() => {}}
              showChevron={false}
            />
          </View>
        </View>

        {/* ── Sign out ── */}
        <TouchableOpacity style={styles.signOutBtn} onPress={handleLogout} activeOpacity={0.8}>
          <Ionicons name="log-out-outline" size={18} color={Colors.error} />
          <Text style={styles.signOutLabel}>Sign out</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

function SettingsRow({
  icon,
  label,
  iconBg,
  iconColor,
  onPress,
  showChevron = true,
  rightLabel,
}: {
  icon: string;
  label: string;
  iconBg: string;
  iconColor: string;
  onPress: () => void;
  showChevron?: boolean;
  rightLabel?: string;
}) {
  return (
    <TouchableOpacity
      style={styles.settingsRow}
      onPress={onPress}
      activeOpacity={0.7}
      disabled={!showChevron}
    >
      <View style={[styles.settingsIconBox, { backgroundColor: iconBg }]}>
        <Ionicons name={icon as never} size={18} color={iconColor} />
      </View>
      <Text variant="body" style={styles.settingsLabel}>{label}</Text>
      {rightLabel && (
        <Text style={styles.settingsRightLabel}>{rightLabel}</Text>
      )}
      {showChevron && (
        <Ionicons name="chevron-forward" size={16} color={Colors.placeholder} />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingBottom: Spacing['3xl'] },

  // Hero
  hero: {
    paddingTop: Spacing['3xl'],
    paddingBottom: Spacing['2xl'],
    paddingHorizontal: Spacing['2xl'],
    alignItems: 'center',
    gap: Spacing.sm,
    overflow: 'hidden',
  },
  heroCircle: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(255,255,255,0.06)',
    top: -70,
    right: -50,
  },
  heroName: {
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.bold,
    color: Colors.white,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  heroEmail: {
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.72)',
    textAlign: 'center',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  heroLocation: {
    fontSize: FontSize.xs,
    color: 'rgba(255,255,255,0.60)',
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.md,
  },
  editBtnLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.white,
  },

  // Sections
  section: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
    letterSpacing: 0.7,
    marginBottom: Spacing.md,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },

  bioCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  bioText: { color: Colors.textSecondary, lineHeight: 22 },

  // Settings card
  settingsCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  rowDivider: {
    height: 1,
    backgroundColor: Colors.borderLight,
    marginLeft: 56,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 14,
  },
  settingsIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsLabel: { flex: 1 },
  settingsRightLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
    marginRight: Spacing.xs,
  },

  // Sign out
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.error + '35',
    backgroundColor: Colors.error + '08',
  },
  signOutLabel: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.error,
  },
});
