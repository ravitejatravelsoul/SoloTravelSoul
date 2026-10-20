import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui';
import { COMPATIBILITY_NOTICE, JOIN_SAFETY_REMINDER } from '@solotravelsoul/shared';
import type { NearbyTraveler, PublicTrip, TravelPreferences } from '@solotravelsoul/shared';
import { tripFacts, organizerAnswers, compareAnswers, comparisonHeadline, type AnswerComparison, type SummaryRow } from '@/utils/tripSummary';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

function Rows({ rows }: { rows: SummaryRow[] }) {
  return (
    <View>
      {rows.map((r) => (
        <View key={r.label} style={styles.row} accessible accessibilityLabel={`${r.label}: ${r.value}`}>
          <Text style={styles.rowLabel}>{r.label}</Text>
          <Text style={[styles.rowValue, !r.provided && styles.notProvided]}>{r.value}</Text>
        </View>
      ))}
    </View>
  );
}

/** Shared / differences / not provided: the actual answers, never a score or a personality label. */
export function ComparisonList({ comparison }: { comparison: AnswerComparison }) {
  const c = comparison;
  return (
    <View style={styles.comparison} accessible={false}>
      <Text style={styles.headline}>{comparisonHeadline(c)}</Text>
      {c.shared.map((t) => (
        <View key={`s-${t}`} style={styles.line}><Ionicons name="checkmark-circle" size={16} color={Colors.success} /><Text style={styles.lineText}>{t}</Text></View>
      ))}
      {c.differences.map((t) => (
        <View key={`d-${t}`} style={styles.line}><Ionicons name="swap-horizontal" size={16} color={Colors.warning} /><Text style={styles.lineText}>{t}</Text></View>
      ))}
      {c.otherShared && c.notProvided.length > 0 && (
        <View style={styles.line}><Ionicons name="remove-circle-outline" size={16} color={Colors.placeholder} /><Text style={styles.lineText}>Not provided by them: {c.notProvided.join(', ')}</Text></View>
      )}
      {c.youHaveNotAnswered.length > 0 && (
        <View style={styles.line}><Ionicons name="help-circle-outline" size={16} color={Colors.placeholder} /><Text style={styles.lineText}>You have not answered: {c.youHaveNotAnswered.join(', ')} (Profile · Travel preferences)</Text></View>
      )}
    </View>
  );
}

interface Props {
  trip: PublicTrip;
  organizer: NearbyTraveler | null;
  viewer: TravelPreferences;
  /** Show the organizer's own answers and the comparison (trip page); the request form shows the facts and the reminder only. */
  showAnswers?: boolean;
}

/** What to know before asking to join: trip facts, the organizer's expectations, shared answers and a safety reminder. */
export function JoinSummary({ trip, organizer, viewer, showAnswers = true }: Props) {
  const comparison = compareAnswers(viewer, organizer);
  return (
    <View>
      <Rows rows={tripFacts(trip)} />
      {showAnswers && (
        <>
          <Text style={styles.subTitle}>THE ORGANIZER&apos;S TRAVEL ANSWERS</Text>
          <Rows rows={organizerAnswers(organizer)} />
          {!organizer && <Text style={styles.hint}>Shown only when the organizer chose to share them.</Text>}
          <Text style={styles.subTitle}>HOW YOUR ANSWERS COMPARE</Text>
          <ComparisonList comparison={comparison} />
        </>
      )}
      <View style={styles.notice}>
        <Ionicons name="shield-checkmark-outline" size={18} color={Colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={styles.noticeText}>{COMPATIBILITY_NOTICE}</Text>
          <Text style={[styles.noticeText, { marginTop: Spacing.xs }]}>{JOIN_SAFETY_REMINDER}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.md, paddingVertical: Spacing.xs },
  rowLabel: { width: 118, fontSize: FontSize.sm, color: Colors.textSecondary },
  rowValue: { flex: 1, fontSize: FontSize.sm, color: Colors.textPrimary, fontWeight: FontWeight.medium },
  notProvided: { color: Colors.placeholder, fontWeight: FontWeight.regular, fontStyle: 'italic' },
  subTitle: { fontSize: 11, fontWeight: FontWeight.bold, color: Colors.textSecondary, letterSpacing: 0.7, marginTop: Spacing.lg, marginBottom: Spacing.xs },
  hint: { fontSize: FontSize.xs, color: Colors.placeholder, marginTop: Spacing.xs },
  comparison: { gap: Spacing.xs },
  headline: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary, marginBottom: Spacing.xs },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  lineText: { flex: 1, fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20 },
  notice: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg, padding: Spacing.md, borderRadius: Radius.lg, backgroundColor: Colors.primary + '0F' },
  noticeText: { fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 18 },
});
