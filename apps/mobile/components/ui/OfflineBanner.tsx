import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { Colors, Spacing, FontSize } from '@/constants/theme';

/**
 * `overlay`: drawn over the status-bar area instead of taking layout space, so the
 * screens below do not move. Shifting them broke keyboard avoidance (Android 15,
 * edge-to-edge): KeyboardAvoidingView measures itself relative to its parent, so
 * the input ended up behind the keyboard by the banner's height.
 */
export function OfflineBanner({ overlay = false }: { overlay?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[styles.banner, overlay && [styles.overlay, { height: Math.max(insets.top, 24) }]]}
      pointerEvents={overlay ? 'none' : 'auto'}
    >
      <Ionicons name="cloud-offline-outline" size={14} color={Colors.white} />
      <Text style={styles.text}>No internet connection — some features may be unavailable</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.textSecondary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingVertical: 0,
  },
  text: {
    flex: 1,
    fontSize: FontSize.xs,
    color: Colors.white,
    fontWeight: '500' as const,
  },
});
