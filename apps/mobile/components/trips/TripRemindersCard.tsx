import { Switch, View, StyleSheet, TouchableOpacity, Linking, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/constants/theme';
import { REMINDER_META, isExpoGoiOS, isReminderSchedulable } from '@/services/notificationService';
import { useTripReminders } from '@/hooks/useTripReminders';
import type { PlannedTrip } from '@solotravelsoul/shared';
import type { ReminderType } from '@solotravelsoul/shared';
import { tripStatus } from '@solotravelsoul/shared';

const REMINDER_TYPES: ReminderType[] = [
  'sevenDays',
  'oneDay',
  'morningOf',
  'checklistReminder',
];

interface Props {
  trip: PlannedTrip;
}

export function TripRemindersCard({ trip }: Props) {
  const { prefs, permStatus, loading, saving, toggleReminder, requestPermission } =
    useTripReminders(trip);

  const status = tripStatus(trip.startDate, trip.endDate);
  const isPast = status === 'past';

  if (loading) return <RemindersSkeleton />;

  return (
    <View style={styles.card}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="notifications-outline" size={18} color={Colors.primary} />
          <Text style={styles.title}>Reminders</Text>
        </View>
        {!isPast && permStatus === 'granted' && (
          <View style={styles.activeBadge}>
            <View style={styles.activeDot} />
            <Text style={styles.activeBadgeText}>Active</Text>
          </View>
        )}
      </View>

      {/* ── Past trip notice ── */}
      {isPast && (
        <View style={styles.infoRow}>
          <Ionicons name="checkmark-circle-outline" size={14} color={Colors.textSecondary} />
          <Text style={styles.infoText}>
            This trip has ended — reminders are for upcoming trips.
          </Text>
        </View>
      )}

      {/* ── iOS Expo Go warning ── */}
      {!isPast && isExpoGoiOS && (
        <View style={styles.warningRow}>
          <Ionicons name="warning-outline" size={14} color={Colors.warning} />
          <Text style={styles.warningText}>
            Local notifications require a dev build on iOS. Your settings will be saved and activate when you install the app.
          </Text>
        </View>
      )}

      {/* ── Permission denied banner ── */}
      {!isPast && !isExpoGoiOS && permStatus === 'denied' && (
        <TouchableOpacity
          style={styles.permBanner}
          onPress={() => Linking.openSettings()}
          activeOpacity={0.8}
        >
          <Ionicons name="notifications-off-outline" size={15} color={Colors.error} />
          <Text style={styles.permBannerText}>
            Notifications are blocked. Tap to open Settings and allow them.
          </Text>
          <Ionicons name="open-outline" size={13} color={Colors.error} />
        </TouchableOpacity>
      )}

      {/* ── Permission prompt (undetermined) ── */}
      {!isPast && !isExpoGoiOS && permStatus === 'undetermined' && (
        <View style={styles.permPrompt}>
          <Text style={styles.permPromptText}>
            Enable a reminder below to allow notifications.
          </Text>
        </View>
      )}

      {/* ── Reminder rows ── */}
      <View style={styles.rows}>
        {REMINDER_TYPES.map((type, i) => {
          const meta = REMINDER_META[type];
          const enabled = prefs[type];
          const schedulable = isReminderSchedulable(trip.startDate, type);
          const isLast = i === REMINDER_TYPES.length - 1;

          return (
            <View key={type} style={[styles.row, !isLast && styles.rowBorder]}>
              <View style={styles.rowIcon}>
                <Text style={styles.rowEmoji}>{meta.emoji}</Text>
              </View>
              <View style={styles.rowBody}>
                <Text style={styles.rowLabel}>{meta.label}</Text>
                <Text style={styles.rowSub}>
                  {!schedulable && !isPast
                    ? 'Date already passed'
                    : meta.sublabel}
                </Text>
              </View>
              <Switch
                value={enabled}
                onValueChange={() => {
                  if (permStatus === 'undetermined' || permStatus === 'granted') {
                    toggleReminder(type);
                  } else if (permStatus === 'denied') {
                    Linking.openSettings();
                  }
                }}
                disabled={saving || isPast || (!schedulable && !enabled)}
                trackColor={{ false: Colors.chipBackground, true: Colors.primary + '60' }}
                thumbColor={enabled ? Colors.primary : Colors.placeholder}
                ios_backgroundColor={Colors.chipBackground}
              />
            </View>
          );
        })}
      </View>

      {/* ── Enable button for undetermined perm on iOS ── */}
      {!isPast && Platform.OS === 'ios' && permStatus === 'undetermined' && (
        <TouchableOpacity
          style={styles.enableBtn}
          onPress={requestPermission}
          activeOpacity={0.8}
        >
          <Ionicons name="notifications-outline" size={14} color={Colors.primary} />
          <Text style={styles.enableBtnText}>Allow notifications</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function RemindersSkeleton() {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="notifications-outline" size={18} color={Colors.primary} />
          <Text style={styles.title}>Reminders</Text>
        </View>
      </View>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={[styles.row, i < 3 && styles.rowBorder]}>
          <View style={[styles.skeletonBox, { width: 32, height: 32 }]} />
          <View style={{ flex: 1, gap: 6 }}>
            <View style={[styles.skeletonBox, { width: '50%', height: 12 }]} />
            <View style={[styles.skeletonBox, { width: '70%', height: 10 }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    gap: Spacing.md,
    ...Shadow.sm,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  title: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.success + '18',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.success,
  },
  activeBadgeText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.success,
  },

  // Info / warning banners
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: Colors.chipBackground,
    borderRadius: Radius.md,
    padding: Spacing.sm,
  },
  infoText: {
    flex: 1,
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    lineHeight: 17,
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: Colors.warning + '15',
    borderRadius: Radius.md,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.warning + '30',
  },
  warningText: {
    flex: 1,
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    lineHeight: 17,
  },
  permBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.error + '10',
    borderRadius: Radius.md,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.error + '25',
  },
  permBannerText: {
    flex: 1,
    fontSize: FontSize.xs,
    color: Colors.error,
    lineHeight: 17,
  },
  permPrompt: {
    backgroundColor: Colors.primary + '0C',
    borderRadius: Radius.md,
    padding: Spacing.sm,
  },
  permPromptText: {
    fontSize: FontSize.xs,
    color: Colors.primary,
    lineHeight: 17,
  },

  // Reminder rows
  rows: { gap: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: Radius.sm,
    backgroundColor: Colors.chipBackground,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rowEmoji: { fontSize: 17 },
  rowBody: { flex: 1, gap: 2 },
  rowLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  rowSub: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    lineHeight: 16,
  },

  enableBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.primary + '40',
    backgroundColor: Colors.primary + '0C',
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm,
  },
  enableBtnText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.primary,
  },

  // Skeleton
  skeletonBox: {
    backgroundColor: Colors.chipBackground,
    borderRadius: Radius.sm,
  },
});
