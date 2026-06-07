import { useState } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui';
import { submitGroupJoinRequest } from '@solotravelsoul/firebase';
import type { CommunityGroup, UserProfile } from '@solotravelsoul/shared';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

const MESSAGE_MAX = 300;

interface Props {
  group: CommunityGroup;
  requestor: UserProfile;
  onClose: () => void;
  onSubmitted: () => void;
}

export function JoinRequestModal({ group, requestor, onClose, onSubmitted }: Props) {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await submitGroupJoinRequest(group.groupId, group.name, group.ownerUid, requestor, message);
      onSubmitted();
    } catch {
      Alert.alert('Failed', 'Could not send request. Please try again.');
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

          <View style={styles.content}>
            <View style={styles.groupInfo}>
              <Ionicons name="people" size={20} color={Colors.accent} />
              <View>
                <Text style={styles.groupName}>{group.name}</Text>
                <Text style={styles.groupDest}>{group.destination}</Text>
              </View>
            </View>

            <Text style={styles.fieldLabel}>Message (optional)</Text>
            <View style={styles.messageBox}>
              <TextInput
                style={styles.messageInput}
                value={message}
                onChangeText={(t) => setMessage(t.slice(0, MESSAGE_MAX))}
                multiline
                numberOfLines={5}
                placeholder="Tell the organizer why you'd like to join…"
                placeholderTextColor={Colors.placeholder}
                textAlignVertical="top"
                autoFocus
              />
              <Text style={styles.charCount}>{message.length}/{MESSAGE_MAX}</Text>
            </View>

            <Text style={styles.disclaimer}>
              Your request will be reviewed by the group organizer.
            </Text>
          </View>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelLabel}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? <ActivityIndicator size="small" color={Colors.white} /> : (
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
  content: { flex: 1, padding: Spacing.lg, gap: Spacing.lg },
  groupInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  groupName: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  groupDest: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  fieldLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textSecondary },
  messageBox: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    flex: 1,
  },
  messageInput: { fontSize: FontSize.md, color: Colors.textPrimary, flex: 1 },
  charCount: { fontSize: FontSize.xs, color: Colors.placeholder, textAlign: 'right', marginTop: 4 },
  disclaimer: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center' },
  footer: {
    flexDirection: 'row',
    padding: Spacing.lg,
    gap: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  cancelBtn: { flex: 1, paddingVertical: Spacing.md, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  cancelLabel: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textSecondary },
  submitBtn: { flex: 2, paddingVertical: Spacing.md, borderRadius: Radius.lg, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center', minHeight: 48 },
  submitBtnDisabled: { opacity: 0.5 },
  submitLabel: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.white },
});
