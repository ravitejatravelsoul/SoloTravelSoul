import { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  TextInput,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Input, Button, Avatar } from '@/components/ui';
import { MultiSelectChips } from '@/components/ui/MultiSelectChips';
import { TagInput } from '@/components/ui/TagInput';
import { useProfile } from '@/hooks/useProfile';
import { useUpload } from '@/hooks/useUpload';
import { upsertUserLookup, upsertPublicProfile, updateUserProfile, updateOwnerPhotoInCommunityDocs } from '@solotravelsoul/firebase';
import { uploadProfilePhotoFromUri, isUploadsEnabled } from '@/utils/storageUpload';
import { getUserInitials } from '@solotravelsoul/shared';
import type { TravelStyle, Interest } from '@solotravelsoul/shared';
import { useAuthStore } from '@/stores/authStore';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

const TRAVEL_STYLE_OPTIONS: TravelStyle[] = ['solo', 'budget', 'luxury', 'adventure', 'cultural', 'food', 'digital-nomad', 'eco'];
const TRAVEL_STYLE_LABELS: Record<TravelStyle, string> = {
  solo: 'Solo', budget: 'Budget', luxury: 'Luxury', adventure: 'Adventure',
  cultural: 'Cultural', food: 'Food', 'digital-nomad': 'Digital Nomad', eco: 'Eco',
};

const INTEREST_OPTIONS: Interest[] = ['hiking', 'photography', 'food', 'nightlife', 'history', 'beach', 'languages', 'volunteering', 'yoga', 'art', 'sports', 'music'];
const INTEREST_LABELS: Record<Interest, string> = {
  hiking: 'Hiking', photography: 'Photography', food: 'Food', nightlife: 'Nightlife',
  history: 'History', beach: 'Beach', languages: 'Languages', volunteering: 'Volunteering',
  yoga: 'Yoga', art: 'Art', sports: 'Sports', music: 'Music',
};

const COMMON_LANGUAGES = ['English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Japanese', 'Chinese', 'Korean', 'Arabic', 'Hindi', 'Russian'];

const BIO_MAX = 500;

// EXPO_PUBLIC_R2_UPLOAD_WORKER_URL set → uploads go to the Worker media endpoint
// anything else / both missing                                           → disabled
const UPLOADS_ENABLED = isUploadsEnabled();

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

export default function EditProfileScreen() {
  const { profile, updateProfile } = useProfile();
  const user = useAuthStore((s) => s.user);
  const setProfile = useAuthStore((s) => s.setProfile);

  const [name, setName] = useState(profile?.name ?? '');
  const [city, setCity] = useState(profile?.city ?? '');
  const [country, setCountry] = useState(profile?.country ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [travelStyles, setTravelStyles] = useState<TravelStyle[]>(profile?.travelStyles ?? []);
  const [languages, setLanguages] = useState<string[]>(profile?.languages ?? []);
  const [countriesVisited, setCountriesVisited] = useState<string>(
    (profile?.countriesVisited ?? []).join(', ')
  );
  const [dreamDestinations, setDreamDestinations] = useState<string[]>(
    profile?.favoriteDestinations ?? []
  );
  const [interests, setInterests] = useState<Interest[]>(profile?.interests ?? []);
  const [saving, setSaving] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);

  const { trigger: pickAndUpload, isLoading: avatarLoading } = useUpload({
    uploadFn: (fileUri) => uploadProfilePhotoFromUri(user!.uid, fileUri),
    onSuccess: (url) => {
      setAvatarUri(url);
      if (__DEV__) console.log('[ProfilePhoto] upload succeeded, photoURL:', url.slice(0, 80));

      // Write photoURL to Firestore immediately so it survives app restarts
      // even if the user navigates away without pressing Save.
      if (user) {
        updateUserProfile(user.uid, { photoURL: url })
          .then(() => {
            if (profile) setProfile({ ...profile, photoURL: url });
            if (__DEV__) console.log('[ProfilePhoto] photoURL saved to users/' + user.uid);
            // Cascade to travelGroups and publicTrips so ownerPhotoURL is never stale
            updateOwnerPhotoInCommunityDocs(user.uid, url).catch(() => {});
          })
          .catch((err: Error) => {
            if (__DEV__) console.warn('[ProfilePhoto] immediate Firestore save failed:', err.message);
          });
      }
    },
    onError: (msg) => Alert.alert('Upload failed', msg),
    maxSizeMB: 5,
    source: 'library',
  });

  const handleAvatarPress = UPLOADS_ENABLED
    ? pickAndUpload
    : () => Alert.alert('Photo uploads', 'Photo uploads are temporarily disabled.');

  const toggleTravelStyle = useCallback((s: TravelStyle) => {
    setTravelStyles((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
  }, []);

  const toggleInterest = useCallback((i: Interest) => {
    setInterests((prev) => prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]);
  }, []);

  const toggleLanguage = useCallback((lang: string) => {
    setLanguages((prev) => prev.includes(lang) ? prev.filter((x) => x !== lang) : [...prev, lang]);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const trimmedName = name.trim();

      // Include the newly-uploaded photo URL in this single update so the
      // Firestore write, the Zustand store update, and the public profile
      // write all happen together — no race condition with a separate
      // onSuccess update.
      const updatedProfile = {
        name: trimmedName,
        city: city.trim(),
        country: country.trim(),
        bio: bio.trim().slice(0, BIO_MAX),
        travelStyles,
        languages,
        countriesVisited: countriesVisited.split(',').map((c) => c.trim()).filter(Boolean),
        favoriteDestinations: dreamDestinations,
        interests,
        // Only overwrite photoURL when the user uploaded a new photo this session.
        ...(avatarUri !== null ? { photoURL: avatarUri } : {}),
      };

      await updateProfile(updatedProfile);

      if (user && trimmedName) {
        const initials = getUserInitials(trimmedName) || trimmedName[0]?.toUpperCase() || 'T';
        const latestPhotoURL = avatarUri ?? profile?.photoURL ?? null;
        await upsertUserLookup(user.uid, trimmedName, user.email ?? '', initials, latestPhotoURL).catch(() => {});
      }

      if (user && profile && profile.profileVisibility === 'public') {
        const fullProfile = { ...profile, ...updatedProfile, id: user.uid };
        await upsertPublicProfile(user.uid, fullProfile).catch(() => {});
      }

      router.back();
    } finally {
      setSaving(false);
    }
  };

  const displayUri = avatarUri ?? profile?.photoURL;
  const initials = getUserInitials(name || profile?.name || '?');

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Edit Profile</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving} hitSlop={12}>
          <Text style={[styles.saveLabel, saving && { opacity: 0.5 }]}>Save</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Avatar */}
        <View style={styles.avatarRow}>
          <Avatar
            uri={displayUri}
            initials={initials}
            size={96}
            onPress={handleAvatarPress}
            showEditBadge={UPLOADS_ENABLED}
            loading={avatarLoading}
          />
          <Text variant="caption" style={styles.photoHint}>
            {UPLOADS_ENABLED ? 'Tap to change photo' : 'Photo uploads coming soon'}
          </Text>
        </View>

        {/* Basic info */}
        <SectionHeader title="BASICS" />
        <View style={styles.card}>
          <Input label="Full name" value={name} onChangeText={setName} autoCapitalize="words" />
          <Input label="Current city" value={city} onChangeText={setCity} autoCapitalize="words" placeholder="e.g. Tokyo, Japan" />
          <Input label="Home country" value={country} onChangeText={setCountry} autoCapitalize="words" placeholder="e.g. India" />
        </View>

        {/* Bio */}
        <SectionHeader title="ABOUT" />
        <View style={styles.card}>
          <View>
            <TextInput
              style={styles.bioInput}
              value={bio}
              onChangeText={(t) => setBio(t.slice(0, BIO_MAX))}
              multiline
              numberOfLines={4}
              placeholder="Tell fellow travelers who you are…"
              placeholderTextColor={Colors.placeholder}
              textAlignVertical="top"
            />
            <Text style={styles.charCount}>{bio.length}/{BIO_MAX}</Text>
          </View>
        </View>

        {/* Travel Style */}
        <SectionHeader title="TRAVEL STYLE" />
        <View style={styles.card}>
          <MultiSelectChips
            options={TRAVEL_STYLE_OPTIONS}
            selected={travelStyles}
            onToggle={toggleTravelStyle}
            labelMap={TRAVEL_STYLE_LABELS}
          />
        </View>

        {/* Languages */}
        <SectionHeader title="LANGUAGES SPOKEN" />
        <View style={styles.card}>
          <MultiSelectChips
            options={COMMON_LANGUAGES as string[]}
            selected={languages}
            onToggle={toggleLanguage as (v: string) => void}
          />
        </View>

        {/* Countries Visited */}
        <SectionHeader title="COUNTRIES VISITED" />
        <View style={styles.card}>
          <Input
            label="Countries (comma-separated)"
            value={countriesVisited}
            onChangeText={setCountriesVisited}
            placeholder="Japan, Italy, Thailand…"
          />
        </View>

        {/* Dream Destinations */}
        <SectionHeader title="DREAM DESTINATIONS" />
        <View style={styles.card}>
          <TagInput
            tags={dreamDestinations}
            onChange={setDreamDestinations}
            maxTags={5}
            placeholder="Add a destination"
          />
        </View>

        {/* Interests */}
        <SectionHeader title="INTERESTS" />
        <View style={styles.card}>
          <MultiSelectChips
            options={INTEREST_OPTIONS}
            selected={interests}
            onToggle={toggleInterest}
            labelMap={INTEREST_LABELS}
          />
        </View>

        <View style={styles.saveRow}>
          <Button label="Save changes" onPress={handleSave} loading={saving} fullWidth size="lg" />
        </View>
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
  saveLabel: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.primary },
  scroll: { flex: 1 },
  content: { paddingBottom: Spacing['3xl'] },
  avatarRow: { alignItems: 'center', paddingVertical: Spacing['2xl'], gap: Spacing.sm },
  photoHint: { color: Colors.textSecondary },
  sectionHeader: {
    fontSize: 11,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
    letterSpacing: 0.7,
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.xl,
    marginBottom: Spacing.sm,
  },
  card: {
    backgroundColor: Colors.surface,
    marginHorizontal: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  bioInput: {
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    minHeight: 100,
    lineHeight: 22,
  },
  charCount: {
    fontSize: FontSize.xs,
    color: Colors.placeholder,
    textAlign: 'right',
    marginTop: 4,
  },
  saveRow: { marginHorizontal: Spacing.lg, marginTop: Spacing.xl },
});
