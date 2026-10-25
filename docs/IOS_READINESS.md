# iPhone readiness (2026-10-24)

Status: **code and configuration are prepared; nothing has been compiled or run on an iPhone or the iOS Simulator.**
This was done on Windows. Native iOS compile and runtime are BLOCKED until a Mac (or an EAS iOS build) is used.
Android exports, release suites and resolved Android config are not iPhone evidence.

## What changed for iPhone

| Area | Change |
|---|---|
| Shadows | iOS clips a view's own shadow when it also has `overflow: 'hidden'`. `utils/shadowClip.ts` + `components/ui/ShadowClip.tsx` split such cards into a shadow layer and a clip layer on iOS only; `PressableScale` does the same. Applied to post, journal, trip, place, community and settings cards. Android renders exactly as before. |
| Keyboard | `components/ui/KeyboardAvoid.tsx` replaces `KeyboardAvoidingView` everywhere. Android keeps the stock behaviour. iPhone measures the view in the window (the stock version measures in the parent, which is wrong inside page sheets and modal cards), follows the keyboard animation, and skips it with reduced motion. Drafts, focus and cursor are untouched (padding only). |
| Home indicator | Chat composer, comments sheet and date sheet no longer add the bottom inset twice or sit under it. |
| Offline notice | The status-bar banner collides with the Dynamic Island/notch, so on iPhone it is a small non-blocking pill above the tab bar (Dynamic Type capped at 1.3×, announced as an alert). |
| Navigation | Form screens presented as modals (`trips/create`, `trips/[id]/edit`, `groups/new`, `community/groups/create`) disable swipe-down so a stray swipe cannot discard input. Swipe-back on pushed screens is the iOS default and is unchanged. |
| Camera | Denied camera permission now throws `CameraPermissionDeniedError`; post/journal/profile pickers show a message with a way to Settings instead of doing nothing. |
| Launch | Native iOS splash is now a centred 220 pt logo on `#FFF8EE` (expo-splash-screen iOS props), matching the JavaScript `LaunchOverlay` instead of the old full-screen stretched image. Android splash is unchanged. |
| Info.plist | Purpose strings rewritten to match real features (photos, camera, Face ID, location while open). Microphone key removed (no recording feature). The default "Always location" strings are replaced with honest ones (the key is required while `expo-location` is linked). App Transport Security: arbitrary loads **off**, local networking allowed for development servers. |
| Identity | Production iOS bundle id, URL schemes, name, signing: unchanged. Staging (`APP_VARIANT=staging`) now has its own iOS bundle id `com.solotravelsoul.app.staging`, scheme `solotravelsoul-staging`, name "SoloTravelSoul Staging". |
| EAS | New `preview-simulator` profile (extends `preview`, `simulator: true`). Mapbox/Foursquare stay disabled; no production configuration enters staging builds. |

Unchanged on purpose: Dynamic Type is not capped (only the tab label and offline pill are), the SDK is not upgraded, Mapbox/Foursquare stay disabled, no native Firebase files (the app uses the Firebase JS SDK with AsyncStorage persistence), Android-only font-scale relayout and plugins stay Android-only.

## Evidence

- `node tests/release/ios.cjs` (new, in `npm run test:release`): 16 checks — shadow split, PressableScale on both platforms, KeyboardAvoid maths and adoption, safe areas, offline pill, modal gestures, camera denial, Android-only helpers, identity, permissions, ATS, splash, EAS profiles, no native Firebase.
- `npm run test:release`: all suites pass (including the 3 existing app checks updated for the new helpers and the staging iOS identity).
- `tsc --noEmit`: clean. `eslint`: 0 errors (56 pre-existing warnings).
- `expo export --platform ios` and `--platform android` (staging env, no dotenv): both succeed; Hermes bytecode produced for both.
- `expo config --type introspect` in an isolated scratch copy (the way to see the resolved native iOS config on Windows; `expo prebuild --platform ios` is refused off macOS):
  - Info.plist keys and strings as above; staging and production purpose strings are identical.
  - Splash storyboard uses the centred logo (`SplashScreenLogo`), not `SplashScreenLegacy`; background `#FFF8EE`.
  - Resolved Android config equals the pre-change config (ignoring ordering).
  - Entitlements: `aps-environment: development` (from `expo-notifications`; see below).

## Not verified (BLOCKED without a Mac / device)

Xcode compile, CocoaPods resolution, Simulator and physical-iPhone runtime: the shadow split on real cards, keyboard behaviour in sheets, Dynamic Island/home-indicator layout, swipe-back, photo/camera prompts and denial flow, local reminders, Face ID, authenticated image caching, splash-to-app handoff, offline queues on a real iOS network stack.

## Expo Go limitations

Expo Go cannot be used as a faithful iPhone test: it ships its own SDK (this project is SDK 54; Expo Go only supports the SDK it was built for, and the store version may not match), its own bundle id and URL scheme, its own permission strings, no `aps-environment`, and none of this app's splash, plist or identity. Local-notification and biometric behaviour differ in Go (the app already detects Expo Go on iOS). Do not upgrade the SDK just to match Expo Go; use a build.

## Physical-iPhone test checklist (staging build only)

1. Install builds side by side with nothing else: the staging app is `SoloTravelSoul Staging`.
2. Cold launch: ivory splash, logo does not jump size into the app, no white/black flash; reduced-motion on shows no logo animation.
3. Sign in / sign up / reset: keyboard never hides the field or the button; Face ID unlock works only for an existing session.
4. Chats and group chat: composer sits above the keyboard and the home indicator; newest message visible; swipe-back from a chat returns where you came from.
5. Comments sheet, join-request modal, group join modal, journal entry, date picker: keyboard/safe-area correct; draft kept when dismissing the keyboard.
6. Create trip / edit trip / new group: swipe-down does nothing; Cancel works; typed text survives switching to another app and back.
7. Cards (feed, journals, trips, places, community, settings): soft shadows visible under rounded cards; pressing scales once; no double action on rapid taps.
8. Settings → Accessibility → Display & Text Size → Larger Text → largest size. Text wraps, buttons reachable, validation errors readable, tab labels capped.
9. Photos: pick from the library (limited-library selection works; denying photo access shows the existing message, no stuck picker). The camera path is not reachable from any screen today (see owner decisions), so there is no camera prompt to test.
10. Reminders: allow, schedule, background the app, receive; deny → banner with "Open Settings".
11. Offline: Airplane Mode shows the pill above the tab bar, not under the Dynamic Island; queued sends deliver on reconnect, once.
12. Account switch and account deletion: no stale content from the previous account; images from the previous account are not shown.
13. Landscape is unsupported (portrait only): confirm the app stays portrait.
14. Images load with sign-in (Worker media) after the app was idle > 1 hour (token refresh).

## Build and install path (exact)

All staging; never use the production profile for testing.

**Option A — real iPhone via EAS (needs Apple access):**
```
cd apps/mobile
eas device:create            # registers the iPhone UDID (ad hoc)
eas build --profile preview --platform ios
```
Install from the EAS build page on the registered iPhone (enable Developer Mode on iOS 16+). The `preview` profile sets `APP_VARIANT=staging` and the staging Firebase values from EAS environment `preview`; Mapbox/Foursquare are off.

**Option B — Simulator via EAS (no device registration, still needs Mac to run it):**
```
eas build --profile preview-simulator --platform ios
```
Unzip the `.app` and drag it onto a Simulator, or `xcrun simctl install booted <App>.app`.

**Option C — local Mac:**
```
cd apps/mobile
export APP_VARIANT=staging EXPO_PUBLIC_APP_ENV=staging EXPO_PUBLIC_MAPBOX_ENABLED=false EXPO_PUBLIC_FOURSQUARE_ENABLED=false EXPO_NO_DOTENV=1
# plus the staging EXPO_PUBLIC_FIREBASE_* / worker values (never the production ones; never apps/mobile/.env)
npx expo prebuild --platform ios --clean
npx expo run:ios                # Simulator, or: npx expo run:ios --device
```

## Access needed

- A Mac with current Xcode (local build / Simulator), **or** an Expo/EAS account on the project (`eas login`) for cloud builds.
- An **Apple Developer Program** membership (paid) for: ad hoc installs on a physical iPhone, the Push Notifications capability (`aps-environment` entitlement comes from `expo-notifications` — a development provisioning profile must include it), and any TestFlight/App Store path. Simulator builds need none.
- Apple ID/Team ID/App Store Connect app id are placeholders in `eas.json` `submit.production.ios`; fill in only at submission time.
- The staging bundle id `com.solotravelsoul.app.staging` must be registered under the team (EAS can do this on first build).

## Owner decisions / known limitations

- `expo-location` is linked but no screen calls `useLocation` today (checked); keeping it forces the "Always" plist keys to exist. Removing the plugin and package would drop them and the App Review question. Decision left to the owner.
- Camera capture is implemented in `utils/imageUtils.ts` / `hooks/useUpload.ts` (with the denied flow, covered by tests) but no screen calls it with `'camera'` today (checked); the camera string is kept because the helper is part of the bundle. Same decision applies.
- iOS image caching follows the Worker's `Cache-Control` (`private, max-age=300` shared media; `no-store` otherwise); removed or hidden media cannot be recalled from a device that already downloaded it.
- Push notifications (remote) are not used; only local reminders. The `aps-environment` entitlement is still added by `expo-notifications`.
- Local `GoogleService-Info.plist` / `google-services.json` files exist on this machine, are gitignored, and are never referenced by the config. Keep it that way: they may be production.
- Mapbox/Foursquare remain disabled; Mapbox 10.3.1 would need a native build and a token before it could be enabled on iPhone.
