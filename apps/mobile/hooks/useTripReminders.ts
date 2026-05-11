import { useState, useEffect, useCallback, useRef } from 'react';
import { getTripReminderPrefs, setTripReminderPrefs } from '@solotravelsoul/firebase';
import type { PlannedTrip, TripReminderPrefs, ReminderType } from '@solotravelsoul/shared';
import { DEFAULT_REMINDER_PREFS } from '@solotravelsoul/shared';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import {
  getNotificationPermission,
  requestNotificationPermission,
  scheduleReminderNotifications,
  cancelAllTripNotifications,
  type NotifPermStatus,
} from '@/services/notificationService';

function makeDefaultPrefs(tripId: string): TripReminderPrefs {
  return { tripId, ...DEFAULT_REMINDER_PREFS, updatedAt: new Date() };
}

export function useTripReminders(trip: PlannedTrip) {
  const uid = useAuthStore((s) => s.user?.uid);
  const addToast = useUIStore((s) => s.addToast);

  const [prefs, setPrefs] = useState<TripReminderPrefs>(makeDefaultPrefs(trip.id));
  const [permStatus, setPermStatus] = useState<NotifPermStatus>('undetermined');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Track previous trip startDate so we can detect date changes
  const prevStartDateRef = useRef(trip.startDate.getTime());

  // Load permission status and saved prefs on mount
  useEffect(() => {
    let cancelled = false;

    async function init() {
      const perm = await getNotificationPermission();
      if (!cancelled) setPermStatus(perm);

      if (!uid) {
        setLoading(false);
        return;
      }

      try {
        const saved = await getTripReminderPrefs(uid, trip.id);
        if (!cancelled && saved) setPrefs(saved);
      } catch {
        // Offline — use defaults, silently continue
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    init();
    return () => { cancelled = true; };
  }, [uid, trip.id]);

  // Reschedule notifications when trip start date changes (e.g. user edits the trip)
  useEffect(() => {
    const newTs = trip.startDate.getTime();
    if (newTs === prevStartDateRef.current) return;
    prevStartDateRef.current = newTs;

    const anyEnabled =
      prefs.sevenDays || prefs.oneDay || prefs.morningOf || prefs.checklistReminder;
    if (!uid || !anyEnabled) return;

    scheduleReminderNotifications(uid, trip, prefs).catch(() => {});
  }, [trip.startDate, uid, trip, prefs]);

  /** Toggle a specific reminder type on/off. Saves to Firestore and reschedules. */
  const toggleReminder = useCallback(
    async (type: ReminderType) => {
      if (!uid) return;

      const newPrefs: TripReminderPrefs = {
        ...prefs,
        [type]: !prefs[type],
        updatedAt: new Date(),
      };

      setSaving(true);
      setPrefs(newPrefs); // Optimistic

      try {
        await setTripReminderPrefs(uid, trip.id, newPrefs);

        // Request permission the first time any reminder is enabled
        const anyEnabled =
          newPrefs.sevenDays ||
          newPrefs.oneDay ||
          newPrefs.morningOf ||
          newPrefs.checklistReminder;

        if (anyEnabled) {
          let perm = permStatus;
          if (perm !== 'granted') {
            perm = await requestNotificationPermission();
            setPermStatus(perm);
          }
          if (perm === 'granted') {
            await scheduleReminderNotifications(uid, trip, newPrefs);
          }
        } else {
          // All reminders off — cancel everything
          await cancelAllTripNotifications(uid, trip.id);
        }
      } catch {
        setPrefs(prefs); // Revert optimistic
        addToast('Could not save reminder.', 'error');
      } finally {
        setSaving(false);
      }
    },
    [uid, trip, prefs, permStatus, addToast]
  );

  /** Ask for notification permission explicitly (e.g. from "Enable" button). */
  const requestPermission = useCallback(async (): Promise<NotifPermStatus> => {
    const status = await requestNotificationPermission();
    setPermStatus(status);

    if (status === 'granted' && uid) {
      const anyEnabled =
        prefs.sevenDays || prefs.oneDay || prefs.morningOf || prefs.checklistReminder;
      if (anyEnabled) {
        await scheduleReminderNotifications(uid, trip, prefs).catch(() => {});
      }
    }
    return status;
  }, [uid, trip, prefs]);

  /** Cancel all notifications for this trip (call when deleting). */
  const cancelAll = useCallback(async () => {
    if (!uid) return;
    await cancelAllTripNotifications(uid, trip.id);
  }, [uid, trip.id]);

  return {
    prefs,
    permStatus,
    loading,
    saving,
    toggleReminder,
    requestPermission,
    cancelAll,
  };
}
