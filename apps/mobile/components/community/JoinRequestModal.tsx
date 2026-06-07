import { useState } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui';
import { submitTripJoinRequest } from '@solotravelsoul/firebase';
import type { PublicTrip, UserProfile } from '@solotravelsoul/shared';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

const MESSAGE_MAX = 300;
const DAILY_LIMIT_KEY = 'community_join_requests_daily';
const DAILY_LIMIT = 3;

async function checkDailyLimit(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(DAILY_LIMIT_KEY);
    if (!raw) return true;
    const { date, count } = JSON.parse(raw);
    const today = new Date().toDateString();
    if (date !== today) return true;
    return count < DAILY_LIMIT;
  } catch {
    return true;
  }
}

async function incrementDailyCount(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(DAILY_LIMIT_KEY);
    const today = new Date().toDateString();
    const prev = raw ? JSON.parse(raw) : { date: today, count: 0 };
    const count = prev.date === today ? prev.count + 1 : 1;
    await AsyncStorage.setItem(DAILY_LIMIT_KEY, JSON.stringify({ date: today, count }));
  } catch {}
}

interface JoinRequestModalProps {
  trip: PublicTrip;
  requestor: UserProfile;
  onClose: () => void;
  onSubmitted: () => void;
}

export function JoinRequestModal({ trip, requestor, onClose, onSubmitted }: JoinRequestModalProps) {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    const allowed = await checkDailyLimit();
    if (!allowed) {
      Alert.alert('Daily limit reached', `You can send up to ${DAILY_LIMIT} join requests per day. Try again tomorrow.`);
      return;
    }

    setLoading(true);
    try {
      await submitTripJoinRequest(
        trip.tripId,
        { ownerUid: trip.ownerUid, destination: trip.destination, title: trip.title || trip.destination },
        requestor,
        message
      );
      await incrementDailyCount();
      onSubmitted();
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === 'already-exists' || code === 'permission-denied') {
        Alert.alert('Already requested', 'You already have a pending request for this trip.');
      } else {
        Alert.alert('Failed', 'Could not send request. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={24} color={Colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Request to Join</Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.tripInfo}>
              <Ionicons name="map-outline" size={20} color={Colors.primary} />
              <View>
                <Text style={styles.tripTitle}>{trip.title || trip.destination}</Text>
                <Text style={styles.tripDestination}>{trip.destination}</Text>
              </View>
            </View>

            <Text style={styles.fieldLabel}>Message to the trip organizer (optional)</Text>
            <View style={styles.messageBox}>
              <TextInput
                style={styles.messageInput}
                value={message}
                onChangeText={(t) => setMessage(t.slice(0, MESSAGE_MAX))}
                multiline
                numberOfLines={5}
                placeholder="Tell the organizer a bit about yourself and why you'd like to join…"
                placeholderTextColor={Colors.placeholder}
                textAlignVertical="top"
              />
              <Text style={styles.charCount}>{message.length}/{MESSAGE_MAX}</Text>
            </View>

            <Text style={styles.disclaimer}>
              By requesting, you agree to the community guidelines. The organizer will review your request.
            </Text>
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelLabel}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <Text style={styles.submitLabel}>Send Request</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
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
  content: { padding: Spacing.lg, gap: Spacing.lg },
  tripInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tripTitle: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  tripDestination: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  fieldLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textSecondary },
  messageBox: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  messageInput: { fontSize: FontSize.md, color: Colors.textPrimary, minHeight: 120 },
  charCount: { fontSize: FontSize.xs, color: Colors.placeholder, textAlign: 'right', marginTop: 4 },
  disclaimer: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 18, textAlign: 'center' },
  footer: {
    flexDirection: 'row',
    padding: Spacing.lg,
    gap: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  cancelLabel: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textSecondary },
  submitBtn: {
    flex: 2,
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitLabel: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.white },
});
