import { useState } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui';
import { reportContent } from '@solotravelsoul/firebase';
import type { ReportTargetType } from '@solotravelsoul/shared';
import { useAuthStore } from '@/stores/authStore';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

type TargetType = ReportTargetType;
type ReportReason = 'spam' | 'inappropriate' | 'harassment' | 'fake' | 'safety' | 'other';

const REASONS: { value: ReportReason; label: string }[] = [
  { value: 'spam', label: 'Spam or fake content' },
  { value: 'inappropriate', label: 'Inappropriate or offensive' },
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'safety', label: 'Safety concern' },
  { value: 'fake', label: 'Fake profile or content' },
  { value: 'other', label: 'Other' },
];

const TARGET_LABELS: Record<TargetType, string> = {
  user: 'This user\'s profile',
  trip: 'This trip',
  group: 'This group',
  message: 'This message',
  post: 'This post',
  journal: 'This journal',
  comment: 'This comment',
};

const DAILY_REPORT_KEY = 'community_reports_daily';
const DAILY_LIMIT = 5;

async function checkReportLimit(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(DAILY_REPORT_KEY);
    if (!raw) return true;
    const { date, count } = JSON.parse(raw);
    if (date !== new Date().toDateString()) return true;
    return count < DAILY_LIMIT;
  } catch { return true; }
}

async function incrementReportCount(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(DAILY_REPORT_KEY);
    const today = new Date().toDateString();
    const prev = raw ? JSON.parse(raw) : { date: today, count: 0 };
    const count = prev.date === today ? prev.count + 1 : 1;
    await AsyncStorage.setItem(DAILY_REPORT_KEY, JSON.stringify({ date: today, count }));
  } catch {}
}

interface ReportModalProps {
  visible: boolean;
  targetType: TargetType;
  targetId: string;
  onClose: () => void;
}

export function ReportModal({ visible, targetType, targetId, onClose }: ReportModalProps) {
  const uid = useAuthStore((s) => s.user?.uid ?? '');
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const reset = () => { setStep(1); setReason(null); setDetails(''); setDone(false); };

  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async () => {
    if (!reason) return;
    const allowed = await checkReportLimit();
    if (!allowed) {
      Alert.alert('Limit reached', "You've submitted several reports today. We'll review them shortly.");
      handleClose();
      return;
    }
    setLoading(true);
    try {
      await reportContent(uid, targetType, targetId, reason, details);
      await incrementReportCount();
      setDone(true);
    } catch {
      Alert.alert('Error', 'Could not submit report. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} hitSlop={12}>
            <Ionicons name="close" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Report</Text>
          <View style={{ width: 24 }} />
        </View>

        {done ? (
          <View style={styles.successContainer}>
            <Ionicons name="checkmark-circle" size={64} color={Colors.success} />
            <Text style={styles.successTitle}>Report submitted</Text>
            <Text style={styles.successBody}>
              We review all reports carefully. Thank you for keeping SoloTravelSoul safe.
            </Text>
            <TouchableOpacity style={styles.doneBtn} onPress={handleClose}>
              <Text style={styles.doneBtnLabel}>Done</Text>
            </TouchableOpacity>
          </View>
        ) : (
          // "handled": with the details keyboard open, the first tap on Submit submits.
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {step === 1 && (
              <>
                <Text style={styles.stepTitle}>What are you reporting?</Text>
                <Text style={styles.stepSubtitle}>{TARGET_LABELS[targetType] ?? 'This content'}</Text>
                <TouchableOpacity style={styles.nextBtn} onPress={() => setStep(2)}>
                  <Text style={styles.nextBtnLabel}>Continue</Text>
                </TouchableOpacity>
              </>
            )}

            {step === 2 && (
              <>
                <Text style={styles.stepTitle}>What&apos;s the issue?</Text>
                {REASONS.map((r) => (
                  <TouchableOpacity
                    key={r.value}
                    style={[styles.optionRow, reason === r.value && styles.optionRowSelected]}
                    onPress={() => { setReason(r.value); setStep(3); }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.optionLabel, reason === r.value && styles.optionLabelSelected]}>
                      {r.label}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={Colors.placeholder} />
                  </TouchableOpacity>
                ))}
              </>
            )}

            {step === 3 && (
              <>
                <Text style={styles.stepTitle}>Add details (optional)</Text>
                <TextInput
                  style={styles.detailsInput}
                  value={details}
                  onChangeText={(t) => setDetails(t.slice(0, 500))}
                  multiline
                  numberOfLines={5}
                  placeholder="Tell us more…"
                  placeholderTextColor={Colors.placeholder}
                  textAlignVertical="top"
                  autoFocus
                />
                <Text style={styles.charCount}>{details.length}/500</Text>
                <TouchableOpacity
                  style={[styles.nextBtn, loading && { opacity: 0.5 }]}
                  onPress={handleSubmit}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color={Colors.white} />
                  ) : (
                    <Text style={styles.nextBtnLabel}>Submit Report</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity style={styles.skipBtn} onPress={handleSubmit} disabled={loading}>
                  <Text style={styles.skipLabel}>Submit without details</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  headerTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  content: { padding: Spacing.lg, gap: Spacing.md },
  stepTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, marginBottom: Spacing.sm },
  stepSubtitle: { fontSize: FontSize.md, color: Colors.textSecondary, marginBottom: Spacing.lg },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
  },
  optionRowSelected: { borderColor: Colors.primary, backgroundColor: Colors.primary + '08' },
  optionLabel: { fontSize: FontSize.md, color: Colors.textPrimary },
  optionLabelSelected: { color: Colors.primary, fontWeight: FontWeight.semibold },
  detailsInput: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    minHeight: 120,
  },
  charCount: { fontSize: FontSize.xs, color: Colors.placeholder, textAlign: 'right' },
  nextBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  nextBtnLabel: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.white },
  skipBtn: { alignItems: 'center', paddingVertical: Spacing.sm },
  skipLabel: { fontSize: FontSize.sm, color: Colors.textSecondary },
  successContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing['2xl'], gap: Spacing.lg },
  successTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, textAlign: 'center' },
  successBody: { fontSize: FontSize.md, color: Colors.textSecondary, textAlign: 'center', lineHeight: 24 },
  doneBtn: { backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingVertical: Spacing.md, paddingHorizontal: Spacing['2xl'] },
  doneBtnLabel: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.white },
});
