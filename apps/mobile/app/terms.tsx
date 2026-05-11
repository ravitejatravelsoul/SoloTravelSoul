import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Text, Divider } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';

const SECTIONS = [
  {
    title: '1. Acceptance',
    body: 'By using SoloTravelSoul, you agree to these Terms of Service. If you do not agree, do not use the app.',
  },
  {
    title: '2. Your account',
    body: 'You are responsible for maintaining the security of your account credentials. You must be 13 years or older to use SoloTravelSoul.',
  },
  {
    title: '3. Your content',
    body: 'You own all journal entries, photos, and trip data you create. By uploading content you grant SoloTravelSoul a limited license to store and display it to you within the app. We do not use your content for any other purpose.',
  },
  {
    title: '4. Acceptable use',
    body: 'You agree not to misuse the service, attempt unauthorized access, or use the app for commercial purposes without written permission.',
  },
  {
    title: '5. Disclaimer',
    body: 'SoloTravelSoul is provided "as is" without warranty of any kind. Travel information shown in the app (local attractions, recommendations) is for inspiration only. Always verify travel requirements, safety conditions, and entry requirements from official sources before traveling.',
  },
  {
    title: '6. Changes',
    body: 'We may update these terms. Continued use after changes constitutes acceptance. We will notify you of material changes via the app.\n\nLast updated: May 2026\n\nContact: legal@solotravelsoul.app',
  },
];

export default function TermsScreen() {
  return (
    <Screen scroll padded>
      <View style={styles.nav}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text variant="h3">Terms of Service</Text>
        <View style={{ width: 24 }} />
      </View>

      <Text variant="caption" style={styles.intro}>
        Simple, plain-English terms. No legalese.
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
