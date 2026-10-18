// Travel compatibility onboarding: deterministic matching, optional setup progress,
// consent for the discovery record, rules/app option parity, bounded reads, and the
// blocked / deleting / suspended guards. Offline (no emulator); the rules behaviour
// itself is exercised in tests/release/rules.cjs under the emulator.
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const { root, transpile, worker, MemoryStore } = require('./lib/fakes.cjs');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const cache = {};
function load(rel, deps = {}) {
  const file = path.join(root, rel);
  if (cache[file]) return cache[file];
  const m = { exports: {} };
  cache[file] = m.exports;
  new Function('module', 'exports', 'require', transpile(file))(m, m.exports, (n) => {
    if (n in deps) return deps[n];
    if (n.startsWith('./')) return load(path.join(path.dirname(rel), n.slice(2) + '.ts'), deps);
    return require(n);
  });
  return (cache[file] = m.exports);
}
const prefs = load('packages/shared/src/preferences.ts');
const compat = load('packages/shared/src/compatibility.ts');
const shared = { ...prefs, ...compat };
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const d = (s) => new Date(`${s}T00:00:00`);
const trip = (dest, from, to) => ({ destination: dest, destinationKey: prefs.destinationKey(dest), startDate: from ? d(from) : null, endDate: to ? d(to) : null });
const ME = { travelStyles: ['solo', 'cultural'], interests: ['hiking', 'food', 'art'], languages: ['English', 'Portuguese'], travelPace: 'balanced', travelSchedule: 'planned', groupSizePreference: 'small' };
const MY_TRIP = trip('Lisbon, Portugal', '2026-06-01', '2026-06-10');

// ── Matching ──────────────────────────────────────────────────────────────────
test('matching: destination and date overlap come first, with an explained overlap window', () => {
  const r = compat.compareTravelers(ME, { ...ME }, MY_TRIP, trip('lisbon', '2026-06-08', '2026-06-20'));
  assert.equal(r.trip.match, 'overlap');
  assert.equal(r.trip.overlapDays, 3);
  assert.equal(r.reasons[0], 'Both in Lisbon, Portugal 8 Jun–10 Jun (3 days overlap)');
  assert.equal(r.level, 'strong');
  assert.deepEqual(r.differences, []);
  assert.deepEqual(r.notProvided, []);
  // A traveler with more shared interests but no date overlap ranks below any overlap.
  const close = compat.compareTravelers(ME, { travelStyles: [] }, MY_TRIP, trip('Lisbon', '2026-06-10', '2026-06-11'));
  const far = compat.compareTravelers(ME, { ...ME }, MY_TRIP, trip('Lisbon', '2026-07-01', '2026-07-05'));
  assert.equal(close.trip.overlapDays, 1);
  assert.equal(far.trip.match, 'no_overlap');
  assert.ok(far.differences.includes('Your dates do not overlap'));
  assert.ok(close.rank > far.rank, 'date overlap outranks shared preferences');
});

test('matching: shared interests, styles, pace and group are reasons; real differences are listed separately', () => {
  const them = { travelStyles: ['cultural', 'luxury'], interests: ['food', 'nightlife'], languages: ['Spanish'], travelPace: 'active', travelSchedule: 'spontaneous', groupSizePreference: 'large' };
  const r = compat.compareTravelers(ME, them);
  assert.ok(r.reasons.includes('Shared travel style: Cultural'));
  assert.ok(r.reasons.includes('Shared interests: Food'));
  assert.deepEqual(r.differences, [
    'No common language listed',
    'Pace: you prefer balanced, they prefer active (close)',
    'Schedule: you are planned, they are spontaneous',
    'Group size: you prefer small group, they prefer larger group',
  ]);
  assert.equal(r.trip.match, 'no_trip');
  assert.equal(r.level, 'good');
  const opposite = compat.compareTravelers({ travelPace: 'relaxed' }, { travelPace: 'active' });
  assert.deepEqual(opposite.differences, ['Pace: you prefer relaxed, they prefer active']);
});

test('matching: missing answers are "not provided", never a mismatch; too little in common is "not enough information"', () => {
  const r = compat.compareTravelers(ME, { travelStyles: ['solo'] });
  assert.deepEqual(r.notProvided, ['interests', 'languages', 'pace', 'schedule', 'group size']);
  assert.deepEqual(r.differences, []);
  assert.equal(r.level, 'not_enough_info');
  const mine = compat.compareTravelers({}, { ...ME });
  assert.deepEqual(mine.youHaveNotAnswered, ['travel style', 'interests', 'languages', 'pace', 'schedule', 'group size']);
  assert.deepEqual(mine.differences, []);
  assert.equal(mine.level, 'not_enough_info');
  // Same destination without dates: dates are "not provided", not a mismatch.
  const unknown = compat.compareTravelers(ME, {}, MY_TRIP, trip('Lisbon', null, null));
  assert.equal(unknown.trip.match, 'dates_unknown');
  assert.ok(unknown.notProvided.includes('trip dates'));
  assert.deepEqual(unknown.differences, []);
  // A date overlap with nothing else answered is still a reason to look, not "not enough information".
  const overlapOnly = compat.compareTravelers({}, {}, MY_TRIP, trip('Lisbon', '2026-06-05', '2026-06-06'));
  assert.equal(overlapOnly.level, 'some');
});

test('matching: date overlap is inclusive and destination matching is normalized', () => {
  assert.equal(compat.overlapDays(d('2026-06-01'), d('2026-06-10'), d('2026-06-10'), d('2026-06-12')), 1);
  assert.equal(compat.overlapDays(d('2026-06-01'), d('2026-06-10'), d('2026-06-11'), d('2026-06-12')), 0);
  assert.equal(compat.overlapDays(d('2026-06-01'), d('2026-06-30'), d('2026-06-05'), d('2026-06-07')), 3);
  assert.equal(prefs.destinationKey('  São Paulo, Brazil '), 'sao paulo');
  assert.equal(prefs.destinationKey('Sao  Paulo'), 'sao paulo');
  assert.equal(prefs.destinationKey(''), null);
  assert.equal(compat.compareTrips(MY_TRIP, trip('Porto', '2026-06-01', '2026-06-10')).match, 'other_destination');
  assert.equal(compat.compareTrips(null, MY_TRIP).match, 'no_trip');
});

test('matching: deterministic and transparent; unknown attributes are ignored, nothing is inferred', () => {
  const them = { ...ME, interests: ['food'] };
  const a = compat.compareTravelers(ME, them, MY_TRIP, trip('Lisbon', '2026-06-03', '2026-06-04'));
  const b = compat.compareTravelers(ME, { ...them, gender: 'x', age: 30, religion: 'y', safetyScore: 1 }, MY_TRIP, trip('Lisbon', '2026-06-03', '2026-06-04'));
  assert.deepEqual(a, b);
  assert.deepEqual(Object.keys(a).sort(), ['differences', 'level', 'notProvided', 'rank', 'reasons', 'trip', 'youHaveNotAnswered']);
  const items = [
    { id: 'b', name: 'Bea', result: { ...a } }, { id: 'a', name: 'Ann', result: { ...a } },
    { id: 'c', name: 'Cid', result: { ...a, rank: a.rank + 1 } },
  ];
  assert.deepEqual(compat.rankByCompatibility(items).map((x) => x.id), ['c', 'a', 'b']);
  const src = read('packages/shared/src/compatibility.ts');
  assert.doesNotMatch(src, /fetch\(|anthropic|openai|Math\.random/i);
});

// ── Optional setup: skip / resume / edit ──────────────────────────────────────
test('setup: offered to new and existing users and part-way users; skipped or completed is not re-offered', () => {
  assert.equal(prefs.shouldOfferPreferenceSetup({ name: 'Existing user' }), true);
  assert.equal(prefs.shouldOfferPreferenceSetup({ preferenceSetup: prefs.progressAt(3, 1) }), true);
  assert.equal(prefs.shouldOfferPreferenceSetup({ preferenceSetup: prefs.finishedProgress('skipped', 1) }), false);
  assert.equal(prefs.shouldOfferPreferenceSetup({ preferenceSetup: prefs.finishedProgress('completed', 1) }), false);
  assert.equal(prefs.shouldOfferPreferenceSetup(null), false);
});

test('setup: resumes at the saved step, clamps bad values, restarts from the beginning once finished', () => {
  assert.equal(prefs.resumeStep(undefined), 0);
  assert.equal(prefs.resumeStep(prefs.progressAt(4, 1)), 4);
  assert.equal(prefs.resumeStep({ status: 'in_progress', step: 99, updatedAtMs: 1 }), prefs.PREFERENCE_STEPS.length - 1);
  assert.equal(prefs.resumeStep({ status: 'in_progress', step: -2, updatedAtMs: 1 }), 0);
  assert.equal(prefs.resumeStep(prefs.finishedProgress('completed', 1)), 0);
  assert.deepEqual(prefs.PREFERENCE_STEPS, ['styles', 'interests', 'languages', 'pace', 'schedule', 'groupSize', 'sharing']);
  // The rules accept exactly these step indexes.
  assert.match(read('firestore.rules'), new RegExp(`v\\.step <= ${prefs.PREFERENCE_STEPS.length - 1}`));
});

test('setup and editing share one validation: invalid values dropped, duplicates removed, sizes capped', () => {
  const clean = prefs.sanitizePreferences({
    travelStyles: ['solo', 'solo', 'backpacker'], interests: ['food', 'religion'], languages: [' English ', 'English', '', 'x'.repeat(41), ...Array.from({ length: 20 }, (_, i) => `L${i}`)],
    travelPace: 'frantic', travelSchedule: 'planned', groupSizePreference: 'small', shareCompatibility: 'yes',
  });
  assert.deepEqual(clean.travelStyles, ['solo']);
  assert.deepEqual(clean.interests, ['food']);
  assert.equal(clean.languages.length, 12);
  assert.equal(clean.languages[0], 'English');
  assert.equal(clean.travelPace, null);
  assert.equal(clean.travelSchedule, 'planned');
  assert.equal(clean.shareCompatibility, false);
  const setup = read('apps/mobile/app/(app)/profile/preferences.tsx');
  const edit = read('apps/mobile/app/(app)/profile/edit.tsx');
  for (const src of [setup, edit]) {
    assert.match(src, /sanitizePreferences\(/);
    assert.match(src, /<PreferenceField/);
  }
  for (const step of ['styles', 'interests', 'languages', 'pace', 'schedule', 'groupSize']) assert.match(edit, new RegExp(`step="${step}"`));
  // Setup: Back, per-question Skip, Skip setup, progress; each step saves progress.
  assert.match(setup, /Skip setup for now/);
  assert.match(setup, /accessibilityLabel="Skip this question"/);
  assert.match(setup, /Step \{step \+ 1\} of \{PREFERENCE_STEPS\.length\}/);
  assert.match(setup, /progressAt\(step \+ 1, now\)/);
  assert.match(setup, /finishedProgress\('skipped'/);
  assert.match(read('apps/mobile/hooks/useAuth.ts'), /pathname: '\/\(app\)\/profile\/preferences', params: \{ from: 'signup' \}/);
});

test('older and demo profiles: missing new fields read as "not provided" and still compare', () => {
  const old = prefs.preferencesOf({ name: 'Old', travelStyles: ['backpacker', 'eco'] });
  assert.deepEqual(old, { travelStyles: ['eco'], interests: [], languages: [], travelPace: null, travelSchedule: null, groupSizePreference: null, shareCompatibility: false });
  const demoRecord = { uid: 'd', displayName: 'Maya Okafor (Demo)', currentCity: 'Lisbon', travelStyles: ['budget', 'food'], destination: null, destinationStartDate: null, destinationEndDate: null };
  const r = compat.compareTravelers(ME, demoRecord);
  assert.ok(r.notProvided.includes('pace') && r.notProvided.includes('interests'));
  assert.deepEqual(r.differences, []);
});

// ── Consent and the discovery record ──────────────────────────────────────────
test('consent: pace, schedule and group size enter the discovery record only with shareCompatibility', () => {
  const profile = { name: 'Pia', city: 'Lisbon', profileVisibility: 'public', showInNearbyTravelers: true, travelStyles: ['solo'], interests: ['hiking'], languages: ['English'],
    travelPace: 'relaxed', travelSchedule: 'planned', groupSizePreference: 'pair', email: 'pia@example.test', phone: '+1', emergencyContact: 'x', bio: 'b' };
  const off = prefs.discoveryRecordFields('pia', { ...profile, shareCompatibility: false }, null);
  assert.equal(off.travelPace, null); assert.equal(off.travelSchedule, null); assert.equal(off.groupSizePreference, null);
  const on = prefs.discoveryRecordFields('pia', { ...profile, shareCompatibility: true }, null);
  assert.equal(on.travelPace, 'relaxed'); assert.equal(on.groupSizePreference, 'pair');
  // Never contact details or other profile data; the key list matches the rules' hasOnly list.
  const rules = read('firestore.rules');
  const allowed = rules.match(/validDiscoveryRecord[\s\S]*?d\.keys\(\)\.hasOnly\(\[([\s\S]*?)\]\)/)[1].match(/'([^']+)'/g).map((x) => x.slice(1, -1));
  assert.deepEqual([...Object.keys(on), 'updatedAt'].sort(), [...allowed].sort());
  assert.ok(!('email' in on) && !('phone' in on) && !('bio' in on));
  // A trip is shared only when chosen, and only destination + dates.
  assert.equal(on.destination, null);
  const withTrip = prefs.discoveryRecordFields('pia', profile, { destination: 'Lisbon, Portugal', startDate: d('2026-06-01'), endDate: d('2026-06-10') });
  assert.equal(withTrip.destinationKey, 'lisbon');
  assert.equal(prefs.discoveryRecordFields('pia', profile, { destination: 'Lisbon', startDate: d('2026-06-10'), endDate: d('2026-06-01') }).destination, null);
  assert.equal(prefs.isDiscoverable({ ...profile, profileVisibility: 'private' }), false);
  assert.equal(prefs.isDiscoverable({ ...profile, showInNearbyTravelers: false }), false);
});

test('consent: the app syncs the record only while discoverable, removes it on opt-out, and shares only upcoming chosen trips', async () => {
  const calls = [];
  const discovery = load('apps/mobile/utils/discovery.ts', {
    '@solotravelsoul/firebase': { upsertNearbyTraveler: async (...a) => calls.push(['upsert', ...a]), deleteNearbyTraveler: async (uid) => calls.push(['delete', uid]) },
    '@solotravelsoul/shared': shared,
  });
  const now = d('2026-05-15');
  const trips = [
    { id: 'past', destination: 'Rome', startDate: d('2026-01-01'), endDate: d('2026-01-05'), isArchived: false },
    { id: 'arch', destination: 'Oslo', startDate: d('2026-07-01'), endDate: d('2026-07-05'), isArchived: true },
    { id: 'lis', destination: 'Lisbon', startDate: d('2026-06-01'), endDate: d('2026-06-10'), isArchived: false },
    { id: 'blank', destination: ' ', startDate: d('2026-06-01'), endDate: d('2026-06-10'), isArchived: false },
  ];
  assert.deepEqual(discovery.upcomingTrips(trips, now).map((t) => t.id), ['lis']);
  assert.equal(discovery.sharedTripFor({ discoveryTripId: 'past' }, trips, now), null);
  assert.equal(discovery.sharedTripFor({ discoveryTripId: 'arch' }, trips, now), null);
  assert.equal(discovery.sharedTripFor({ discoveryTripId: 'lis' }, trips, now).destination, 'Lisbon');
  await discovery.syncDiscovery('u', { profileVisibility: 'private', showInNearbyTravelers: true }, trips);
  await discovery.syncDiscovery('u', { profileVisibility: 'public', showInNearbyTravelers: false }, trips);
  assert.equal(calls.length, 0, 'never written while not discoverable');
  await discovery.syncDiscovery('u', { profileVisibility: 'public', showInNearbyTravelers: true, discoveryTripId: 'past' }, trips);
  assert.deepEqual(calls[0].slice(0, 2), ['upsert', 'u']);
  assert.equal(calls[0][3], null, 'a past trip is not shared');
  await discovery.leaveDiscovery('u');
  assert.deepEqual(calls[1], ['delete', 'u']);
  const privacy = read('apps/mobile/app/(app)/profile/privacy.tsx');
  assert.match(privacy, /await leaveDiscovery\(user\.uid\)/);
  assert.match(privacy, /handleShareToggle/);
  assert.match(privacy, /disabled=\{!isPublic\}/, 'discovery still requires a public profile');
});

// ── Rules parity, bounded reads, guards ───────────────────────────────────────
test('rules option lists match the app option lists', () => {
  const rules = read('firestore.rules');
  const list = (fn) => rules.match(new RegExp(`function ${fn}\\(\\) \\{ return \\[([^\\]]*)\\]`))[1].match(/'([^']+)'/g).map((x) => x.slice(1, -1));
  assert.deepEqual(list('travelStyleOptions'), [...prefs.TRAVEL_STYLE_OPTIONS]);
  assert.deepEqual(list('interestOptions'), [...prefs.INTEREST_OPTIONS]);
  assert.deepEqual(list('paceOptions'), prefs.PACE_OPTIONS.map((o) => o.value));
  assert.deepEqual(list('scheduleOptions'), prefs.SCHEDULE_OPTIONS.map((o) => o.value));
  assert.deepEqual(list('groupSizeOptions'), prefs.GROUP_SIZE_OPTIONS.map((o) => o.value));
  assert.match(rules, /allow create, update: if notDeleting\(\) && \(request\.auth != null && request\.auth\.uid == userId\)\s+&& validUserPreferences\(\);/);
  assert.match(rules, /allow list: if request\.auth != null && request\.query\.limit <= 50;/);
});

test('bounded reads: one-shot queries with fixed limits, one batched owner lookup, no listeners or per-card reads', () => {
  const fsSrc = read('packages/firebase/src/firestore.ts');
  assert.match(fsSrc, /COMPANION_TRAVELER_LIMIT = 30/);
  assert.match(fsSrc, /COMPANION_TRIP_LIMIT = 20/);
  assert.match(fsSrc, /where\('destinationKey', '==', key\), limit\(COMPANION_TRAVELER_LIMIT\)/);
  assert.match(fsSrc, /collection\(db, 'publicTrips'\), where\('destinationKey', '==', key\), limit\(COMPANION_TRIP_LIMIT\)/);
  assert.match(fsSrc, /\.slice\(0, 30\)[\s\S]{0,200}where\('uid', 'in', ids\), limit\(30\)/);
  const screen = read('apps/mobile/app/(app)/community/companions.tsx');
  assert.doesNotMatch(screen, /onSnapshot|subscribe[A-Z]|setInterval|getPublicProfile|getPublicTrip\(/);
  assert.equal((screen.match(/getDiscoveryRecords\(/g) || []).length, 1);
  assert.match(screen, /destinationKey|getCompanionTravelers\(selected\.destination\)/);
  // Destination-only browsing is kept.
  assert.match(read('apps/mobile/app/(app)/community/travelers/index.tsx'), /subscribeDestinationTravelers/);
  assert.match(screen, /Browse by destination only/);
});

test('guards: blocked users and self are hidden; actions reuse profile / trip / join-request flows; nothing is sent automatically', () => {
  const screen = read('apps/mobile/app/(app)/community/companions.tsx');
  assert.match(screen, /other === uid \|\| blockedUids\.includes\(other\)/);
  assert.match(screen, /\/\(app\)\/community\/profile\/\$\{t\.traveler\.uid\}/);
  assert.match(screen, /\/\(app\)\/discover\/trips\/\$\{t\.trip\.tripId\}/);
  assert.doesNotMatch(screen, /submitTripJoinRequest|sendDirectMessage|getOrCreateDirectChat|createGroup/);
  // Travelers are shown only to people who are discoverable themselves (reciprocal, opt-in).
  assert.match(screen, /discoverable \? getCompanionTravelers/);
});

test('deleting accounts leave discovery first; suspension removes the record', async () => {
  const deletion = worker('accountDeletion');
  assert.equal(deletion.DELETION_STEPS[0].id, 'discovery');
  const store = new MemoryStore();
  await store.commit([{ kind: 'set', path: 'nearbyTravelers/gone', data: { uid: 'gone' } }, { kind: 'set', path: 'nearbyTravelers/other', data: { uid: 'other' } }]);
  await deletion.DELETION_STEPS[0].run({ uid: 'gone', store });
  assert.equal(await store.get('nearbyTravelers/gone'), null);
  assert.ok(await store.get('nearbyTravelers/other'));
  await deletion.DELETION_STEPS[0].run({ uid: 'gone', store }); // retry safe
  assert.match(read('packages/firebase/src/moderation.ts'), /batch\.delete\(doc\(db, 'nearbyTravelers', uid\)\)/);
  assert.match(read('workers/r2-upload-worker/src/accountDeletion.ts'), /deleteTree\(ctx, `users\/\$\{uid\}`, `blocks\/\$\{uid\}`, `nearbyTravelers\/\$\{uid\}`/);
});

test('trip connection: join requests no longer read the organizer block list; cancel reaches the server; errors are reported truthfully', () => {
  const fsSrc = read('packages/firebase/src/firestore.ts');
  const submit = fsSrc.slice(fsSrc.indexOf('export async function submitTripJoinRequest'), fsSrc.indexOf('export async function cancelTripJoinRequest'));
  assert.doesNotMatch(submit, /'blocks'/, 'the requester cannot read the organizer block list');
  const rules = read('firestore.rules');
  const jr = rules.slice(rules.indexOf('match /tripJoinRequests/{requestId}'), rules.indexOf('match /travelGroups/{groupId}'));
  assert.match(jr, /unblocked\(request\.auth\.uid, request\.resource\.data\.ownerUid\)/);
  assert.match(jr, /resource\.data\.status == 'cancelled'\s+&& request\.resource\.data\.status == 'pending'/);
  const modal = read('apps/mobile/components/community/JoinRequestModal.tsx');
  assert.match(modal, /getTripJoinRequestStatus\(trip\.tripId, requestor\.id\)/);
  assert.match(modal, /if \(status === 'pending'\) Alert\.alert\('Already requested'/);
  assert.match(modal, /'Request not sent'/);
  const screen = read('apps/mobile/app/(app)/discover/trips/[tripId].tsx');
  assert.match(screen, /await cancelTripJoinRequest\(`\$\{tripId\}_\$\{uid\}`, uid\);\s+setRequestStatus\('cancelled'\)/);
});

test('privacy documentation covers preferences, consent, the shared trip and deletion', () => {
  const policy = read('apps/mobile/app/privacy.tsx');
  assert.match(policy, /travel preferences, traveler discovery data/);
  assert.match(policy, /pace, schedule and preferred group size are shown to other travelers only if you turn on sharing/);
  assert.match(policy, /only its destination and dates are shown/);
  assert.match(policy, /missing answers are never treated as a mismatch/);
});

(async () => {
  let passed = 0;
  for (const t of tests) {
    try { await t.fn(); passed++; console.log(`PASS ${t.name}`); } catch (e) { console.error(`FAIL ${t.name}\n`, e); process.exitCode = 1; }
  }
  console.log(`${passed}/${tests.length} compatibility checks passed`);
})();
