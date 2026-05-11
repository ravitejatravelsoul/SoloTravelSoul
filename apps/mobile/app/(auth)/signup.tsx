import { useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Screen, Text, Input, Button } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { Colors, Spacing } from '@/constants/theme';
import { isValidEmail, isValidPassword, isNonEmpty } from '@/utils/validations';

export default function SignupScreen() {
  const { register, loading } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!isNonEmpty(name)) e.name = 'Enter your name.';
    if (!isValidEmail(email)) e.email = 'Enter a valid email address.';
    if (!isValidPassword(password)) e.password = 'Password must be at least 8 characters.';
    if (password !== confirm) e.confirm = 'Passwords do not match.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleRegister = async () => {
    if (!validate()) return;
    await register(email.trim().toLowerCase(), password, name.trim());
  };

  return (
    <Screen scroll padded>
      <View style={styles.header}>
        <Text style={styles.logo}>🌍</Text>
        <Text variant="h1">Create account</Text>
        <Text variant="caption">Start planning your next adventure</Text>
      </View>

      <View style={styles.form}>
        <Input
          label="Full name"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          autoComplete="name"
          error={errors.name}
          placeholder="Jane Smith"
        />
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
          placeholder="At least 8 characters"
          hint="Use letters, numbers, and symbols for a stronger password."
        />
        <Input
          label="Confirm password"
          value={confirm}
          onChangeText={setConfirm}
          secure
          error={errors.confirm}
          placeholder="••••••••"
        />

        <Button
          label="Create Account"
          onPress={handleRegister}
          loading={loading}
          fullWidth
          size="lg"
        />
      </View>

      <View style={styles.footer}>
        <Text variant="caption">Already have an account? </Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text variant="caption" color={Colors.primary} bold>Sign in</Text>
        </TouchableOpacity>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', gap: Spacing.sm, marginTop: Spacing['2xl'], marginBottom: Spacing['2xl'] },
  logo: { fontSize: 56 },
  form: { gap: Spacing.lg },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: Spacing['3xl'] },
});
