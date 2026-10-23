import { useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Text, Input, Button } from '@/components/ui';
import { AuthShell } from '@/components/auth/AuthShell';
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
  const [agreed, setAgreed] = useState(false);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!isNonEmpty(name)) e.name = 'Enter your name.';
    if (!isValidEmail(email)) e.email = 'Enter a valid email address.';
    if (!isValidPassword(password)) e.password = 'Password must be at least 8 characters.';
    if (password !== confirm) e.confirm = 'Passwords do not match.';
    if (!agreed) e.agree = 'Please accept the Terms and Privacy Policy to create an account.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleRegister = async () => {
    if (!validate()) return;
    await register(email.trim().toLowerCase(), password, name.trim());
  };

  return (
    <AuthShell
      compact
      title="Create account"
      subtitle="Start planning your next adventure"
      footer={
        <>
          <Text variant="caption">Already have an account? </Text>
          <TouchableOpacity onPress={() => router.back()} hitSlop={8} accessibilityRole="link" accessibilityLabel="Sign in">
            <Text variant="caption" color={Colors.primaryDark} bold>Sign in</Text>
          </TouchableOpacity>
        </>
      }
    >
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


        <TouchableOpacity
          style={styles.agreeRow}
          onPress={() => setAgreed((v) => !v)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: agreed }}
          accessibilityLabel="I agree to the Terms of Service and the Privacy Policy"
          activeOpacity={0.7}
        >
          <Ionicons name={agreed ? 'checkbox' : 'square-outline'} size={24} color={agreed ? Colors.primary : Colors.placeholder} />
          <Text variant="caption" style={styles.agreeText}>I agree to the Terms of Service and the Privacy Policy.</Text>
        </TouchableOpacity>
        {errors.agree ? <Text variant="caption" color={Colors.error}>{errors.agree}</Text> : null}
        <View style={styles.legalRow}>
          <TouchableOpacity onPress={() => router.push('/terms')} accessibilityRole="link" hitSlop={8}>
            <Text variant="caption" color={Colors.primaryDark}>Read the Terms</Text>
          </TouchableOpacity>
          <Text variant="caption" style={styles.legalText}>  ·  </Text>
          <TouchableOpacity onPress={() => router.push('/privacy')} accessibilityRole="link" hitSlop={8}>
            <Text variant="caption" color={Colors.primaryDark}>Read the Privacy Policy</Text>
          </TouchableOpacity>
        </View>

        <Button
          label="Create Account"
          onPress={handleRegister}
          loading={loading}
          fullWidth
          size="lg"
        />

    </AuthShell>
  );
}

const styles = StyleSheet.create({
  legalRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
  },
  legalText: { color: Colors.textSecondary },
  agreeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minHeight: 44 },
  agreeText: { flex: 1, color: Colors.textPrimary },
});
