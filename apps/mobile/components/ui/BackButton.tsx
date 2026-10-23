import { StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { PressableScale } from './PressableScale';
import { Colors, TapTarget } from '@/constants/theme';

/** Round, labelled back button with a full-size tap area; the same on every screen. A short guard stops double taps popping two screens. */
export function BackButton({ onPress, label = 'Go back' }: { onPress?: () => void; label?: string }) {
  return (
    <PressableScale
      onPress={onPress ?? (() => router.back())}
      guardMs={400}
      hitSlop={6}
      style={styles.btn}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: TapTarget,
    height: TapTarget,
    borderRadius: TapTarget / 2,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
