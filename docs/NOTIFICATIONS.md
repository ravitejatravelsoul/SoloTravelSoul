# Notifications — Architecture & Limitations

## Architecture

SoloTravelSoul uses **local scheduled notifications only** — no push server, no FCM, no paid API.

**Library:** `expo-notifications` (v0.32, bundled with Expo SDK 54)

**What local notifications do:**
- Scheduled on the device by the app at a specific future date/time
- Delivered by the OS even when the app is closed
- Do not require a server or internet connection
- Do not require FCM registration
- Can be cancelled or rescheduled by the app at any time

**What they do NOT do:**
- Cannot be triggered by events on a different device
- Cannot be sent while the app is uninstalled
- Cannot carry data payloads beyond the notification content

---

## Reminder Types

| Type | When | Message |
|---|---|---|
| `sevenDays` | 7 days before `trip.startDate`, 9:00 AM | "7 days until [destination]! Time to start packing." |
| `checklistReminder` | 3 days before `trip.startDate`, 9:00 AM | "3 days until [destination]. Finish your packing list." |
| `oneDay` | 1 day before `trip.startDate`, 9:00 AM | "Tomorrow: [destination]! Are you all packed?" |
| `morningOf` | Day of `trip.startDate`, 7:00 AM | "Today you're off to [destination]! Have an amazing trip." |

Reminders whose trigger date has already passed are silently skipped — no error is shown.

---

## Storage

| What | Where |
|---|---|
| User preference (which reminders are on/off) | Firestore: `users/{uid}/trips/{tripId}/reminders/prefs` |
| Scheduled notification IDs (device-specific) | AsyncStorage: `@sts/notif_ids_{uid}_{tripId}` |

Notification IDs are **not** stored in Firestore because they are device-specific — the same user on a different phone has a different set of scheduled notifications.

When the user edits trip dates, the hook (`useTripReminders`) detects the `startDate` change and reschedules all enabled reminders automatically.

When a trip is deleted, `cancelAllTripNotifications` cancels all scheduled notifications and removes the AsyncStorage entry.

---

## Expo Go vs Dev Build

| Platform | Expo Go | Dev Build / Production |
|---|---|---|
| **Android** | ✅ Local notifications work | ✅ Work |
| **iOS** | ❌ Notifications silently fail | ✅ Work |

**Why iOS Expo Go doesn't work:**
Apple's notification system requires that the app be signed with a provisioning profile that includes the `aps-environment` entitlement. Expo Go's provisioning profile does not include this entitlement for third-party apps. This is an Apple constraint, not an Expo limitation.

**What the app does on iOS Expo Go:**
- The UI is fully functional — the user can enable/disable reminders
- Preferences are saved to Firestore (will sync to other devices/builds)
- A yellow warning banner explains that a dev build is required
- No crash, no error — the scheduling step is silently skipped

**Detection:**
```typescript
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const isExpoGoiOS =
  Platform.OS === 'ios' && Constants.executionEnvironment === 'storeClient';
```

---

## Firestore Security Rules

Add to `firestore.rules` before shipping:

```
match /users/{uid}/trips/{tripId}/reminders/{doc} {
  allow read, write: if request.auth != null && request.auth.uid == uid;
}
```

---

## Permission Flow

1. User toggles a reminder ON for the first time
2. `requestNotificationPermission()` is called
3. If `undetermined`: system permission dialog appears
4. If `granted`: notifications are scheduled immediately
5. If `denied`: user is shown a "tap to open Settings" banner

Permission is requested **only when the user enables their first reminder**, not at app startup.

---

## Testing on a Physical Device (Android Expo Go)

1. Run `npx expo start` and open in Expo Go on Android
2. Open any upcoming trip → scroll to **Reminders** section
3. Toggle "7 days before" on → permission dialog appears → Allow
4. Verify: green "Active" badge appears in the Reminders header
5. To test immediately (without waiting days):
   - In `notificationService.ts`, temporarily change the trigger to `seconds: 10`
   - Toggle a reminder on
   - Lock the phone screen
   - Wait 10 seconds — notification should appear
   - Revert the change after testing

## Testing on iOS Dev Build

```bash
# After running eas init:
eas build --platform ios --profile development
# Install on device via TestFlight or direct install
# Then test reminders — they will fire correctly
```

---

## Phase 2: FCM Push Notifications (Future)

When Firebase Cloud Messaging is added (post-beta), trip reminders can optionally become server-side push notifications that work even when the app is uninstalled. Until then, local notifications cover all in-app user-initiated reminders.

FCM requires:
- A Blaze plan Firebase project
- `google-services.json` / `GoogleService-Info.plist` in the build
- An EAS build (not Expo Go compatible)
- A push notification server or Cloud Functions to trigger sends
