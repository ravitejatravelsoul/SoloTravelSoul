import { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { isModerator } from '@solotravelsoul/firebase';
import { useAuthStore } from '@/stores/authStore';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@/components/ui';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/constants/theme';

const GUIDELINES = [
  {
    icon: 'heart-outline' as const,
    title: 'Be respectful',
    body: 'Treat every traveler with kindness and respect, regardless of background, culture, or travel experience.',
  },
  {
    icon: 'person-outline' as const,
    title: 'Real profiles only',
    body: 'Use your real name and photo. Fake or misleading profiles are not allowed.',
  },
  {
    icon: 'shield-checkmark-outline' as const,
    title: 'Protect your privacy',
    body: 'Never share personal details (address, financial info) with people you haven\'t met. Meet in public first.',
  },
  {
    icon: 'ban-outline' as const,
    title: 'No harassment',
    body: 'Harassment, discrimination, or unwanted contact will result in account removal.',
  },
  {
    icon: 'warning-outline' as const,
    title: 'Report concerns',
    body: 'If something feels unsafe, report it immediately. We review all reports carefully.',
  },
];

export default function SafetyScreen() {
  const uid = useAuthStore((s) => s.user?.uid ?? '');
  const [moderator, setModerator] = useState(false);
  useEffect(() => { if (uid) isModerator(uid).then(setModerator); }, [uid]);
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Community Guidelines</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="shield-checkmark" size={40} color={Colors.primary} />
          </View>
          <Text style={styles.heroTitle}>SoloTravelSoul Community</Text>
          <Text style={styles.heroSubtitle}>
            A respectful, safe community for solo travelers. These guidelines keep everyone safe.
          </Text>
        </View>

        {/* Guidelines */}
        <Text style={styles.sectionLabel}>COMMUNITY GUIDELINES</Text>
        <View style={styles.card}>
          {GUIDELINES.map((g, idx) => (
            <View key={g.title}>
              <View style={styles.guidelineRow}>
                <View style={styles.guidelineIcon}>
                  <Ionicons name={g.icon} size={20} color={Colors.primary} />
                </View>
                <View style={styles.guidelineText}>
                  <Text style={styles.guidelineTitle}>{g.title}</Text>
                  <Text style={styles.guidelineBody}>{g.body}</Text>
                </View>
              </View>
              {idx < GUIDELINES.length - 1 && <View style={styles.divider} />}
            </View>
          ))}
        </View>

        {/* How to Report */}
        <Text style={styles.sectionLabel}>HOW TO REPORT</Text>
        <View style={styles.card}>
          {['Tap the 3-dot menu on any profile, trip, or group', 'Select "Report"', 'Choose the issue type and add details', 'Submit — we review all reports within 48 hours'].map((step, idx) => (
            <View key={idx} style={styles.stepRow}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepNumber}>{idx + 1}</Text>
              </View>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}
        </View>

        {/* How to Block */}
        <Text style={styles.sectionLabel}>HOW TO BLOCK</Text>
        <View style={styles.card}>
          <Text style={styles.bodyText}>
            Tap the 3-dot menu on any user&apos;s profile and select &quot;Block&quot;. Blocked users cannot see your profile, message you, or find you in discovery. Blocking is private and reversible.
          </Text>
        </View>

        {/* Links */}
        <Text style={styles.sectionLabel}>LEGAL & SUPPORT</Text>
        <View style={styles.card}>
          {moderator && (
            <TouchableOpacity style={styles.linkRow} onPress={() => router.push('/(app)/moderation' as never)} accessibilityLabel="Moderation queue">
              <Ionicons name="shield-outline" size={18} color={Colors.primary} />
              <Text style={styles.linkLabel}>Moderation queue</Text>
              <Ionicons name="chevron-forward" size={14} color={Colors.placeholder} />
            </TouchableOpacity>
          )}
          {moderator && <View style={styles.divider} />}
          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => router.push('/privacy')}
            activeOpacity={0.7}
          >
            <Ionicons name="document-text-outline" size={18} color={Colors.primary} />
            <Text style={styles.linkLabel}>Privacy Policy</Text>
            <Ionicons name="chevron-forward" size={14} color={Colors.placeholder} />
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => Linking.openURL('mailto:safety@solotravelsoul.app')}
            activeOpacity={0.7}
          >
            <Ionicons name="mail-outline" size={18} color={Colors.primary} />
            <Text style={styles.linkLabel}>safety@solotravelsoul.app</Text>
            <Ionicons name="chevron-forward" size={14} color={Colors.placeholder} />
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>
          SoloTravelSoul is rated 17+ for travel planning and user-generated content.
          All connections require host approval.
        </Text>
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
  content: { padding: Spacing.lg, paddingBottom: Spacing['3xl'] },
  hero: {
    alignItems: 'center',
    paddingVertical: Spacing['2xl'],
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  heroIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, textAlign: 'center' },
  heroSubtitle: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
    letterSpacing: 0.7,
    marginBottom: Spacing.sm,
    marginTop: Spacing.xl,
    marginLeft: 2,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  divider: { height: 1, backgroundColor: Colors.borderLight, marginLeft: Spacing.lg },
  guidelineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    padding: Spacing.lg,
  },
  guidelineIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.primary + '12',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  guidelineText: { flex: 1 },
  guidelineTitle: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary, marginBottom: 2 },
  guidelineBody: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20 },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    padding: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  stepBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  stepNumber: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.white },
  stepText: { flex: 1, fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20, paddingBottom: Spacing.sm },
  bodyText: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20, padding: Spacing.lg },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.lg,
  },
  linkLabel: { flex: 1, fontSize: FontSize.md, color: Colors.primary },
  footer: {
    fontSize: FontSize.xs,
    color: Colors.placeholder,
    textAlign: 'center',
    marginTop: Spacing['2xl'],
    lineHeight: 18,
  },
});
