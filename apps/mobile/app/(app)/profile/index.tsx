import { useEffect, useState } from 'react';
import { useMediaSource } from '@/hooks/useMediaSource';
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
  Image,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Avatar, Chip, Button } from '@/components/ui';
import { getUserProfile } from '@solotravelsoul/firebase';
import { useAuthStore } from '@/stores/authStore';
import { ProfileStats } from '@/components/profile/ProfileStats';
import { PhotoGrid } from '@/components/profile/PhotoGrid';
import { JournalCard } from '@/components/journals/JournalCard';
import { TripCard } from '@/components/trips/TripCard';
import { BadgeRow } from '@/components/profile/BadgeRow';
import { useAuth } from '@/hooks/useAuth';
import { useSavedPlaces } from '@/hooks/useSavedPlaces';
import { useTrips } from '@/hooks/useTrips';
import { useAuthorPosts } from '@/hooks/usePosts';
import { useAuthorJournals } from '@/hooks/useJournals';
import { useFollowCounts } from '@/hooks/useFollows';
import { getUserInitials } from '@solotravelsoul/shared';
import { Colors, Gradients, Spacing, Radius, FontSize, FontWeight, Shadow, Fonts } from '@/constants/theme';
import { ToastContainer } from '@/components/ui/Toast';

type ProfileTab = 'posts' | 'journals' | 'trips';

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
      {rightLabel && <Text style={styles.settingsRightLabel}>{rightLabel}</Text>}
      {showChevron && <Ionicons name="chevron-forward" size={16} color={Colors.placeholder} />}
    </TouchableOpacity>
  );
}

export default function ProfileScreen() {
  const mediaSrc = useMediaSource();
  const { profile, logout, deleteAccount } = useAuth();
  const { savedPlaces } = useSavedPlaces();
  const { upcoming, past } = useTrips();
  const [activeTab, setActiveTab] = useState<ProfileTab>('posts');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteProgress, setDeleteProgress] = useState<string | null>(null);

  const uid = profile?.id ?? '';
  const { posts, loading: postsLoading } = useAuthorPosts(uid, 30);
  const { journals, loading: journalsLoading } = useAuthorJournals(uid, 20);
  const { followersCount, followingCount } = useFollowCounts(uid);
  const allTrips = [...upcoming, ...past];

  // If the app started without a connection the profile never loaded; after a few seconds offer a retry instead of a spinner that never ends.
  const authUid = useAuthStore((s) => s.user?.uid);
  const setProfile = useAuthStore((s) => s.setProfile);
  const [slow, setSlow] = useState(false);
  const [retrying, setRetrying] = useState(false);
  useEffect(() => {
    if (profile) { setSlow(false); return; }
    const t = setTimeout(() => setSlow(true), 6000);
    return () => clearTimeout(t);
  }, [profile]);
  const retryProfile = async () => {
    if (!authUid || retrying) return;
    setRetrying(true);
    try {
      const p = await getUserProfile(authUid);
      if (p && useAuthStore.getState().user?.uid === authUid) setProfile(p);
    } catch { /* still offline: the message stays */ }
    finally { setRetrying(false); }
  };

  if (!profile) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loader}>
          {slow ? (
            <View style={styles.retryBox}>
              <Ionicons name="cloud-offline-outline" size={44} color={Colors.textSecondary} />
              <Text style={styles.emptyTabText}>Could not load your profile</Text>
              <Text variant="caption" center>Check your connection, then try again.</Text>
              <Button label="Try again" onPress={retryProfile} loading={retrying} />
            </View>
          ) : (
            <ActivityIndicator size="large" color={Colors.primary} />
          )}
        </View>
      </SafeAreaView>
    );
  }

  const initials = getUserInitials(profile.name);
  const countriesCount = profile.countriesVisited?.length ?? 0;
  const postsCount = posts.length;
  const journalsCount = journals.length;

  const handleLogout = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: logout },
    ]);
  };

  const handleDeletePress = () => {
    Alert.alert(
      'Delete account',
      'This permanently deletes your account, trips, journal entries, and saved places. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', style: 'destructive', onPress: () => { setDeletePassword(''); setDeleteError(null); setShowDeleteModal(true); } },
      ]
    );
  };

  const handleDeleteConfirm = async () => {
    if (!deletePassword.trim()) return;
    setDeleteLoading(true);
    setDeleteProgress(null);
    setDeleteError(null);
    const success = await deleteAccount(
      deletePassword,
      (p) => setDeleteProgress(p.totalSteps ? `Deleting… ${p.completedSteps}/${p.totalSteps} steps` : 'Deleting…'),
      setDeleteError,
    );
    setDeleteProgress(null);
    setDeleteLoading(false);
    if (success) setShowDeleteModal(false);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* ── Top bar ── */}
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>{profile.name}</Text>
        <View style={styles.topBarActions}>
          <TouchableOpacity onPress={() => router.push('/(app)/post/create' as never)} hitSlop={10} style={styles.addPostBtn} accessibilityRole="button" accessibilityLabel="Create a post">
            <Ionicons name="add" size={26} color={Colors.white} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>

        {/* ── Cover + Avatar ── */}
        <View style={styles.coverWrap}>
          {profile.coverPhotoURL ? (
            <Image source={mediaSrc(profile.coverPhotoURL)} style={styles.cover} resizeMode="cover" />
          ) : (
            <LinearGradient
              colors={Gradients.hero}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.cover}
            />
          )}
          <View style={styles.avatarOverlap}>
            <Avatar uri={profile.photoURL} initials={initials} size={88} />
          </View>
        </View>

        {/* ── Identity ── */}
        <View style={styles.identity}>
          <Text style={styles.name}>{profile.name}</Text>
          {(profile.city || profile.country) && (
            <View style={styles.locationRow}>
              <Ionicons name="location-outline" size={13} color={Colors.textSecondary} />
              <Text style={styles.location}>{[profile.city, profile.country].filter(Boolean).join(', ')}</Text>
            </View>
          )}
          {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}

          <TouchableOpacity
            style={styles.editProfileBtn}
            onPress={() => router.push('/(app)/profile/edit')}
            activeOpacity={0.8}
          >
            <Ionicons name="pencil-outline" size={14} color={Colors.primary} />
            <Text style={styles.editProfileText}>Edit Profile</Text>
          </TouchableOpacity>
        </View>

        {/* ── Stats ── */}
        <ProfileStats
          stats={[
            { label: 'Posts', value: postsCount },
            { label: 'Journals', value: journalsCount },
            { label: 'Trips', value: allTrips.length },
            { label: 'Countries', value: countriesCount },
            {
              label: 'Followers',
              value: followersCount,
              onPress: () => router.push(`/(app)/profile/followers` as never),
            },
            {
              label: 'Following',
              value: followingCount,
              onPress: () => router.push(`/(app)/profile/following` as never),
            },
          ]}
        />

        {/* ── Badges ── */}
        <BadgeRow uid={uid} />

        {/* ── Content Tabs ── */}
        <View style={styles.tabs}>
          {(['posts', 'journals', 'trips'] as ProfileTab[]).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTab === tab }}
            >
              <Ionicons
                name={tab === 'posts' ? 'grid-outline' : tab === 'journals' ? 'book-outline' : 'map-outline'}
                size={20}
                color={activeTab === tab ? Colors.primaryDark : Colors.textSecondary}
              />
              <Text style={[styles.tabLabel, activeTab === tab && styles.tabLabelActive]}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Tab Content ── */}
        {activeTab === 'posts' && (
          postsLoading ? (
            <View style={styles.tabLoader}>
              <ActivityIndicator size="small" color={Colors.primary} />
            </View>
          ) : posts.filter(p => p.images.length > 0).length > 0 ? (
            <PhotoGrid posts={posts} />
          ) : (
            <View style={styles.emptyTab}>
              <Ionicons name="camera-outline" size={44} color={Colors.textSecondary} />
              <Text style={styles.emptyTabText}>No posts yet</Text>
              <TouchableOpacity
                style={styles.emptyTabBtn}
                onPress={() => router.push('/(app)/post/create' as never)}
              >
                <Text style={styles.emptyTabBtnText}>Share your first photo</Text>
              </TouchableOpacity>
            </View>
          )
        )}

        {activeTab === 'journals' && (
          <View style={styles.journalList}>
            {journalsLoading ? (
              <ActivityIndicator size="small" color={Colors.primary} style={{ padding: Spacing['3xl'] }} />
            ) : journals.length > 0 ? (
              journals.map((j) => <JournalCard key={j.journalId} journal={j} />)
            ) : (
              <View style={styles.emptyTab}>
                <Ionicons name="book-outline" size={44} color={Colors.textSecondary} />
                <Text style={styles.emptyTabText}>No journals yet</Text>
                <TouchableOpacity
                  style={styles.emptyTabBtn}
                  onPress={() => router.push('/(app)/journal/create' as never)}
                >
                  <Text style={styles.emptyTabBtnText}>Write your first journal</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {activeTab === 'trips' && (
          <View style={styles.tripList}>
            {allTrips.length > 0 ? (
              allTrips.map((t) => <TripCard key={t.id} trip={t} />)
            ) : (
              <View style={styles.emptyTab}>
                <Ionicons name="airplane-outline" size={44} color={Colors.textSecondary} />
                <Text style={styles.emptyTabText}>No trips yet</Text>
                <TouchableOpacity
                  style={styles.emptyTabBtn}
                  onPress={() => router.push('/(app)/trips/create')}
                >
                  <Text style={styles.emptyTabBtnText}>Plan your first trip</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* ── Travel Preferences ── */}
        {(profile.travelStyles ?? []).length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Travel style</Text>
            <View style={styles.chips}>
              {(profile.travelStyles ?? []).map((s) => <Chip key={s} label={s} />)}
            </View>
          </View>
        )}

        {/* ── Library & Community Settings ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Library</Text>
          <View style={styles.settingsCard}>
            <SettingsRow
              icon="heart"
              label="Saved Places"
              iconBg={Colors.error + '15'}
              iconColor={Colors.error}
              onPress={() => router.push('/(app)/saved-places' as never)}
              rightLabel={savedPlaces.length > 0 ? String(savedPlaces.length) : undefined}
            />
            <View style={styles.rowDivider} />
            <SettingsRow
              icon="bookmark-outline"
              label="Saved Posts"
              iconBg={Colors.warning + '15'}
              iconColor={Colors.warning}
              onPress={() => router.push('/(app)/saved-posts' as never)}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Community</Text>
          <View style={styles.settingsCard}>
            <SettingsRow
              icon="people-outline"
              label="Followers"
              iconBg={Colors.accent + '15'}
              iconColor={Colors.accent}
              onPress={() => router.push('/(app)/profile/followers' as never)}
              rightLabel={followersCount > 0 ? String(followersCount) : undefined}
            />
            <View style={styles.rowDivider} />
            <SettingsRow
              icon="person-add-outline"
              label="Following"
              iconBg={Colors.primary + '15'}
              iconColor={Colors.primary}
              onPress={() => router.push('/(app)/profile/following' as never)}
              rightLabel={followingCount > 0 ? String(followingCount) : undefined}
            />
            <View style={styles.rowDivider} />
            <SettingsRow
              icon="paper-plane-outline"
              label="My Join Requests"
              iconBg={Colors.accent + '15'}
              iconColor={Colors.accent}
              onPress={() => router.push('/(app)/profile/join-requests' as never)}
            />
            <View style={styles.rowDivider} />
            <SettingsRow
              icon="lock-closed-outline"
              label="Privacy Settings"
              iconBg={Colors.primary + '15'}
              iconColor={Colors.primary}
              onPress={() => router.push('/(app)/profile/privacy' as never)}
            />
            <View style={styles.rowDivider} />
            <SettingsRow
              icon="shield-checkmark-outline"
              label="Safety & Guidelines"
              iconBg={Colors.success + '15'}
              iconColor={Colors.success}
              onPress={() => router.push('/(app)/profile/safety' as never)}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>App</Text>
          <View style={styles.settingsCard}>
            <SettingsRow
              icon="document-text-outline"
              label="Terms of Service"
              iconBg={Colors.primary + '15'}
              iconColor={Colors.primary}
              onPress={() => router.push('/terms')}
            />
            <View style={styles.rowDivider} />
            <SettingsRow
              icon="shield-checkmark-outline"
              label="Privacy Policy"
              iconBg={Colors.primary + '15'}
              iconColor={Colors.primary}
              onPress={() => router.push('/privacy')}
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

        <TouchableOpacity style={styles.signOutBtn} onPress={handleLogout} activeOpacity={0.8}>
          <Ionicons name="log-out-outline" size={18} color={Colors.error} />
          <Text style={styles.signOutLabel}>Sign out</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.deleteAccountBtn} onPress={handleDeletePress} activeOpacity={0.8}>
          <Text style={styles.deleteAccountLabel}>Delete account</Text>
        </TouchableOpacity>

        <View style={{ height: Spacing['4xl'] }} />
      </ScrollView>

      {/* ── Delete account modal ── */}
      <Modal
        visible={showDeleteModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <SafeAreaView style={styles.modalSafe} edges={['top', 'bottom']}>
          <KeyboardAvoidingView
            style={styles.modalInner}
            behavior="padding"
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
                  This will permanently delete your account, trips, journal entries, and saved places. Messages sent in chats may remain visible as &quot;Deleted User&quot;. This action cannot be undone.
                </Text>
              </View>
              <Text style={styles.passwordLabel}>Enter your password to confirm</Text>
              <TextInput
                value={deletePassword}
                onChangeText={(t) => { setDeletePassword(t); setDeleteError(null); }}
                secureTextEntry
                placeholder="Your password"
                placeholderTextColor={Colors.placeholder}
                style={styles.passwordInput}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleDeleteConfirm}
              />
              {/* Above the button, so the keyboard (which covers what is below) never hides it. */}
              {deleteError ? (
                <Text style={styles.deleteErrorText} accessibilityLiveRegion="polite" accessibilityRole="alert">{deleteError}</Text>
              ) : null}
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
              {deleteLoading && deleteProgress ? (
                <Text style={styles.cancelLabel} accessibilityLiveRegion="polite">{deleteProgress}</Text>
              ) : null}
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowDeleteModal(false)}>
                <Text style={styles.cancelLabel}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
        <ToastContainer />
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  retryBox: { alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing['2xl'] },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing['2xl'],
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.background,
  },
  topBarTitle: { flex: 1, fontFamily: Fonts.display, fontSize: FontSize.xl, color: Colors.textPrimary, marginRight: Spacing.md },
  addPostBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.coral, alignItems: 'center', justifyContent: 'center', ...Shadow.md },
  topBarActions: { flexDirection: 'row', alignItems: 'center' },

  coverWrap: { position: 'relative', marginBottom: 44 },
  cover: { width: '100%', height: 170, borderBottomLeftRadius: Radius['2xl'], borderBottomRightRadius: Radius['2xl'] },
  avatarOverlap: {
    position: 'absolute',
    bottom: -44,
    left: Spacing['2xl'],
    borderWidth: 4,
    borderColor: Colors.background,
    borderRadius: 999,
  },

  identity: {
    paddingHorizontal: Spacing['2xl'],
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  name: { fontFamily: Fonts.displayHeavy, fontSize: 28, lineHeight: 36, color: Colors.textPrimary },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  location: { fontSize: FontSize.sm, color: Colors.textSecondary },
  bio: { fontSize: FontSize.md, color: Colors.textPrimary, lineHeight: 22, marginTop: 8 },
  editProfileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.xl,
    minHeight: 44,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: Colors.primaryDark,
    backgroundColor: Colors.surface,
  },
  editProfileText: { fontSize: FontSize.sm, color: Colors.primaryDark, fontWeight: FontWeight.bold },

  tabs: {
    flexDirection: 'row',
    backgroundColor: Colors.chipBackground,
    borderRadius: Radius.full,
    padding: 4,
    marginHorizontal: Spacing['2xl'],
    marginVertical: Spacing.md,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 5,
    minHeight: 44,
    borderRadius: Radius.full,
  },
  tabActive: { backgroundColor: Colors.surface, ...Shadow.sm },
  tabLabel: { fontSize: FontSize.sm, color: Colors.textSecondary },
  tabLabelActive: { color: Colors.primaryDark, fontWeight: FontWeight.bold },
  tabLoader: { padding: Spacing['3xl'], alignItems: 'center' },
  emptyTab: { alignItems: 'center', padding: Spacing['4xl'], gap: Spacing.md },
  emptyTabText: { fontFamily: Fonts.display, fontSize: FontSize.lg, color: Colors.textSecondary },
  emptyTabBtn: {
    paddingHorizontal: Spacing['2xl'],
    paddingVertical: Spacing.md,
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    marginTop: Spacing.sm,
  },
  emptyTabBtnText: { color: Colors.white, fontSize: FontSize.sm, fontWeight: FontWeight.semibold },

  journalList: { padding: Spacing['2xl'], gap: Spacing.md },
  tripList: { padding: Spacing['2xl'], gap: Spacing.sm },

  // Preferences
  section: { paddingHorizontal: Spacing['2xl'], paddingVertical: Spacing.lg },
  sectionLabel: {
    fontFamily: Fonts.display,
    fontSize: FontSize.lg,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },

  // Settings
  settingsCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    minHeight: 64,
    gap: Spacing.md,
  },
  settingsIconBox: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsLabel: { flex: 1, fontSize: FontSize.md, color: Colors.textPrimary },
  settingsRightLabel: { fontSize: FontSize.sm, color: Colors.textSecondary, marginRight: Spacing.sm },
  rowDivider: { height: 1, backgroundColor: Colors.borderLight, marginLeft: 72 },

  // Sign out / delete
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing['2xl'],
    paddingVertical: Spacing.lg,
    borderRadius: Radius.xl,
    backgroundColor: Colors.error + '10',
    marginBottom: Spacing.md,
  },
  signOutLabel: { fontSize: FontSize.md, color: Colors.error, fontWeight: FontWeight.medium },
  deleteAccountBtn: { alignItems: 'center', paddingVertical: Spacing.md, marginBottom: Spacing.lg },
  deleteAccountLabel: { fontSize: FontSize.sm, color: Colors.textSecondary },

  // Delete modal
  modalSafe: { flex: 1, backgroundColor: Colors.background },
  modalInner: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing['2xl'],
  },
  modalTitle: { fontFamily: Fonts.display, fontSize: FontSize.xl },
  modalBody: { padding: Spacing['2xl'], gap: Spacing.xl },
  warningBanner: {
    flexDirection: 'row',
    gap: Spacing.md,
    backgroundColor: Colors.error + '12',
    borderRadius: Radius.lg,
    padding: Spacing.lg,
  },
  warningText: { flex: 1, fontSize: FontSize.sm, color: Colors.textPrimary, lineHeight: 20 },
  passwordLabel: { fontSize: FontSize.md, fontWeight: FontWeight.medium, color: Colors.textPrimary },
  passwordInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.md,
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    height: 48,
  },
  deleteConfirmBtn: {
    backgroundColor: Colors.error,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    alignItems: 'center',
  },
  deleteConfirmBtnDisabled: { opacity: 0.5 },
  deleteConfirmLabel: { color: Colors.white, fontWeight: FontWeight.semibold, fontSize: FontSize.md },
  cancelBtn: { alignItems: 'center', padding: Spacing.md },
  cancelLabel: { color: Colors.textSecondary, fontSize: FontSize.md },
  deleteErrorText: { color: Colors.error, fontSize: FontSize.sm, lineHeight: 20, textAlign: 'center' },
});
