import { useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Text, Input, Button } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { Colors, Spacing } from '@/constants/theme';
import { isValidEmail } from '@/utils/validations';

export default function ForgotPasswordScreen() {
  const { forgotPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSend = async () => {
    if (!isValidEmail(email)) {
      setError('Enter a valid email address.');
      return;
    }
    setError('');
    setLoading(true);
    await forgotPassword(email.trim().toLowerCase());
    setLoading(false);
    setSent(true);
  };

  return (
    <Screen scroll padded>
      <View style={styles.nav}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text variant="h3">Reset password</Text>
        <View style={{ width: 24 }} />
      </View>

      {sent ? (
        <View style={styles.sent}>
          <Text style={styles.sentIcon}>📬</Text>
          <Text variant="h3" center>Check your inbox</Text>
          <Text variant="body" center style={styles.sentDesc}>
            We sent a password reset link to {email}. Check your spam folder if you don't see it.
          </Text>
          <Button label="Back to sign in" onPress={() => router.replace('/(auth)/login')} fullWidth />
        </View>
      ) : (
        <View style={styles.form}>
          <Text variant="body" style={styles.desc}>
            Enter your email and we'll send you a link to reset your password.
          </Text>
          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            placeholder="you@example.com"
            error={error}
          />
          <Button
            label="Send reset link"
            onPress={handleSend}
            loading={loading}
            fullWidth
            size="lg"
          />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  nav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing['2xl'],
  },
  desc: { color: Colors.textSecondary, marginBottom: Spacing.lg },
  form: { gap: Spacing.lg },
  sent: { flex: 1, alignItems: 'center', gap: Spacing.lg, paddingTop: Spacing['4xl'] },
  sentIcon: { fontSize: 56 },
  sentDesc: { color: Colors.textSecondary, lineHeight: 22, marginBottom: Spacing.lg },
});
