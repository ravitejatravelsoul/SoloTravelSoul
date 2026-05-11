import { View, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { Colors, Spacing, FontSize, Radius } from '@/constants/theme';

function relativeTime(date: Date): string {
  const diffMin = Math.round((Date.now() - date.getTime()) / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin === 1) return '1 min ago';
  if (diffMin < 60) return `${diffMin} min ago`;
  const hrs = Math.round(diffMin / 60);
  return hrs === 1 ? '1 hr ago' : `${hrs} hrs ago`;
}

interface Props {
  pendingCount: number;
  lastSyncedAt: Date | null;
  syncing: boolean;
  hasFailed: boolean;
  isOffline: boolean;
  onRetry: () => void;
}

export function SyncStatusBar({
  pendingCount,
  lastSyncedAt,
  syncing,
  hasFailed,
  isOffline,
  onRetry,
}: Props) {
  if (syncing) {
    return (
      <View style={[styles.bar, styles.pendingBar]}>
        <ActivityIndicator size="small" color={Colors.primary} style={styles.spinner} />
        <Text style={[styles.label, { color: Colors.primary }]}>Syncing changes…</Text>
      </View>
    );
  }

  if (hasFailed) {
    return (
      <TouchableOpacity
        style={[styles.bar, styles.failedBar]}
        onPress={onRetry}
        activeOpacity={0.8}
      >
        <Ionicons name="warning-outline" size={13} color={Colors.warning} />
        <Text style={[styles.label, { color: Colors.warning, flex: 1 }]}>
          Some changes couldn't sync · Tap to retry
        </Text>
        <Ionicons name="refresh-outline" size={13} color={Colors.warning} />
      </TouchableOpacity>
    );
  }

  if (isOffline && pendingCount > 0) {
    return (
      <View style={[styles.bar, styles.pendingBar]}>
        <Ionicons name="cloud-upload-outline" size={13} color={Colors.primary} />
        <Text style={[styles.label, { color: Colors.primary }]}>
          {pendingCount} change{pendingCount !== 1 ? 's' : ''} waiting to sync
        </Text>
      </View>
    );
  }

  if (!isOffline && lastSyncedAt && pendingCount === 0) {
    return (
      <View style={[styles.bar, styles.syncedBar]}>
        <Ionicons name="checkmark-circle" size={13} color={Colors.success} />
        <Text style={[styles.label, { color: Colors.success }]}>
          Synced · {relativeTime(lastSyncedAt)}
        </Text>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.md,
    marginBottom: Spacing.xs,
  },
  syncedBar:  { backgroundColor: Colors.success  + '12' },
  pendingBar: { backgroundColor: Colors.primary  + '12' },
  failedBar:  { backgroundColor: Colors.warning  + '15' },
  label: { fontSize: FontSize.xs, fontWeight: '500' as const },
  spinner: { transform: [{ scale: 0.65 }] },
});
