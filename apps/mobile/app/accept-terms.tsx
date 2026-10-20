import { useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { router, Redirect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui';
import { acceptTerms } from '@solotravelsoul/firebase';
import { TERMS_VERSION, COMPATIBILITY_NOTICE, SAFETY_TIPS, NOT_EMERGENCY_SERVICE } from '@solotravelsoul/shared';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { useAuth } from '@/hooks/useAuth';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

/**
 * Terms acceptance before anything user-generated can be created. The (app) layout sends a signed-in account here
 * until the current TERMS_VERSION is accepted (new accounts accept on the sign-up screen); declining signs out.
 * This is a client gate: a modified client could skip it, so it is not a substitute for server-side enforcement.
 */
export default function AcceptTermsScreen() {
  const profile = useAuthStore((s) => s.profile);
  const user = useAuthStore((s) => s.user);
  const setProfile = useAuthStore((s) => s.setProfile);
  const addToast = useUIStore((s) => s.addToast);
  const { logout } = useAuth();
  const [saving, setSaving] = useState(false);

  if (!user) return <Redirect href="/(auth)/login" />;
  if (profile && profile.termsAcceptedVersion === TERMS_VERSION) return <Redirect href="/(app)/home" />;

  const accept = async () => {
    setSaving(true);
    try {
      await acceptTerms(user.uid, TERMS_VERSION);
      if (profile) setProfile({ ...profile, termsAcceptedVersion: TERMS_VERSION });
      router.replace('/(app)/home');
    } catch {
      addToast('Could not save your agreement. Check your connection and try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Ionicons name="shield-checkmark" size={40} color={Colors.primary} />
        <Text style={styles.title}>Before you continue</Text>
        <Text style={styles.body}>
          Please review and accept our Terms of Service and Privacy Policy. You need to accept them before you post, send messages or ask to join a trip.
        </Text>
        <View style={styles.links}>
          <TouchableOpacity onPress={() => router.push('/terms')} accessibilityRole="link" hitSlop={8}><Text style={styles.link}>Read the Terms of Service</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/privacy')} accessibilityRole="link" hitSlop={8}><Text style={styles.link}>Read the Privacy Policy</Text></TouchableOpacity>
        </View>
        <Text style={styles.sub}>In short</Text>
        <Text style={styles.body}>Be respectful: harassment, hate, threats and explicit content are not allowed and can lead to removal. You can report and block anyone, and leave groups and trips you joined.</Text>
        <Text style={styles.body}>{COMPATIBILITY_NOTICE}</Text>
        <Text style={styles.body}>{SAFETY_TIPS.map((t) => t.title).join(' · ')}.</Text>
        <Text style={styles.body}>{NOT_EMERGENCY_SERVICE}</Text>
      </ScrollView>
      <View style={styles.footer}>
        <TouchableOpacity style={[styles.primary, saving && { opacity: 0.6 }]} onPress={accept} disabled={saving} accessibilityRole="button" accessibilityLabel="I agree to the Terms of Service and Privacy Policy">
          {saving ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.primaryLabel}>I agree and continue</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondary} onPress={logout} disabled={saving} accessibilityRole="button">
          <Text style={styles.secondaryLabel}>I do not agree: sign out</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing['2xl'], gap: Spacing.md, alignItems: 'flex-start' },
  title: { fontSize: FontSize['2xl'], fontWeight: FontWeight.bold, color: Colors.textPrimary },
  sub: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary, marginTop: Spacing.md },
  body: { fontSize: FontSize.md, color: Colors.textSecondary, lineHeight: 22 },
  links: { gap: Spacing.md, paddingVertical: Spacing.sm },
  link: { fontSize: FontSize.md, color: Colors.primary, fontWeight: FontWeight.semibold },
  footer: { padding: Spacing['2xl'], gap: Spacing.md },
  primary: { backgroundColor: Colors.primary, borderRadius: Radius.xl, minHeight: 52, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.lg },
  primaryLabel: { color: Colors.white, fontSize: FontSize.md, fontWeight: FontWeight.bold },
  secondary: { alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  secondaryLabel: { color: Colors.textSecondary, fontSize: FontSize.md },
});
