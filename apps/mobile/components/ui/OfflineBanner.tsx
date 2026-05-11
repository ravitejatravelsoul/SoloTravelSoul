import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { Colors, Spacing, FontSize } from '@/constants/theme';

export function OfflineBanner() {
  return (
    <View style={styles.banner}>
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
  text: {
    flex: 1,
    fontSize: FontSize.xs,
    color: Colors.white,
    fontWeight: '500' as const,
  },
});
