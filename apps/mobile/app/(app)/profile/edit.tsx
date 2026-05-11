import { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Text, Input, Button, Chip, Avatar } from '@/components/ui';
import { useProfile } from '@/hooks/useProfile';
import { useUpload } from '@/hooks/useUpload';
import { uploadProfilePhoto, upsertUserLookup } from '@solotravelsoul/firebase';
import { getUserInitials } from '@solotravelsoul/shared';
import { useAuthStore } from '@/stores/authStore';
import { Colors, Spacing } from '@/constants/theme';

const PREFERENCE_OPTIONS = [
  'Adventure', 'Culture', 'Food', 'Nature', 'Beach',
  'City', 'History', 'Photography', 'Budget', 'Luxury',
];

export default function EditProfileScreen() {
  const { profile, updateProfile } = useProfile();
  const user = useAuthStore((s) => s.user);

  const [name, setName] = useState(profile?.name ?? '');
  const [city, setCity] = useState(profile?.city ?? '');
  const [country, setCountry] = useState(profile?.country ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [preferences, setPreferences] = useState<string[]>(profile?.preferences ?? []);
  const [destinations, setDestinations] = useState(profile?.favoriteDestinations.join(', ') ?? '');
  const [languages, setLanguages] = useState(profile?.languages.join(', ') ?? '');
  const [saving, setSaving] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);

  const { trigger: pickAndUpload, isLoading: avatarLoading } = useUpload({
    uploadFn: (blob) => uploadProfilePhoto(user!.uid, blob),
    onSuccess: (url) => {
      setAvatarUri(url);
      updateProfile({ photoURL: url });
    },
    onError: (msg) => Alert.alert('Upload failed', msg),
    maxSizeMB: 5,
    source: 'library',
  });

  const togglePreference = (p: string) => {
    setPreferences((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    const trimmedName = name.trim();
    await updateProfile({
      name: trimmedName,
      city: city.trim(),
      country: country.trim(),
      bio: bio.trim(),
      preferences,
      favoriteDestinations: destinations.split(',').map((d) => d.trim()).filter(Boolean),
      languages: languages.split(',').map((l) => l.trim()).filter(Boolean),
    });
    if (user && trimmedName) {
      const initials = getUserInitials(trimmedName) || trimmedName[0]?.toUpperCase() || 'T';
      await upsertUserLookup(user.uid, trimmedName, user.email ?? '', initials).catch(() => {});
    }
    setSaving(false);
    router.back();
  };

  const displayUri = avatarUri ?? profile?.photoURL;
  const initials = getUserInitials(name || profile?.name || '?');

  return (
    <Screen scroll padded>
      <View style={styles.nav}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text variant="h3">Edit Profile</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Avatar */}
      <View style={styles.avatarRow}>
        <Avatar
          uri={displayUri}
          initials={initials}
          size={96}
          onPress={pickAndUpload}
          showEditBadge
          loading={avatarLoading}
        />
        <Text variant="caption" style={styles.photoHint}>
          Tap to change photo
        </Text>
      </View>

      <View style={styles.form}>
        <Input label="Full name" value={name} onChangeText={setName} autoCapitalize="words" />
        <Input label="City" value={city} onChangeText={setCity} autoCapitalize="words" placeholder="e.g. Mumbai" />
        <Input label="Country" value={country} onChangeText={setCountry} autoCapitalize="words" placeholder="e.g. India" />
        <Input
          label="Bio"
          value={bio}
          onChangeText={setBio}
          multiline
          numberOfLines={3}
          style={{ minHeight: 80, textAlignVertical: 'top' }}
          placeholder="A few words about you as a traveler…"
        />

        <Text variant="label">Travel preferences</Text>
        <View style={styles.chips}>
          {PREFERENCE_OPTIONS.map((p) => (
            <Chip
              key={p}
              label={p}
              selected={preferences.includes(p)}
              onPress={() => togglePreference(p)}
            />
          ))}
        </View>

        <Input
          label="Favorite destinations"
          value={destinations}
          onChangeText={setDestinations}
          placeholder="Japan, Italy, Peru (comma-separated)"
        />
        <Input
          label="Languages"
          value={languages}
          onChangeText={setLanguages}
          placeholder="English, Spanish (comma-separated)"
        />

        <Button label="Save changes" onPress={handleSave} loading={saving} fullWidth size="lg" />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  nav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing['2xl'],
  },
  avatarRow: {
    alignItems: 'center',
    marginBottom: Spacing['2xl'],
    gap: Spacing.sm,
  },
  photoHint: { color: Colors.textSecondary },
  form: { gap: Spacing.lg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
});
