import { Modal, View, StyleSheet } from 'react-native';
import { Text } from './Text';
import { Button } from './Button';
import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <Text variant="h3" center style={styles.title}>
            {title}
          </Text>
          <Text variant="body" center style={styles.message}>
            {message}
          </Text>
          <View style={styles.actions}>
            <Button
              label={cancelLabel}
              variant="secondary"
              onPress={onCancel}
              disabled={loading}
              style={styles.btn}
            />
            <Button
              label={confirmLabel}
              variant={destructive ? 'danger' : 'primary'}
              onPress={onConfirm}
              loading={loading}
              style={styles.btn}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing['2xl'],
  },
  dialog: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing['2xl'],
    width: '100%',
    maxWidth: 340,
    ...Shadow.lg,
  },
  title: { marginBottom: Spacing.sm },
  message: { color: Colors.textSecondary, marginBottom: Spacing['2xl'], lineHeight: 22 },
  actions: { flexDirection: 'row', gap: Spacing.md },
  btn: { flex: 1 },
});
