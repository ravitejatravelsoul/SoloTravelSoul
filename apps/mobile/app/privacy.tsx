import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Text, Divider } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';

const SECTIONS = [
  {
    title: 'What we collect',
    body: 'We collect the email address and name you provide at sign-up, your trip and itinerary data, journal entries, and optional profile information (photo, bio, preferences). Location data is never collected in the background.',
  },
  {
    title: 'How we use it',
    body: 'Your data is used exclusively to provide the SoloTravelSoul experience. We do not sell your data. We do not use it for advertising. Private trip data is stored in Firebase (Google Cloud) and access is controlled by security rules. Social posts and travel journals marked Public can be read by other signed-in users; those marked Private can be read by their author.',
  },
  {
    title: 'Photos and uploads',
    body: 'Uploaded photos are stored in Firebase Storage or Cloudflare R2. Photos served through download links or public R2 URLs can be accessed by anyone who has the link, even when the associated journal or profile is private. We compress images before upload to minimize storage use.',
  },
  {
    title: 'Third-party services',
    body: 'We use Firebase (auth, Firestore, Storage) by Google. Firebase collects basic telemetry as part of its infrastructure. Map tiles are provided by OpenStreetMap contributors (openstreetmap.org). No other third-party analytics or tracking SDKs are included in this version.',
  },
  {
    title: 'Data deletion',
    body: 'You can delete your account at any time from the Profile screen. Deleting your account permanently removes your profile, trips, itinerary, journal entries, saved places, public profile, and traveler discovery data. Join requests you submitted are cancelled. Activity feed items you created are removed. Messages you sent in group or direct chats may remain visible to other participants. To request assistance with data removal, email privacy@solotravelsoul.app.',
  },
  {
    title: 'Community features',
    body: 'When you set your profile to Public, your display name, photo, bio, travel style, and destinations are visible to other authenticated users. Your email address is never shown publicly. The Nearby Travelers feature uses city-level text only — no GPS coordinates are stored or shared. You can opt out at any time from Profile → Privacy Settings. Blocking a user prevents new direct messages and hides your profile from direct lookup. Existing chat history remains visible to chat participants. Blocking does not make publicly shared content or photo links private.',
  },
  {
    title: 'Location data',
    body: 'With your permission, map features can use your current GPS location while the app is open. The "current city" and "destination" fields in your profile and in traveler discovery use free-text city names entered by you and are separate from map location access. No background location access is requested.',
  },
  {
    title: 'Contact',
    body: 'For privacy questions: privacy@solotravelsoul.app\nFor safety concerns: safety@solotravelsoul.app\n\nLast updated: October 2026',
  },
];

export default function PrivacyScreen() {
  return (
    <Screen scroll padded>
      <View style={styles.nav}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text variant="h3">Privacy Policy</Text>
        <View style={{ width: 24 }} />
      </View>

      <Text variant="caption" style={styles.intro}>
        SoloTravelSoul is built for travelers, by travelers. Your memories are yours.
      </Text>

      <Divider style={styles.divider} />

      {SECTIONS.map((s, i) => (
        <View key={i} style={styles.section}>
          <Text variant="label" style={styles.sectionTitle}>{s.title}</Text>
          <Text variant="body" style={styles.sectionBody}>{s.body}</Text>
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  nav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  intro: {
    color: Colors.textSecondary,
    lineHeight: 20,
    fontStyle: 'italic',
  },
  divider: { marginVertical: Spacing.xl },
  section: { marginBottom: Spacing.xl, gap: Spacing.xs },
  sectionTitle: { color: Colors.primary },
  sectionBody: { color: Colors.textSecondary, lineHeight: 22 },
});
