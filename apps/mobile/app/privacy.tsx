import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Text, Divider } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { CONTACT_EMAIL } from '@/constants/contact';

// Google Play requires a web resource for deletion requests (no app needed).
const WORKER_URL = (process.env.EXPO_PUBLIC_R2_UPLOAD_WORKER_URL ?? '').replace(/\/$/, '');
const DELETION_WEB_REQUEST = WORKER_URL
  ? ` You can also request deletion without the app at ${WORKER_URL}/account-deletion.`
  : '';

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
    body: 'Photos you upload with this version are stored in Cloudflare R2 and delivered only to signed-in users who are allowed to see the post, journal or profile they belong to. Photos uploaded with earlier versions may sit on direct storage links that anyone who has the link can open, even when the associated journal or profile is private. Cached copies on a device may remain visible until the app clears them. We compress images before upload to minimize storage use.',
  },
  {
    title: 'Third-party services',
    body: 'We use Firebase (auth, Firestore, Storage) by Google and Cloudflare (Workers and R2) to run the app and store photos. These providers process data on our behalf and collect basic telemetry as part of their infrastructure. Map tiles are provided by OpenStreetMap contributors (openstreetmap.org). No other third-party analytics or tracking SDKs are included in this version.',
  },
  {
    title: 'Data deletion',
    body: 'You can delete your account at any time from the Profile screen after confirming your password. Deletion permanently removes your profile, trips, itinerary, checklists, journal entries, saved places, public profile, travel preferences, traveler discovery data, travel posts, travel journals, likes, saves, follows, notifications, place reviews, activity feed items, join requests, the community trips and groups you created, and the photos you uploaded to our storage. Comments you left on posts by other travelers are replaced with an empty "Deleted User" placeholder so replies by others stay readable. Messages you sent in group or direct chats remain visible to the other participants, labelled "Deleted User". Safety reports you submitted are kept for moderation. Once deletion starts your account can no longer be changed. If deletion is interrupted, some of your data may already be removed; we retry it automatically, deletions that stay stuck are flagged to our team, and you can also sign in and retry. If your account has not been deleted, contact ' + CONTACT_EMAIL + '.' + DELETION_WEB_REQUEST + ' To request assistance with data removal, email ' + CONTACT_EMAIL + '.',
  },
  {
    title: 'Community features',
    body: 'When you set your profile to Public, your display name, photo, bio, travel style, and destinations are visible to other authenticated users. Your email address is never shown publicly. The Nearby Travelers feature uses city-level text only — no GPS coordinates are stored or shared. Traveler discovery is off unless you turn it on in Profile → Privacy Settings, and you can turn it off at any time, which removes your discovery entry. Travel preferences are optional: travel styles, interests and languages are part of your public profile; pace, schedule and preferred group size are shown to other travelers only if you turn on sharing for them and discovery is on. If you choose one of your trips to show in discovery, only its destination and dates are shown — never its itinerary or notes. Companion matching is calculated on your device from what travelers chose to share; missing answers are never treated as a mismatch, and nothing is inferred about you. Starting account deletion or a moderator suspension removes you from discovery immediately. Blocking a user prevents their new direct messages, join requests, follows and comments, hides your profile from them when they open it, and is private. You may still appear in shared lists such as Nearby Travelers, existing chat history remains visible to chat participants, and blocking does not make publicly shared content or photo links private.',
  },
  {
    title: 'Join requests, groups and chats',
    body: 'When you ask to join a trip, the organizer sees your name, photo, bio and message, and (only if you share them) your travel answers. Trip organizers publish the trip, its dates, size and any expectations or budget note they write. People who know your email address can find your name and start a direct chat or add you to a group chat; you can leave a group chat at any time and block anyone. Members of a group chat can read its messages. We store a record of the Terms version you accepted and when. Safety reports you submit, and what they say, are visible to moderators.',
  },
  {
    title: 'Location data',
    body: 'With your permission, map features can use your current GPS location while the app is open. The "current city" and "destination" fields in your profile and in traveler discovery use free-text city names entered by you and are separate from map location access. No background location access is requested.',
  },
  {
    title: 'Contact',
    body: 'For privacy questions, safety concerns and account deletion requests: ' + CONTACT_EMAIL + '\n\nLast updated: October 2026',
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
