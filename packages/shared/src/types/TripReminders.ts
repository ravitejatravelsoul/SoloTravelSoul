export type ReminderType = 'sevenDays' | 'oneDay' | 'morningOf' | 'checklistReminder';

// Persisted to Firestore at users/{uid}/trips/{tripId}/reminders/prefs
export interface TripReminderPrefs {
  tripId: string;
  sevenDays: boolean;
  oneDay: boolean;
  morningOf: boolean;
  checklistReminder: boolean;
  updatedAt: Date;
}

export const DEFAULT_REMINDER_PREFS: Omit<TripReminderPrefs, 'tripId' | 'updatedAt'> = {
  sevenDays: false,
  oneDay: false,
  morningOf: false,
  checklistReminder: false,
};

// Scheduled notification IDs — device-local, stored in AsyncStorage.
// Each value is a string ID returned by expo-notifications.
export type StoredNotifIds = Partial<Record<ReminderType, string>>;
