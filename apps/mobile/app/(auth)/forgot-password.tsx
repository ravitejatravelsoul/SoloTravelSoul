import { useState } from 'react';
import { TouchableOpacity, View, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Text, Input, Button } from '@/components/ui';
import { AuthShell } from '@/components/auth/AuthShell';
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
    const success = await forgotPassword(email.trim().toLowerCase());
    setLoading(false);
    if (success) setSent(true);
  };

  return (
    <AuthShell
      compact
      title="Reset password"
      subtitle={sent ? undefined : 'We will email you a link to choose a new one'}
      footer={
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} accessibilityRole="link" accessibilityLabel="Back to sign in">
          <Text variant="caption" color={Colors.primaryDark} bold>Back to sign in</Text>
        </TouchableOpacity>
      }
    >
      {sent ? (
        <View style={styles.sent}>
          <Text style={styles.sentIcon}>📬</Text>
          <Text variant="h3" center>Check your inbox</Text>
          <Text variant="body" center style={styles.sentDesc}>
            If an account exists for {email}, a reset link is on its way. It can take a few minutes; check your spam folder too.
          </Text>
          <Button label="Back to sign in" onPress={() => router.replace('/(auth)/login')} fullWidth />
        </View>
      ) : (
        <>
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
          <Button label="Send reset link" onPress={handleSend} loading={loading} fullWidth size="lg" />
        </>
      )}
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  sent: { alignItems: 'center', gap: Spacing.lg },
  sentIcon: { fontSize: 56, lineHeight: 70 },
  sentDesc: { color: Colors.textSecondary, lineHeight: 22 },
});
