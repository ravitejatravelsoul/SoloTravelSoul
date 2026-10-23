import { useState } from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Text, Input, Button, Divider } from '@/components/ui';
import { AuthShell } from '@/components/auth/AuthShell';
import { useAuth } from '@/hooks/useAuth';
import { useBiometric } from '@/hooks/useBiometric';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { Colors, Spacing } from '@/constants/theme';
import { isValidEmail, isValidPassword } from '@/utils/validations';

export default function LoginScreen() {
  const { login, loading } = useAuth();
  const { enrolled, authenticate } = useBiometric();
  // Biometric unlock only resumes an existing session; it cannot sign anyone in,
  // so the button is offered only while a session is present.
  const hasSession = useAuthStore((s) => !!s.user);
  const addToast = useUIStore((s) => s.addToast);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  const validate = () => {
    const e: typeof errors = {};
    if (!isValidEmail(email)) e.email = 'Enter a valid email address.';
    if (!isValidPassword(password)) e.password = 'Password must be at least 8 characters.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleLogin = async () => {
    if (!validate()) return;
    await login(email.trim().toLowerCase(), password);
  };

  const handleBiometric = async () => {
    // Biometric only unlocks an existing Firebase session — it does not create one.
    // If the session expired, we show a friendly message instead of navigating blind.
    const currentUser = useAuthStore.getState().user;
    if (!currentUser) {
      addToast('Session expired. Please sign in with your password.', 'info');
      return;
    }
    const ok = await authenticate('Sign in to SoloTravelSoul');
    if (ok) router.replace('/(app)/home');
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to continue your journey"
      footer={
        <>
          <Text variant="caption">Don&apos;t have an account? </Text>
          <TouchableOpacity onPress={() => router.push('/(auth)/signup')} hitSlop={8} accessibilityRole="link" accessibilityLabel="Create one">
            <Text variant="caption" color={Colors.primaryDark} bold>Create one</Text>
          </TouchableOpacity>
        </>
      }
    >
      <Input
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        error={errors.email}
        placeholder="you@example.com"
      />
      <Input
        label="Password"
        value={password}
        onChangeText={setPassword}
        secure
        error={errors.password}
        placeholder="••••••••"
      />

      <TouchableOpacity
        onPress={() => router.push('/(auth)/forgot-password')}
        style={styles.forgotRow}
        hitSlop={8}
      >
        <Text variant="caption" color={Colors.primaryDark} bold>Forgot password?</Text>
      </TouchableOpacity>

      <Button
        label="Sign In"
        onPress={handleLogin}
        loading={loading}
        fullWidth
        size="lg"
      />

      {enrolled && hasSession && (
        <>
          <Divider />
          <Button
            label="Sign in with Face ID / Fingerprint"
            variant="secondary"
            onPress={handleBiometric}
            fullWidth
          />
        </>
      )}
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  forgotRow: { alignSelf: 'flex-end', marginTop: -Spacing.sm },
});
