import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Text, Divider } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { CONTACT_EMAIL } from '@/constants/contact';
import { TERMS_VERSION, COMPATIBILITY_NOTICE, PLATFORM_ROLE, NOT_EMERGENCY_SERVICE, REPORT_BLOCK_LEAVE, SAFETY_TIPS } from '@solotravelsoul/shared';

const SECTIONS = [
  {
    title: '1. Acceptance',
    body: 'By using SoloTravelSoul, you agree to these Terms of Service and the Privacy Policy. You must accept them before you can post, send messages or ask to join a trip. If you do not agree, do not use the app.',
  },
  {
    title: '2. Your account',
    body: 'You are responsible for maintaining the security of your account credentials. You must be 13 years or older to use SoloTravelSoul.',
  },
  {
    title: '3. Your content',
    body: 'You own the journal entries, photos, posts and trip data you create. By adding content you give SoloTravelSoul a limited license to store, process and display it in the app to the audience you choose (for example, public posts and public trips are visible to other signed-in users, private items only to you), and to review it when it is reported. We do not use your content for advertising or sell it.',
  },
  {
    title: '4. Acceptable use',
    body: 'You agree not to misuse the service, attempt unauthorized access, or use the app for commercial purposes without written permission.',
  },
  {
    title: '5. Community standards',
    body: 'SoloTravelSoul has zero tolerance for objectionable content and abusive users. Do not post or send content that is illegal, sexually explicit, hateful, harassing, threatening, violent, deceptive or that infringes the rights of others, and do not impersonate anyone. ' + REPORT_BLOCK_LEAVE + ' We review reports, remove content that breaks these rules and suspend or remove the accounts responsible.',
  },
  {
    title: '6. Meeting other travelers',
    body: COMPATIBILITY_NOTICE + '\n\n' + SAFETY_TIPS.map((t) => t.title + ': ' + t.body).join('\n') + '\n\n' + NOT_EMERGENCY_SERVICE,
  },
  {
    title: '7. What SoloTravelSoul does and does not do',
    body: PLATFORM_ROLE + ' We moderate reported content and accounts as described above, but we cannot supervise every conversation or meeting between users.',
  },
  {
    title: '8. Disclaimer',
    body: 'SoloTravelSoul is provided "as is" without warranty of any kind. Travel information shown in the app (local attractions, recommendations) is for inspiration only. Always verify travel requirements, safety conditions, and entry requirements from official sources before traveling. Nothing in these Terms limits any right you have under the law that applies to you.',
  },
  {
    title: '9. Changes',
    body: 'We may update these terms. If a change is material we will ask you to review and accept the new version in the app before you continue to post or message. Continued use after other changes constitutes acceptance.\n\nVersion: ' + TERMS_VERSION + '\nLast updated: October 2026\n\nContact: ' + CONTACT_EMAIL,
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
