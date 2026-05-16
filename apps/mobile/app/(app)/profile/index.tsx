import { useState } from 'react';
import {
  View,
  StyleSheet,
  Alert,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
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
  const { profile, logout, deleteAccount } = useAuth();
  const { savedPlaces } = useSavedPlaces();
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);

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

  const handleDeletePress = () => {
    Alert.alert(
      'Delete account',
      'This permanently deletes your account and all your trips, journal entries, and saved places. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => {
            setDeletePassword('');
            setShowDeleteModal(true);
          },
        },
      ]
    );
  };

  const handleDeleteConfirm = async () => {
    if (!deletePassword.trim()) return;
    setDeleteLoading(true);
    await deleteAccount(deletePassword);
    setDeleteLoading(false);
    setShowDeleteModal(false);
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

        {/* ── Delete account ── */}
        <TouchableOpacity style={styles.deleteAccountBtn} onPress={handleDeletePress} activeOpacity={0.8}>
          <Text style={styles.deleteAccountLabel}>Delete account</Text>
        </TouchableOpacity>

      </ScrollView>

      {/* ── Delete account confirmation modal ── */}
      <Modal
        visible={showDeleteModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <SafeAreaView style={styles.modalSafe} edges={['top', 'bottom']}>
          <KeyboardAvoidingView
            style={styles.modalInner}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowDeleteModal(false)}>
                <Ionicons name="close" size={22} color={Colors.textPrimary} />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Delete account</Text>
              <View style={{ width: 22 }} />
            </View>

            <View style={styles.modalBody}>
              <View style={styles.warningBanner}>
                <Ionicons name="warning-outline" size={20} color={Colors.error} />
                <Text style={styles.warningText}>
                  This will permanently delete your account and all associated data. This action cannot be undone.
                </Text>
              </View>

              <Text style={styles.passwordLabel}>Enter your password to confirm</Text>
              <TextInput
                value={deletePassword}
                onChangeText={setDeletePassword}
                secureTextEntry
                placeholder="Your password"
                placeholderTextColor={Colors.placeholder}
                style={styles.passwordInput}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleDeleteConfirm}
              />

              <TouchableOpacity
                style={[styles.deleteConfirmBtn, (!deletePassword.trim() || deleteLoading) && styles.deleteConfirmBtnDisabled]}
                onPress={handleDeleteConfirm}
                disabled={!deletePassword.trim() || deleteLoading}
                activeOpacity={0.8}
              >
                {deleteLoading ? (
                  <ActivityIndicator size="small" color={Colors.white} />
                ) : (
                  <Text style={styles.deleteConfirmLabel}>Permanently delete my account</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowDeleteModal(false)}>
                <Text style={styles.cancelLabel}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
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

  // Delete account link
  deleteAccountBtn: {
    alignItems: 'center',
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  deleteAccountLabel: {
    fontSize: FontSize.sm,
    color: Colors.placeholder,
    textDecorationLine: 'underline',
  },

  // Delete account modal
  modalSafe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  modalInner: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  modalBody: {
    padding: Spacing.lg,
    gap: Spacing.lg,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: Colors.error + '10',
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.error + '30',
  },
  warningText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.error,
    lineHeight: 20,
  },
  passwordLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  passwordInput: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontSize: FontSize.md,
    color: Colors.textPrimary,
  },
  deleteConfirmBtn: {
    backgroundColor: Colors.error,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md + 2,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  deleteConfirmBtnDisabled: { opacity: 0.45 },
  deleteConfirmLabel: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.white,
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  cancelLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
});
