import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '@/constants/theme';

interface Props {
  email: string;
  sending: boolean;
  checking: boolean;
  message: string | null;
  onSend: () => void;
  onRefresh: () => void;
}

/** Shown while the signed-in e-mail is unverified: invitations are addressed to an e-mail, so only its verified owner can see and answer them. */
export function VerifyEmailBanner({ email, sending, checking, message, onSend, onRefresh }: Props) {
  // At large text sizes the two buttons stack so neither label is squeezed.
  const stacked = useWindowDimensions().fontScale >= 1.4;
  return (
    <View style={styles.card} accessibilityLabel="Verify your e-mail to receive group invitations">
      <Text style={styles.title}>Verify your e-mail for group invitations</Text>
      <Text style={styles.body}>
        Invitations are sent to an e-mail address. To see and answer the ones sent to {email || 'yours'}, confirm that the address is yours. Everything else in the app works without this.
      </Text>
      <View style={[styles.row, stacked && styles.rowStacked]}>
        <TouchableOpacity style={[styles.btn, styles.secondary]} onPress={onSend} disabled={sending} accessibilityRole="button" accessibilityLabel="Send verification e-mail">
          {sending ? <ActivityIndicator size="small" color={Colors.primary} /> : <Text style={styles.secondaryText}>Send e-mail</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.primary]} onPress={onRefresh} disabled={checking} accessibilityRole="button" accessibilityLabel="I have verified my e-mail">
          {checking ? <ActivityIndicator size="small" color={Colors.white} /> : <Text style={styles.primaryText}>I have verified</Text>}
        </TouchableOpacity>
      </View>
      {message ? <Text style={styles.message} accessibilityLiveRegion="polite">{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: Colors.surface, marginHorizontal: Spacing.lg, marginTop: Spacing.sm, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, gap: Spacing.sm },
  title: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  body: { fontSize: FontSize.sm, color: Colors.textSecondary },
  row: { flexDirection: 'row', gap: Spacing.sm },
  rowStacked: { flexDirection: 'column' },
  btn: { flexGrow: 1, minHeight: 44, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.sm },
  secondary: { borderWidth: 1, borderColor: Colors.primary },
  primary: { backgroundColor: Colors.primary },
  secondaryText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.primary },
  primaryText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.white },
  message: { fontSize: FontSize.xs, color: Colors.textSecondary },
});
