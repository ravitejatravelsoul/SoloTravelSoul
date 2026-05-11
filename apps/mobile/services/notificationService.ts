import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PlannedTrip, TripReminderPrefs, ReminderType, StoredNotifIds } from '@solotravelsoul/shared';

// ── Foreground behaviour ──────────────────────────────────────────────
// Show alert + play sound even when app is open (e.g. dev testing).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,   // deprecated but still accepted by the SDK
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// ── Expo Go detection ─────────────────────────────────────────────────
// Local scheduled notifications work in Expo Go on Android only.
// On iOS, they require a dev build (standalone or EAS development build).
// We allow users to configure reminders regardless — they'll take effect
// once they install a dev build or the production app.
export const isExpoGoiOS =
  Platform.OS === 'ios' && Constants.executionEnvironment === 'storeClient';

// On Android Expo Go and all dev/prod builds, local notifications work.
export const isLocalNotifSupported = !isExpoGoiOS;

// ── AsyncStorage keys ─────────────────────────────────────────────────
const notifIdsKey = (uid: string, tripId: string) =>
  `@sts/notif_ids_${uid}_${tripId}`;

async function getStoredNotifIds(uid: string, tripId: string): Promise<StoredNotifIds> {
  try {
    const raw = await AsyncStorage.getItem(notifIdsKey(uid, tripId));
    return raw ? (JSON.parse(raw) as StoredNotifIds) : {};
  } catch {
    return {};
  }
}

async function saveNotifIds(
  uid: string,
  tripId: string,
  ids: StoredNotifIds
): Promise<void> {
  try {
    await AsyncStorage.setItem(notifIdsKey(uid, tripId), JSON.stringify(ids));
  } catch {
    // Non-critical
  }
}

export async function clearStoredNotifIds(uid: string, tripId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(notifIdsKey(uid, tripId));
  } catch {
    // Non-critical
  }
}

// ── Permission ────────────────────────────────────────────────────────

export type NotifPermStatus = 'granted' | 'denied' | 'undetermined';

function mapStatus(raw: string): NotifPermStatus {
  if (raw === 'granted') return 'granted';
  if (raw === 'undetermined') return 'undetermined';
  return 'denied';
}

export async function getNotificationPermission(): Promise<NotifPermStatus> {
  const { status } = await Notifications.getPermissionsAsync();
  return mapStatus(status);
}

/** Prompts the user for notification permission if not already granted. */
export async function requestNotificationPermission(): Promise<NotifPermStatus> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return 'granted';
  const { status } = await Notifications.requestPermissionsAsync();
  return mapStatus(status);
}

// ── Trigger date calculation ──────────────────────────────────────────

const REMINDER_TYPES: ReminderType[] = [
  'sevenDays',
  'oneDay',
  'morningOf',
  'checklistReminder',
];

function reminderTriggerDate(startDate: Date, type: ReminderType): Date {
  const d = new Date(startDate);
  d.setHours(0, 0, 0, 0);
  switch (type) {
    case 'sevenDays':
      d.setDate(d.getDate() - 7);
      d.setHours(9, 0, 0, 0);
      break;
    case 'oneDay':
      d.setDate(d.getDate() - 1);
      d.setHours(9, 0, 0, 0);
      break;
    case 'morningOf':
      d.setHours(7, 0, 0, 0);
      break;
    case 'checklistReminder':
      d.setDate(d.getDate() - 3);
      d.setHours(9, 0, 0, 0);
      break;
  }
  return d;
}

export const REMINDER_META: Record<
  ReminderType,
  { label: string; sublabel: string; emoji: string }
> = {
  sevenDays: {
    label: '7 days before',
    sublabel: 'Start planning and packing',
    emoji: '📅',
  },
  oneDay: {
    label: '1 day before',
    sublabel: "Final checklist reminder",
    emoji: '⏰',
  },
  morningOf: {
    label: 'Morning of departure',
    sublabel: 'Day-of reminder at 7:00 AM',
    emoji: '✈️',
  },
  checklistReminder: {
    label: '3-day packing reminder',
    sublabel: 'Finish your checklist',
    emoji: '🧳',
  },
};

function buildContent(
  type: ReminderType,
  destination: string
): Notifications.NotificationContentInput {
  switch (type) {
    case 'sevenDays':
      return {
        title: `7 days until ${destination}! 🗓️`,
        body: 'Time to start planning and packing for your trip.',
        sound: true,
      };
    case 'oneDay':
      return {
        title: `Tomorrow: ${destination}! ⏰`,
        body: 'The big day is almost here. Are you all packed?',
        sound: true,
      };
    case 'morningOf':
      return {
        title: `Today you're off to ${destination}! ✈️`,
        body: 'Have an amazing trip! Your itinerary is ready.',
        sound: true,
      };
    case 'checklistReminder':
      return {
        title: `3 days until ${destination} 🧳`,
        body: "Check off your packing list so nothing gets left behind.",
        sound: true,
      };
  }
}

// ── Scheduling ────────────────────────────────────────────────────────

/**
 * Cancels all existing notifications for the trip, then schedules
 * new ones for every enabled reminder type whose trigger date is in
 * the future. Returns the new notification ID map (saved to AsyncStorage).
 *
 * Safe to call when EXPO_GO on iOS — skips scheduling but still clears old IDs.
 */
export async function scheduleReminderNotifications(
  uid: string,
  trip: PlannedTrip,
  prefs: TripReminderPrefs
): Promise<StoredNotifIds> {
  // Always cancel existing notifications before rescheduling
  const existing = await getStoredNotifIds(uid, trip.id);
  await Promise.all(
    Object.values(existing)
      .filter(Boolean)
      .map((id) =>
        Notifications.cancelScheduledNotificationAsync(id!).catch(() => {})
      )
  );

  if (!isLocalNotifSupported) {
    // iOS Expo Go — preferences are saved to Firestore but not scheduled
    await saveNotifIds(uid, trip.id, {});
    return {};
  }

  const perm = await getNotificationPermission();
  if (perm !== 'granted') {
    await saveNotifIds(uid, trip.id, {});
    return {};
  }

  const now = Date.now();
  const ids: StoredNotifIds = {};

  for (const type of REMINDER_TYPES) {
    if (!prefs[type]) continue;

    const triggerDate = reminderTriggerDate(trip.startDate, type);
    if (triggerDate.getTime() <= now) {
      // Trigger date is in the past — skip silently
      continue;
    }

    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: buildContent(type, trip.destination),
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: triggerDate,
        },
      });
      ids[type] = id;
      if (__DEV__) {
        console.log(
          `[Notifications] Scheduled ${type} for ${trip.destination} at ${triggerDate.toISOString()} → ${id}`
        );
      }
    } catch (err) {
      console.warn('[Notifications] Failed to schedule', type, err);
    }
  }

  await saveNotifIds(uid, trip.id, ids);
  return ids;
}

/**
 * Cancels all scheduled notifications for a trip and removes stored IDs.
 * Call when deleting a trip or turning off all reminders.
 */
export async function cancelAllTripNotifications(
  uid: string,
  tripId: string
): Promise<void> {
  const ids = await getStoredNotifIds(uid, tripId);
  await Promise.all(
    Object.values(ids)
      .filter(Boolean)
      .map((id) =>
        Notifications.cancelScheduledNotificationAsync(id!).catch(() => {})
      )
  );
  await clearStoredNotifIds(uid, tripId);
}

/**
 * Returns true if a reminder type's trigger date is still in the future.
 * Used to show "already passed" state in the UI.
 */
export function isReminderSchedulable(startDate: Date, type: ReminderType): boolean {
  return reminderTriggerDate(startDate, type).getTime() > Date.now();
}
