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
    body: 'Your data is used exclusively to provide the SoloTravelSoul experience. We do not sell your data. We do not use it for advertising. Trip and journal data is stored in Firebase (Google Cloud) with end-to-end security rules that allow only you to access your content.',
  },
  {
    title: 'Photos and uploads',
    body: 'Profile photos and journal photos you upload are stored in Firebase Storage and are accessible only to your authenticated account. We compress images before upload to minimize storage use.',
  },
  {
    title: 'Third-party services',
    body: 'We use Firebase (auth, Firestore, Storage) by Google. Firebase collects basic telemetry as part of its infrastructure. Map tiles are provided by OpenStreetMap contributors (openstreetmap.org). No other third-party analytics or tracking SDKs are included in this version.',
  },
  {
    title: 'Data deletion',
    body: 'You can delete your account at any time from the Profile screen. Deleting your account permanently removes your profile, trips, itinerary, journal entries, and saved places. Messages you sent in group or direct chats may remain visible to other participants as "Deleted User" — they are not recoverable. To request assistance with data removal, email privacy@solotravelsoul.app.',
  },
  {
    title: 'Contact',
    body: 'For privacy questions, contact: privacy@solotravelsoul.app\n\nLast updated: May 2026',
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
