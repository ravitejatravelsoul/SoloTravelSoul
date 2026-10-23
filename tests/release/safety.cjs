// Stranger safety, policy wording and "before you join" information (offline checks; the rules side of the same
// features is exercised under the emulator in tests/release/rules.cjs). Legal text is NOT validated here: the owner
// and a qualified lawyer must review it. These tests only keep the wording consistent with what the app really does.
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const { root, transpile } = require('./lib/fakes.cjs');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

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
const policy = load('packages/shared/src/policy.ts');
const shared = { ...prefs, ...compat, ...policy };
const summary = load('apps/mobile/utils/tripSummary.ts', { '@solotravelsoul/shared': shared });

const d = (s) => new Date(`${s}T00:00:00`);
const TRIP = { tripId: 't', ownerUid: 'o', ownerName: 'Olive', ownerPhotoURL: null, title: 'Lisbon', destination: 'Lisbon, Portugal', startDate: d('2026-11-19'), endDate: d('2026-11-27'),
  description: 'Walking week', tags: [], memberCount: 2, maxMembers: 3, isAcceptingMembers: true, coverPhotoURL: null, createdAt: d('2026-10-01'), updatedAt: d('2026-10-01') };
const ME = { travelStyles: ['solo'], interests: ['hiking', 'food'], languages: ['English'], travelPace: 'balanced', travelSchedule: 'planned', groupSizePreference: 'small', shareCompatibility: true };

// ── Before you join ───────────────────────────────────────────────────────────
test('trip facts: dates, group size and status are stated; budget and expectations are "Not provided" unless the organizer wrote them', () => {
  const rows = Object.fromEntries(summary.tripFacts(TRIP).map((r) => [r.label, r]));
  assert.match(rows.Dates.value, /Nov 19, 2026 .* Nov 27, 2026 \(9 days\)/);
  assert.equal(rows['Group size'].value, '2 of 3 places taken · Open to requests');
  assert.deepEqual([rows.Budget.value, rows.Budget.provided, rows['Organizer expects'].provided], ['Not provided', false, false]);
  const written = Object.fromEntries(summary.tripFacts({ ...TRIP, budgetNote: 'Mid-range', expectations: ' Easy pace ' }).map((r) => [r.label, r]));
  assert.deepEqual([written.Budget.value, written['Organizer expects'].value, written.Budget.provided], ['Mid-range', 'Easy pace', true]);
  assert.match(summary.tripFacts({ ...TRIP, memberCount: 3 })[2].value, /3 of 3 places taken · Full/);
  assert.match(summary.tripFacts({ ...TRIP, isAcceptingMembers: false })[2].value, /Not accepting requests/);
  assert.match(summary.tripFacts({ ...TRIP, maxMembers: null, memberCount: 1 })[2].value, /1 member, no limit set/);
});

test('organizer answers: only what they chose to share; everything else is "Not provided", never guessed', () => {
  const none = summary.organizerAnswers(null);
  assert.ok(none.every((r) => r.value === 'Not provided' && !r.provided));
  const some = Object.fromEntries(summary.organizerAnswers({ uid: 'o', travelStyles: ['solo'], interests: [], languages: ['English'], travelPace: 'relaxed', travelSchedule: null, groupSizePreference: 'small' }).map((r) => [r.label, r.value]));
  assert.deepEqual([some['Travel style'], some.Interests, some.Pace, some.Schedule, some['Preferred group size']], ['Solo', 'Not provided', 'Relaxed', 'Not provided', 'Small group']);
});

test('comparison: shared answers and real differences are shown; missing answers are "not provided", not mismatches', () => {
  const unshared = summary.compareAnswers(ME, null);
  assert.equal(unshared.otherShared, false);
  assert.deepEqual([unshared.shared, unshared.differences], [[], []]);
  assert.match(summary.comparisonHeadline(unshared), /have not shared/);
  const c = summary.compareAnswers(ME, { travelStyles: ['solo', 'cultural'], interests: ['hiking'], languages: ['Portuguese'], travelPace: 'active', travelSchedule: null, groupSizePreference: 'small' });
  assert.ok(c.shared.includes('Shared travel style: Solo') && c.shared.includes('Shared interests: Hiking') && c.shared.includes('Both prefer: small group'));
  assert.ok(c.differences.includes('No common language listed') && c.differences.some((x) => x.startsWith('Pace:')));
  assert.ok(c.notProvided.includes('schedule'), 'unanswered schedule is "not provided"');
  assert.ok(!c.differences.some((x) => /schedule/i.test(x)), 'a missing answer is never a difference');
  assert.equal(summary.comparisonHeadline(c), '3 shared · 2 differences');
  // The viewer who has not answered is told so (and nothing is invented for them).
  const blank = summary.compareAnswers({}, { travelPace: 'relaxed' });
  assert.ok(blank.youHaveNotAnswered.includes('pace'));
  assert.equal(summary.comparisonHeadline(summary.compareAnswers({}, {})), 'Not enough answers on both sides to compare.');
});

test('matching: nothing shared but enough to compare is "Few shared preferences", never "Some"', () => {
  const r = compat.compareTravelers({ travelStyles: ['solo'], interests: ['hiking'], languages: ['English'], travelPace: 'relaxed' }, { travelStyles: ['budget'], interests: ['nightlife'], languages: ['Spanish'], travelPace: 'active' });
  assert.equal(r.preferences.level, 'few');
  assert.equal(compat.PREFERENCE_LABELS.few, 'Few shared preferences');
  const one = compat.compareTravelers({ travelStyles: ['solo'], interests: ['hiking'] }, { travelStyles: ['solo'], interests: ['nightlife'] });
  assert.equal(one.preferences.level, 'some');
  assert.equal(compat.compareTravelers({ travelStyles: ['solo'] }, { travelStyles: ['budget'] }).preferences.level, 'not_enough_info');
});

// ── Policy wording ────────────────────────────────────────────────────────────
const FILES = {
  terms: 'apps/mobile/app/terms.tsx', privacy: 'apps/mobile/app/privacy.tsx', safety: 'apps/mobile/app/(app)/profile/safety.tsx',
  accept: 'apps/mobile/app/accept-terms.tsx', summary: 'apps/mobile/components/community/JoinSummary.tsx', policy: 'packages/shared/src/policy.ts',
};

test('policy constants state what the platform does not do, and never claim checks, insurance or monitored help', () => {
  assert.match(policy.PLATFORM_ROLE, /do not verify identities or run background checks/);
  assert.match(policy.PLATFORM_ROLE, /do not provide insurance, travel services or emergency assistance/);
  assert.match(policy.COMPATIBILITY_NOTICE, /not identity verification and not a safety guarantee/);
  assert.match(policy.NOT_EMERGENCY_SERVICE, /not an emergency service and is not monitored around the clock.*local emergency number/);
  assert.ok(policy.SAFETY_TIPS.some((t) => /public place/i.test(t.body)) && policy.SAFETY_TIPS.some((t) => /plans, budget/i.test(t.body))
    && policy.SAFETY_TIPS.some((t) => /someone you trust|friend or family/i.test(t.body)) && policy.SAFETY_TIPS.some((t) => /Do not send money/.test(t.body)));
  assert.match(policy.REPORT_BLOCK_LEAVE, /report or block.*leave a group chat or trip/);
  assert.match(policy.TERMS_VERSION, /^\d{4}-\d{2}-\d{2}$/);
});

test('user-facing policy text makes no promise the app cannot keep and has no blanket waiver', () => {
  const forbidden = [/within 48 hours/i, /17\+/, /under any circumstances/i, /guaranteed? safe/i, /legally compliant/i, /zero risk/i, /24\/7/, /monitored 24/i,
    /\bverified (traveler|member|user|profile)s?\b/i, /not (be )?(liable|responsible) for any/i, /all connections require host approval/i, /can'?t find you in discovery|cannot find you in discovery/i];
  for (const [name, rel] of Object.entries(FILES)) {
    const text = read(rel);
    for (const re of forbidden) assert.doesNotMatch(text, re, `${name}: ${re}`);
  }
  // Negated mentions are the only mentions of checks/insurance.
  for (const rel of Object.values(FILES)) {
    for (const m of read(rel).matchAll(/background check|insurance/gi)) {
      const around = read(rel).slice(Math.max(0, m.index - 70), m.index + 30);
      assert.match(around, /not|do not|no /i, `${rel}: "${around.replace(/\s+/g, ' ')}"`);
    }
  }
});

test('report screens promise no review or response time (that is an owner decision, not a claim to invent)', () => {
  for (const rel of ['apps/mobile/components/community/ReportModal.tsx', 'apps/mobile/app/(app)/profile/safety.tsx', 'apps/mobile/app/terms.tsx', 'apps/mobile/app/privacy.tsx']) {
    assert.doesNotMatch(read(rel), /we review all reports|reviewed within|respond within|we will respond/i, rel);
  }
  assert.match(read('apps/mobile/components/community/ReportModal.tsx'), /no guaranteed response time/);
});

test('Terms, Safety and the acceptance screen use the same shared wording', () => {
  const terms = read(FILES.terms), safety = read(FILES.safety), accept = read(FILES.accept), join = read(FILES.summary);
  for (const c of ['COMPATIBILITY_NOTICE', 'PLATFORM_ROLE', 'NOT_EMERGENCY_SERVICE', 'REPORT_BLOCK_LEAVE', 'SAFETY_TIPS', 'TERMS_VERSION']) assert.match(terms, new RegExp(c), `Terms use ${c}`);
  for (const c of ['SAFETY_TIPS', 'PLATFORM_ROLE', 'COMPATIBILITY_NOTICE', 'NOT_EMERGENCY_SERVICE', 'REPORT_BLOCK_LEAVE']) assert.match(safety, new RegExp(c), `Safety uses ${c}`);
  for (const c of ['COMPATIBILITY_NOTICE', 'SAFETY_TIPS', 'NOT_EMERGENCY_SERVICE']) assert.match(accept, new RegExp(c), `Acceptance screen uses ${c}`);
  for (const c of ['COMPATIBILITY_NOTICE', 'JOIN_SAFETY_REMINDER']) assert.match(join, new RegExp(c), `Join summary uses ${c}`);
  assert.match(read('apps/mobile/components/community/JoinRequestModal.tsx'), /JoinSummary[\s\S]*showAnswers=\{false\}/);
  assert.match(read('apps/mobile/components/community/JoinRequestModal.tsx'), /router\.push\('\/terms'\)[\s\S]*Safety/);
});

test('Terms and Privacy match actual behaviour: public content visible to others, authenticated photos, blocking scope, joins and groups', () => {
  const terms = read(FILES.terms), privacy = read(FILES.privacy);
  assert.doesNotMatch(terms, /display it to you within the app/, 'content is shown to other users when public');
  assert.match(terms, /visible to other signed-in users/);
  assert.match(terms, /must accept them before you can post, send messages or ask to join/);
  assert.match(terms, /Nothing in these Terms limits any right you have under the law/);
  assert.match(privacy, /Cloudflare \(Workers and R2\)/);
  assert.match(privacy, /delivered only to signed-in users who are allowed to see/);
  assert.match(privacy, /join requests, follows and comments/);
  assert.match(privacy, /People who know your email address can find your name and start a direct chat or add you to a group chat/);
  assert.match(privacy, /record of the Terms version you accepted/);
  assert.match(privacy, /Join requests other travelers sent to trips you organized stay in their own request history/);
});

test('terms acceptance: explicit at sign-up, recorded, and required before the app (re)opens for an account without it', () => {
  const signup = read('apps/mobile/app/(auth)/signup.tsx'), auth = read('apps/mobile/hooks/useAuth.ts'), layout = read('apps/mobile/app/(app)/_layout.tsx');
  assert.match(signup, /accessibilityRole="checkbox"[\s\S]*I agree to the Terms of Service and the Privacy Policy/);
  assert.match(signup, /if \(!agreed\) e\.agree/);
  assert.match(auth, /acceptTerms\(firebaseUser\.uid, TERMS_VERSION\)/);
  assert.match(layout, /const termsMismatch = !!profile && profile\.termsAcceptedVersion !== TERMS_VERSION/);
  assert.match(layout, /if \(termsMismatch\) return termsCheckedFor === uid \? <Redirect href=\{"\/accept-terms" as never\} \/> : null;/);
  assert.match(layout, /getUserProfile\(uid\)[\s\S]*setProfile\(fresh\)/, 'the gate re-reads the profile from the server once before redirecting (a read taken before the acceptance was saved is stale)');
  assert.match(auth, /acceptTerms\(firebaseUser\.uid, TERMS_VERSION\)[\s\S]*getUserProfile\(firebaseUser\.uid\)[\s\S]*setProfile\(saved\)/, 'sign-up reloads the profile after saving the acceptance');
  const accept = read(FILES.accept);
  assert.match(accept, /acceptTerms\(user\.uid, TERMS_VERSION\)/);
  assert.match(accept, /I do not agree: sign out/);
  assert.match(read('apps/mobile/app/(app)/profile/index.tsx'), /label="Terms of Service"[\s\S]*router\.push\('\/terms'\)/);
  assert.match(read('firestore.rules'), /function validTerms\(\)[\s\S]*termsAcceptedAt == request\.time/);
});

// ── Safety actions ────────────────────────────────────────────────────────────
test('leave, follow, message and member actions exist where people need them', () => {
  const trip = read('apps/mobile/app/(app)/discover/trips/[tripId].tsx');
  assert.match(trip, /Leave trip/); assert.match(trip, /leavePublicTrip\(trip\.tripId, uid\)/); assert.match(trip, /Message organizer/);
  assert.match(trip, /!trip\.isAcceptingMembers \? \([\s\S]*Not accepting requests/);
  assert.doesNotMatch(trip, /trips\/\$\{tripId\}` as never\)\} fullWidth/, 'members are no longer sent to a private trip route that does not exist for them');
  assert.match(read('apps/mobile/app/(app)/profile/join-requests.tsx'), /discover\/trips\/\$\{item\.tripId\}/);
  assert.match(read('apps/mobile/app/(app)/groups/[groupId]/index.tsx'), /leaveChatGroup\(group\.id, uid, myName\)/);
  assert.match(read('apps/mobile/app/(app)/community/profile/[uid].tsx'), /<FollowButton[\s\S]*Message \$\{profile\.displayName\}/);
  assert.match(read('apps/mobile/app/(app)/community/my-requests.tsx'), /<RequesterAnswers requestorUid=/);
  assert.match(read('apps/mobile/components/community/JoinRequestCard.tsx'), /<RequesterAnswers requestorUid=/);
});

test('editing a public trip is an update (not a replace), and the join request limit is kept per account', () => {
  const fs = read('packages/firebase/src/firestore.ts');
  assert.match(fs, /const existing = await getDoc\(publicRef\);\s*if \(existing\.exists\(\)\) \{\s*batch\.update\(publicRef,/);
  const modal = read('apps/mobile/components/community/JoinRequestModal.tsx');
  assert.match(modal, /const limitKey = \(uid: string\) => `\$\{DAILY_LIMIT_KEY\}:\$\{uid\}`/);
  assert.doesNotMatch(modal, /AsyncStorage\.(get|set)Item\(DAILY_LIMIT_KEY/);
});

test('the blocked list shows names saved when blocking, not raw ids', () => {
  const list = read('apps/mobile/app/(app)/profile/blocked-users.tsx');
  assert.match(list, /getBlockedList\(myUid\)/);
  assert.match(list, /names\[uid\] \?\? `Traveler \(ref \$\{uid\.slice\(0, 6\)\}\)`/);
  assert.match(read('packages/firebase/src/firestore.ts'), /displayName: displayName\.trim\(\)\.slice\(0, 60\)/);
  assert.match(read('apps/mobile/hooks/useModerationActions.ts'), /blockUser\(authorId, authorName\)/);
  assert.match(read('apps/mobile/app/(app)/community/profile/[uid].tsx'), /blockUser\(uid, profile\?\.displayName\)/);
});

test('there is no notifications screen or bell: clients cannot create notifications, so nothing may promise them', () => {
  const rules = read('firestore.rules');
  const block = rules.slice(rules.indexOf('match /notifications/{notificationId}'), rules.indexOf('// ── User place reviews'));
  assert.ok(block.length > 50 && !/allow create/.test(block), 'clients cannot create notifications');
  assert.ok(!fs.existsSync(path.join(root, 'apps/mobile/app/(app)/notifications')), 'the empty screen is gone');
  assert.ok(!fs.existsSync(path.join(root, 'apps/mobile/hooks/useNotifications.ts')));
  for (const rel of ['apps/mobile/app/(app)/home/index.tsx', 'apps/mobile/app/(app)/profile/index.tsx', 'apps/mobile/app/(app)/_layout.tsx']) {
    const src = read(rel);
    assert.doesNotMatch(src, /\/\(app\)\/notifications/, `${rel} no longer links to the screen`);
    assert.doesNotMatch(src, /useNotifications/);
    assert.doesNotMatch(src, /notifications-outline/);
  }
  assert.doesNotMatch(read('apps/mobile/hooks/useFollows.ts') + read('apps/mobile/hooks/useComments.ts'), /createSocialNotification/, 'no writes the rules always refuse');
});

test('group chats: people are invited by e-mail address and join by accepting; the app never looks accounts up for this', () => {
  const create = read('apps/mobile/app/(app)/groups/new.tsx');
  assert.doesNotMatch(create, /searchUserByEmail/, 'no account lookup');
  assert.match(create, /inviteToGroup\(/);
  assert.match(create, /will not be told whether an address has an account/);
  const chat = read('packages/firebase/src/chat.ts');
  assert.match(chat, /members: \[createdBy\]/, 'a new group holds only its creator');
  assert.doesNotMatch(chat, /pendingMembers/, 'no direct adds of other people');
  assert.match(chat, /export async function acceptGroupInvite[\s\S]*batch\.update\(inviteRef, \{ status: 'accepted'/);
  const list = read('apps/mobile/app/(app)/chats/index.tsx');
  assert.match(list, /Group invitations/); assert.match(list, /<GroupInviteCard/);
  const card = read('apps/mobile/components/chat/GroupInviteCard.tsx');
  assert.match(card, /Accept/); assert.match(card, /Decline/); assert.match(card, /You are not in it unless you accept/);
  const rules = read('firestore.rules');
  assert.match(rules, /match \/groupInvites\/\{inviteId\}/);
  assert.match(rules, /request\.resource\.data\.members == \[request\.auth\.uid\]/);
  assert.match(read('apps/mobile/app/(app)/groups/[groupId]/index.tsx'), /function InvitePanel[\s\S]*Withdraw/);
});

test('invitations honour only a verified e-mail: rules, deletion cleanup and the verification screen', () => {
  const rules = read('firestore.rules');
  assert.match(rules, /function verifiedEmail\(\) \{\s*return request\.auth != null && request\.auth\.token\.email_verified == true;/);
  const inv = rules.slice(rules.indexOf('match /groupInvites/{inviteId}'), rules.indexOf('match /groups/{groupId}'));
  for (const m of inv.matchAll(/token\.email\.lower\(\)/g)) {
    const before = inv.slice(Math.max(0, m.index - 140), m.index);
    if (/inviteeEmail != request\.auth/.test(before) || /size\(\) <= 254/.test(before)) continue; // the self-invite check, not an ownership claim
    assert.match(before, /verifiedEmail\(\)/, `an e-mail ownership check without verifiedEmail(): ...${before.slice(-80)}`);
  }
  assert.match(rules, /function joiningByInvite\(\) \{[\s\S]*verifiedEmail\(\)[\s\S]*!deleting\(resource\.data\.createdBy\) && !suspended\(resource\.data\.createdBy\)/);
  const worker = read('workers/r2-upload-worker/src/accountDeletion.ts');
  const step = worker.slice(worker.indexOf('const removeGroupInvites'), worker.indexOf('// Groups another user is still creating'));
  assert.match(step, /verifiedEmail/); assert.doesNotMatch(step, /profile|userLookup|ctx\.email|users\//, 'no client-writable e-mail is used to find invitations');
  assert.match(read('workers/r2-upload-worker/src/accountRoute.ts'), /verifiedEmail: identity\.emailVerified \? identity\.email : null/);
  const chats = read('apps/mobile/app/(app)/chats/index.tsx'), hook = read('apps/mobile/hooks/useEmailVerification.ts');
  assert.match(chats, /verification\.verified === false &&[\s\S]*<VerifyEmailBanner/);
  assert.match(read('apps/mobile/hooks/useGroupInvites.ts'), /verified !== true\) return;/);
  assert.match(hook, /refreshEmailVerification\(\)/); assert.match(read('packages/firebase/src/auth.ts'), /user\.reload\(\);\s*const result = await user\.getIdTokenResult\(true\);\s*return result\.claims\.email_verified === true/);
  assert.doesNotMatch(read('apps/mobile/components/chat/VerifyEmailBanner.tsx') + hook, /was delivered|has been sent to your inbox/i, 'a successful request is never described as delivery');
});

test('the verification banner buttons wrap by themselves (a live text-size change leaves the measured scale stale)', () => {
  const banner = read('apps/mobile/components/chat/VerifyEmailBanner.tsx');
  assert.match(banner, /row: \{ flexDirection: 'row', flexWrap: 'wrap'/);
  assert.match(banner, /btn: \{ flexGrow: 1, minWidth: 150/);
  assert.doesNotMatch(banner, /flexBasis/, 'a flex basis becomes a HEIGHT when the buttons stack in a column (giant buttons seen on the phone)');
});

test('moderators can hide, remove and restore public trips and community groups, and lift suspensions, from the moderation screen', () => {
  const screen = read('apps/mobile/app/(app)/moderation/index.tsx');
  for (const word of ['setItemModeration', 'Hide', 'Remove', 'Restore', 'subscribeModeratedItems', 'Lift suspension', 'unsuspendUser', 'subscribeSuspensions']) assert.ok(screen.includes(word), word);
  const fsrc = read('packages/firebase/src/firestore.ts');
  assert.match(fsrc, /publicTripFromDoc\(d\.id, d\.data\(\)\)\)\.filter\(isListed\)/);
  assert.match(fsrc, /travelGroupFromDoc\(d\.id, d\.data\(\)\)\)\.filter\(isListed\)/);
  assert.match(fsrc, /isListed\(moderationOf\(x\.data\(\)\)\)/, 'the photo cascade skips frozen items');
  assert.match(read('apps/mobile/app/(app)/community/groups/[groupId].tsx'), /leaveGroup\(group\.groupId, uid\)/);
});

test('saving a post works from the feed card and the post screen (the bookmark used to just open the post)', () => {
  const card = read('apps/mobile/components/posts/PostCard.tsx'), detail = read('apps/mobile/app/(app)/post/[postId].tsx'), button = read('apps/mobile/components/posts/SaveButton.tsx');
  assert.match(card, /<SaveButton postId=\{post\.postId\} \/>/);
  assert.doesNotMatch(card, /bookmark-outline/, 'no dead bookmark that only opens the post');
  assert.match(detail, /<SaveButton postId=\{post\.postId\}/);
  assert.match(button, /useSavePost\(postId\)/); assert.match(button, /Remove from saved posts/); assert.match(button, /'Save post'/);
});

test('follow and unfollow update the feed at once (one shared store, no restart)', () => {
  const store = read('apps/mobile/stores/followStore.ts'), follows = read('apps/mobile/hooks/useFollows.ts'), feed = read('apps/mobile/hooks/useFeed.ts');
  assert.match(follows, /useFollowStore\.getState\(\)\.remove\(myUid, targetUid\)/);
  assert.match(follows, /useFollowStore\.getState\(\)\.add\(myUid, targetUid\)/);
  assert.match(feed, /useFollowingIds/);
  assert.match(store, /add: /); assert.match(store, /remove: /);
  assert.match(read('apps/mobile/app/_layout.tsx'), /useFollowStore\.getState\(\)\.reset\(\)/);
});

test('requests to trips that no longer exist or are hidden say so and offer no dead View Trip', () => {
  const card = read('apps/mobile/components/community/JoinRequestCard.tsx');
  assert.match(card, /This trip is no longer available/);
  assert.match(card, /request\.status === 'approved' && onViewTrip && !note/);
  assert.match(read('apps/mobile/app/(app)/profile/join-requests.tsx'), /useTripAvailability/);
});

test('failed sends keep the text; refused queued sends come back to the composer; deleted accounts cannot be messaged; empty chats are not listed', () => {
  assert.match(read('apps/mobile/components/chat/ChatInput.tsx'), /mergeDraft\(current, restore\.text\)/);
  for (const hook of ['useMessages', 'useGroupChat']) assert.match(read(`apps/mobile/hooks/${hook}.ts`), /setRestored\(nextRestore\(text\.trim\(\)\)\)/);
  assert.match(read('apps/mobile/components/posts/CommentsSheet.tsx'), /Comment not sent/);
  const dm = read('apps/mobile/app/(app)/chats/[chatId].tsx');
  assert.match(dm, /This account was deleted\. You can read this conversation but cannot send messages to it\./);
  assert.match(dm, /otherDeleted/);
  assert.match(read('apps/mobile/app/(app)/chats/index.tsx'), /c\.lastMessage !== null/);
  assert.match(read('workers/r2-upload-worker/src/accountDeletion.ts'), new RegExp(`DELETED_NAME = '${shared.DELETED_ACCOUNT_NAME}'`), 'the app and the deletion service use the same label');
});

test('important errors are visible inside every modal screen (the app-level toast layer sits behind modal windows)', () => {
  for (const rel of ['apps/mobile/components/posts/CommentsSheet.tsx', 'apps/mobile/components/trips/AddToTripSheet.tsx', 'apps/mobile/components/journal/JournalEntryModal.tsx',
    'apps/mobile/components/community/ReportModal.tsx', 'apps/mobile/components/community/GroupJoinModal.tsx', 'apps/mobile/components/community/JoinRequestModal.tsx',
    'apps/mobile/components/trips/ExportPreviewModal.tsx', 'apps/mobile/app/(app)/trips/[id]/itinerary/[dayId].tsx', 'apps/mobile/app/(app)/saved-places/index.tsx', 'apps/mobile/app/(app)/profile/index.tsx']) {
    const src = read(rel);
    assert.match(src, /<ToastContainer \/>\s*<\/Modal>/, `${rel} renders toasts inside its modal`);
  }
});

test('the discovery opt-in is reconciled after a suspension ends, never republished silently', () => {
  const hook = read('apps/mobile/hooks/useDiscoveryReconcile.ts');
  assert.match(hook, /reconcileDiscoveryConsent\(uid, profile\)/);
  assert.match(read('apps/mobile/app/(app)/_layout.tsx'), /useDiscoveryReconcile\(\)/);
  const fsrc = read('packages/firebase/src/firestore.ts');
  assert.match(fsrc, /getDocFromServer\(doc\(db, 'nearbyTravelers', uid\)\)/);
  assert.match(fsrc, /showInNearbyTravelers: false, updatedAt/);
});

test('account deletion errors are shown inside the delete screen (a modal hides the toast layer)', () => {
  const auth = read('apps/mobile/hooks/useAuth.ts'), profile = read('apps/mobile/app/(app)/profile/index.tsx');
  assert.match(auth, /onError\?: \(message: string\) => void/);
  assert.match(auth, /onError\?\.\(message\)/);
  assert.match(profile, /setDeleteError,\s*\);/);
  assert.ok(profile.indexOf('{deleteError ? (') < profile.indexOf('style={[styles.deleteConfirmBtn,'), 'the error sits above the button, out of the keyboard\'s way');
  assert.match(profile, /\{deleteError \? \(\s*<Text style=\{styles\.deleteErrorText\} accessibilityLiveRegion="polite" accessibilityRole="alert">/);
});

test('layout and accessibility fixes: comments sheet clears the system bar; every switch has a name; logo is not clipped', () => {
  // The modal window is edge to edge; a hook value from the activity is 0 there, so the native SafeAreaView must wrap the input row.
  assert.match(read('apps/mobile/components/posts/CommentsSheet.tsx'), /<SafeAreaView edges=\{\['bottom'\]\}>\s*<View style=\{styles\.inputRow\}>/);
  for (const rel of ['apps/mobile/app/(app)/profile/privacy.tsx', 'apps/mobile/app/(app)/trips/[id]/edit.tsx', 'apps/mobile/app/(app)/discover/trips/index.tsx', 'apps/mobile/app/(app)/community/groups/index.tsx', 'apps/mobile/components/trips/TripRemindersCard.tsx', 'apps/mobile/components/trips/ExportPreviewModal.tsx']) {
    const src = read(rel);
    for (const m of src.matchAll(/<Switch\b[^>]*?(?:\/>|>)/gs)) assert.match(src.slice(m.index, m.index + 400), /accessibilityLabel=/, `${rel} switch at ${m.index}`);
  }
  // The sign-in heading lives in the shared auth frame; its line height must exceed the font size so the display face is not clipped.
  assert.match(read('apps/mobile/components/auth/AuthShell.tsx'), /title: \{ fontSize: 32, lineHeight: 40 \}/);
  assert.match(read('apps/mobile/hooks/useMessages.ts'), /your account or the conversation is restricted/);
});

(async () => {
  let passed = 0;
  for (const t of tests) {
    try { await t.fn(); passed++; console.log(`PASS ${t.name}`); } catch (e) { console.error(`FAIL ${t.name}\n`, e); process.exitCode = 1; }
  }
  console.log(`${passed}/${tests.length} safety checks passed`);
})();
