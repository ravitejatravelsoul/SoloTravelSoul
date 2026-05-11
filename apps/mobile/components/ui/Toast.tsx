import { useEffect, useRef } from 'react';
import {
  Animated,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUIStore, type ToastType } from '@/stores/uiStore';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '@/constants/theme';
import { Text } from './Text';

const BG: Record<ToastType, string> = {
  success: Colors.success,
  error: Colors.error,
  info: Colors.primary,
};

function ToastItem({ id, message, type }: { id: string; message: string; type: ToastType }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const removeToast = useUIStore((s) => s.removeToast);

  useEffect(() => {
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(2600),
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => removeToast(id));
  }, []);

  return (
    <Animated.View style={[styles.toast, { backgroundColor: BG[type], opacity }]}>
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
}

export function ToastContainer() {
  const toasts = useUIStore((s) => s.toasts);
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { top: insets.top + Spacing.sm }]} pointerEvents="none">
      {toasts.map((t) => (
        <ToastItem key={t.id} {...t} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: Spacing.lg,
    right: Spacing.lg,
    zIndex: 9999,
    gap: Spacing.sm,
  },
  toast: {
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  text: {
    color: Colors.white,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
});
