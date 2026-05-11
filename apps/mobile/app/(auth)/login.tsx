import { useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Screen, Text, Input, Button, Divider } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { useBiometric } from '@/hooks/useBiometric';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { Colors, Spacing } from '@/constants/theme';
import { isValidEmail, isValidPassword } from '@/utils/validations';

export default function LoginScreen() {
  const { login, loading } = useAuth();
  const { enrolled, authenticate } = useBiometric();
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
    <Screen scroll padded>
      <View style={styles.header}>
        <Text style={styles.logo}>✈️</Text>
        <Text variant="h1">Welcome back</Text>
        <Text variant="caption">Sign in to continue your journey</Text>
      </View>

      <View style={styles.form}>
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
        >
          <Text variant="caption" color={Colors.primary}>Forgot password?</Text>
        </TouchableOpacity>

        <Button
          label="Sign In"
          onPress={handleLogin}
          loading={loading}
          fullWidth
          size="lg"
        />

        {enrolled && (
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
      </View>

      <View style={styles.footer}>
        <Text variant="caption">Don't have an account? </Text>
        <TouchableOpacity onPress={() => router.push('/(auth)/signup')}>
          <Text variant="caption" color={Colors.primary} bold>Create one</Text>
        </TouchableOpacity>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', gap: Spacing.sm, marginTop: Spacing['3xl'], marginBottom: Spacing['3xl'] },
  logo: { fontSize: 56 },
  form: { gap: Spacing.lg },
  forgotRow: { alignSelf: 'flex-end', marginTop: -Spacing.sm },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: Spacing['3xl'] },
});
