const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const assert = require('node:assert/strict');
const { initializeTestEnvironment, assertFails } = require('@firebase/rules-unit-testing');
const sdk = require('firebase/firestore');
const root = path.resolve(__dirname, '../..');
let sharedModule;
function loadShared() {
  if (!sharedModule) {
    sharedModule = { exports: {} };
    for (const f of ['moderation', 'preferences']) {
      const m = { exports: {} };
      const code = ts.transpileModule(fs.readFileSync(path.join(root, `packages/shared/src/${f}.ts`), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
      new Function('module', 'exports', 'require', code)(m, m.exports, require);
      Object.assign(sharedModule.exports, m.exports);
    }
  }
  return sharedModule.exports;
}
function client(file, db) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const dependencies = name => {
    if (name === 'firebase/firestore') return { ...sdk, initializeFirestore:()=>db, getFirestore:()=>db };
    if (name === './config') return { app:{} };
    if (name === '@solotravelsoul/shared') return { DEFAULT_USER_PROFILE:{}, ...loadShared() };
    if (name === './firestore') return { db };
    if (name === './auth') return { auth: { currentUser: { uid: 'actor' } } };
    throw Error(`Unexpected dependency: ${name}`);
  };
  new Function('module', 'exports', 'require', code)(module, module.exports, dependencies);
  return module.exports;
}
(async () => {
  const env = await initializeTestEnvironment({ projectId: 'demo-sts-release-review',
    firestore: { host: '127.0.0.1', port: 8188, rules: fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8') },
    storage: { host: '127.0.0.1', port: 9188, rules: fs.readFileSync(path.join(root, 'storage.rules'), 'utf8') } });
  let checks = 0;
  const check = async (name, work) => { await work(); checks++; console.log(`PASS ${name}`); };
  try {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async ctx => {
      const db = ctx.firestore();
      for (const [p, data] of Object.entries({
        'travelPosts/p': { authorId: 'owner', likeCount: 0, commentCount: 0, saveCount: 0, visibility: 'public', isArchived: false, createdAt: sdk.Timestamp.now() },
        'travelPosts/private': { authorId: 'owner', likeCount: 0, commentCount: 0, saveCount: 0, visibility: 'private', isArchived: false, createdAt: sdk.Timestamp.now() },
        'travelJournals/j': { authorId: 'owner', likeCount: 0, visibility: 'public', isArchived: false },
        'travelJournals/private': { authorId: 'owner', likeCount: 0, visibility: 'private' },
        'publicProfiles/owner': { uid: 'owner', profileVisibility: 'public', followersCount: 0, followingCount: 0 },
        'userLookup/victim': { uid: 'victim', email: 'victim@example.test' },
        'direct_chats/chat': { participants: ['actor', 'owner'], unreadCounts: { actor: 0, owner: 0 } },
      })) await sdk.setDoc(sdk.doc(db, p), data);
    });
    const db = env.authenticatedContext('actor', { email: 'actor@example.test' }).firestore();
    const posts = client('packages/firebase/src/posts.ts', db);
    const chat = client('packages/firebase/src/chat.ts', db);
    const get = async p => (await sdk.getDoc(sdk.doc(db, p))).data();
    await check('post like/unlike are atomic and retry safe', async () => {
      await posts.likePost('p', 'actor'); await posts.likePost('p', 'actor'); assert.equal((await get('travelPosts/p')).likeCount, 1);
      await posts.unlikePost('p', 'actor'); await posts.unlikePost('p', 'actor'); assert.equal((await get('travelPosts/p')).likeCount, 0);
    });
    await check('journal like/unlike work', async () => { await posts.likeJournal('j', 'actor'); await posts.unlikeJournal('j', 'actor'); assert.equal((await get('travelJournals/j')).likeCount, 0); });
    await check('comments/replies/edit/delete update both counters', async () => {
      const base = { authorId: 'actor', postId: 'p', parentCommentId: null, text: 'Hello' };
      const id = await posts.addComment(base);
      const reply = await posts.addComment({ ...base, parentCommentId: id });
      assert.equal((await get('travelPosts/p')).commentCount, 2); assert.equal((await get(`postComments/${id}`)).replyCount, 1);
      await posts.editComment(reply, 'Edited'); await posts.deleteComment(reply, 'p', id); await posts.deleteComment(reply, 'p', id);
      await posts.deleteComment(id, 'p', null); assert.equal((await get('travelPosts/p')).commentCount, 0);
    });
    await check('save/unsave are retry safe', async () => { await posts.savePost('p', 'actor'); await posts.savePost('p', 'actor'); assert.equal((await get('travelPosts/p')).saveCount, 1); await posts.unsavePost('p', 'actor'); await posts.unsavePost('p', 'actor'); assert.equal((await get('travelPosts/p')).saveCount, 0); });
    await check('private users can follow, retries keep counters correct', async () => { await posts.followUser('actor', 'owner'); await posts.followUser('actor', 'owner'); assert.equal((await get('publicProfiles/owner')).followersCount, 1); await posts.unfollowUser('actor', 'owner'); await posts.unfollowUser('actor', 'owner'); assert.equal((await get('publicProfiles/owner')).followersCount, 0); });
    await check('profile edits and visibility preserve relationship counters', async () => {
      await posts.followUser('actor','owner');
      await sdk.setDoc(sdk.doc(db,'users/actor'), { email:'actor@example.test' });
      const profiles=client('packages/firebase/src/firestore.ts',db);
      await profiles.upsertPublicProfile('actor',{name:'Actor',profileVisibility:'public'});
      assert.equal((await get('publicProfiles/actor')).followingCount,1);
      await profiles.updateProfileVisibility('actor',{name:'Actor'},'private');
      assert.equal((await get('publicProfiles/actor')).followingCount,1);
      const outsider=env.authenticatedContext('outsider').firestore();
      await assertFails(sdk.getDoc(sdk.doc(outsider,'publicProfiles/actor')));
      await posts.unfollowUser('actor','owner');
    });
    await check('DM transaction retries do not increment unread twice', async () => { await chat.sendDirectMessage('chat', 'actor', 'Hello', 'message', ['owner']); await chat.sendDirectMessage('chat', 'actor', 'Hello', 'message', ['owner']); assert.equal((await get('direct_chats/chat')).unreadCounts.owner, 1); });
    for (const [name, action] of [
      ['unbacked counter +1', () => sdk.updateDoc(sdk.doc(db, 'travelPosts/p'), { likeCount: sdk.increment(1) })],
      ['counter +2', () => sdk.updateDoc(sdk.doc(db, 'travelPosts/p'), { likeCount: sdk.increment(2) })],
      ['negative counter', () => sdk.updateDoc(sdk.doc(db, 'travelPosts/p'), { likeCount: -1 })],
      ['forged like', () => sdk.setDoc(sdk.doc(db, 'postLikes/p___victim'), { userId: 'victim', postId: 'p' })],
      ['forged follow', () => sdk.setDoc(sdk.doc(db, 'follows/victim___owner'), { followerId: 'victim', followingId: 'owner' })],
      ['private post read', () => sdk.getDoc(sdk.doc(db, 'travelPosts/private'))],
      ['private journal read', () => sdk.getDoc(sdk.doc(db, 'travelJournals/private'))],
      ['bulk directory lookup', () => sdk.getDocs(sdk.collection(db, 'userLookup'))],
      ['bulk exact-address directory lookup', () => sdk.getDocs(sdk.collection(db, 'userLookupByEmail'))],
      ['client read of own deletion job', () => sdk.getDoc(sdk.doc(db, 'accountDeletions/actor'))],
      ['client write of own deletion job', () => sdk.setDoc(sdk.doc(db, 'accountDeletions/actor'), { status: 'completed' })],
    ]) await check(`reject ${name}`, () => assertFails(action()));
    await check('visitor author query returns only public posts', async () => { const result = await sdk.getDocs(sdk.query(sdk.collection(db, 'travelPosts'), sdk.where('authorId', '==', 'owner'), sdk.where('visibility', '==', 'public'), sdk.where('isArchived', '==', false))); assert.equal(result.size, 1); });
    await check('exact email lookup can register and resolve', async () => { await chat.upsertUserLookup('actor', 'Actor', 'actor@example.test', 'A'); assert.equal((await chat.searchUserByEmail(' ACTOR@example.test ')).uid, 'actor'); });
    await check('own unread reset is permitted', async () => { await chat.markDirectChatRead('chat', 'actor'); });
    await check('cannot reset another participant unread count', () => assertFails(chat.markDirectChatRead('chat', 'owner')));
    await check('cannot spoof a chat preview', () => assertFails(sdk.updateDoc(sdk.doc(db, 'direct_chats/chat'), { lastMessage: { text: 'forged', senderId: 'owner', messageId: 'message', sentAt: sdk.serverTimestamp() }, updatedAt: sdk.serverTimestamp() })));
    await check('latest messages include newest rather than oldest sixty', async () => {
      await env.withSecurityRulesDisabled(async ctx => {
        const batch = sdk.writeBatch(ctx.firestore());
        for (let i=0;i<65;i++) batch.set(sdk.doc(ctx.firestore(), `direct_chats/chat/messages/old-${i}`), { senderId:'owner', text:String(i), clientId:`old-${i}`, sentAt:sdk.Timestamp.fromMillis(i+1) });
        await batch.commit();
      });
      await new Promise((resolve, reject) => {
        const timer=setTimeout(()=>reject(Error('message listener timed out')),5000);
        let unsubscribe;
        unsubscribe=chat.subscribeToDirectMessages('chat', messages=>{
          try { assert.equal(messages.length,60); assert.equal(messages[messages.length-1].clientId,'message'); assert.ok(!messages.some(m=>m.clientId==='old-0')); clearTimeout(timer); unsubscribe(); resolve(); } catch(e) { clearTimeout(timer); unsubscribe(); reject(e); }
        });
      });
    });
    // Inbound relationships to an account being deleted are refused; the same
    // writes against an unaffected twin account succeed (unrelated users' writes).
    await env.withSecurityRulesDisabled(async ctx => {
      const adb = ctx.firestore();
      for (const a of ['leaving', 'staying']) {
        for (const [p, data] of Object.entries({
          [`travelPosts/${a}Post`]: { authorId: a, likeCount: 0, commentCount: 0, saveCount: 0, visibility: 'public', isArchived: false, createdAt: sdk.Timestamp.now() },
          [`travelJournals/${a}Journal`]: { authorId: a, likeCount: 0, visibility: 'public', isArchived: false },
          [`publicProfiles/${a}`]: { uid: a, profileVisibility: 'public', followersCount: 0, followingCount: 0 },
          [`postComments/${a}Comment`]: { authorId: a, postId: 'p', parentCommentId: null, text: 'x', isDeleted: false, replyCount: 0 },
        })) await sdk.setDoc(sdk.doc(adb, p), data);
      }
      await sdk.setDoc(sdk.doc(adb, 'publicTrips/actorTrip'), { ownerUid: 'actor', memberCount: 1 });
      await sdk.setDoc(sdk.doc(adb, 'travelGroups/actorGroup'), { ownerUid: 'actor', memberCount: 1, visibility: 'public' });
      await sdk.setDoc(sdk.doc(adb, 'accountDeletions/leaving'), { uid: 'leaving', status: 'in_progress' });
    });
    const inbound = (a) => [
      ['like post', () => posts.likePost(`${a}Post`, 'actor')],
      ['save post', () => posts.savePost(`${a}Post`, 'actor')],
      ['like journal', () => posts.likeJournal(`${a}Journal`, 'actor')],
      ['follow', () => posts.followUser('actor', a)],
      ['comment on post', () => posts.addComment({ authorId: 'actor', postId: `${a}Post`, parentCommentId: null, text: 'hi' })],
      ['reply to comment', () => posts.addComment({ authorId: 'actor', postId: 'p', parentCommentId: `${a}Comment`, text: 're' })],
      ['add as trip member', () => sdk.setDoc(sdk.doc(db, `trips/actorTrip/members/${a}`), { uid: a, role: 'member' })],
      ['add as group member', () => sdk.setDoc(sdk.doc(db, `travelGroups/actorGroup/members/${a}`), { uid: a, role: 'member' })],
      ['trip join request', () => sdk.setDoc(sdk.doc(db, `tripJoinRequests/req-${a}`), { requestorUid: 'actor', ownerUid: a, tripId: `${a}Trip`, status: 'pending' })],
      ['group join request', () => sdk.setDoc(sdk.doc(db, `groupJoinRequests/req-${a}`), { requestorUid: 'actor', ownerUid: a, groupId: `${a}Group`, status: 'pending' })],
    ];
    for (const [name, action] of inbound('leaving')) await check(`reject inbound ${name} to deleting account`, () => assertFails(action()));
    for (const [name, action] of inbound('staying')) await check(`allow inbound ${name} to unaffected account`, () => action());
    assert.equal((await get('travelPosts/leavingPost')).likeCount, 0);
    assert.equal((await get('publicProfiles/leaving')).followersCount, 0);
    assert.equal((await get('travelPosts/stayingPost')).likeCount, 1);

    // Chats: no new group membership, direct chat or direct message may reach an
    // account with a deletion barrier — in progress ('leaving') or completed ('gone').
    await env.withSecurityRulesDisabled(async ctx => {
      const adb = ctx.firestore();
      await sdk.setDoc(sdk.doc(adb, 'accountDeletions/gone'), { uid: 'gone', status: 'completed' });
      for (const target of ['leaving', 'gone', 'staying']) {
        await sdk.setDoc(sdk.doc(adb, `groups/existing-${target}`), { createdBy: 'actor', members: ['actor', 'friend'], memberInfo: {}, unreadCounts: { actor: 0, friend: 0 }, lastMessage: null });
        const chatId = chat.directChatId('actor', target);
        await sdk.setDoc(sdk.doc(adb, `direct_chats/${chatId}`), { participants: ['actor', target].sort(), participantInfo: {}, lastMessage: null, unreadCounts: { actor: 0, [target]: 0 } });
        await sdk.setDoc(sdk.doc(adb, `direct_chats/${chatId}/messages/history`), { senderId: target, text: 'old', clientId: 'history', sentAt: sdk.Timestamp.now() });
      }
    });
    const info = { name: 'X', initials: 'X' };
    const chatActions = (target, tag) => [
      ['create group containing it', () => chat.createGroup('actor', 'Trip', ['actor', 'friend', target], {})],
      ['add it to an existing group', () => sdk.updateDoc(sdk.doc(db, `groups/existing-${target}`), { members: sdk.arrayUnion(target) })],
      ['replace group members to include it', () => sdk.updateDoc(sdk.doc(db, `groups/existing-${target}`), { members: ['actor', 'friend', 'other', target] })],
      ['create direct chat with it', async () => {
        await env.withSecurityRulesDisabled(ctx => sdk.deleteDoc(sdk.doc(ctx.firestore(), `direct_chats/${chat.directChatId('actor', target)}`)));
        try { await chat.getOrCreateDirectChat('actor', info, target, info); }
        finally {
          await env.withSecurityRulesDisabled(ctx => sdk.setDoc(sdk.doc(ctx.firestore(), `direct_chats/${chat.directChatId('actor', target)}`),
            { participants: ['actor', target].sort(), participantInfo: {}, lastMessage: null, unreadCounts: { actor: 0, [target]: 0 } }));
        }
      }],
      ['send a direct message to it', () => chat.sendDirectMessage(chat.directChatId('actor', target), 'actor', 'hello', `msg-${tag}`, [target])],
    ];
    for (const target of ['leaving', 'gone']) {
      for (const [name, action] of chatActions(target, target)) await check(`reject chat: ${name} (${target})`, () => assertFails(action()));
      // Existing history stays readable and can be marked read.
      await check(`keep chat history with ${target}`, async () => {
        const msgs = await sdk.getDocs(sdk.collection(db, `direct_chats/${chat.directChatId('actor', target)}/messages`));
        assert.equal(msgs.size, 1);
        await chat.markDirectChatRead(chat.directChatId('actor', target), 'actor');
      });
    }
    for (const [name, action] of chatActions('staying', 'staying')) await check(`allow chat: ${name} (unaffected)`, () => action());
    assert.ok((await get(`groups/existing-staying`)).members.includes('staying'));
    for (const target of ['leaving', 'gone', 'staying']) {
      await check(`large group listing ${target} late: refused member dropped, everyone else kept`, async () => {
        const id = await chat.createGroup('actor', `Big-${target}`, ['actor', ...Array.from({ length: 12 }, (_, i) => `member${i}`), target],
          { [target]: { name: target, initials: 'T' }, member0: { name: 'm0', initials: 'M' } });
        let g;
        await env.withSecurityRulesDisabled(async ctx => { g = (await sdk.getDoc(sdk.doc(ctx.firestore(), `groups/${id}`))).data(); });
        const expectMember = target === 'staying';
        assert.equal(g.members.length, expectMember ? 14 : 13);
        assert.equal(g.members.includes(target), expectMember);
        assert.equal(g.memberInfo[target] !== undefined, expectMember);
        assert.equal(g.unreadCounts[target] !== undefined, expectMember);
        assert.deepEqual(g.pendingMembers, []);
      });
    }
    // Group creation interrupted between chunks or before rollback: the group is
    // hidden from every member's list until the creator's client resumes it.
    // Resolves with the first group list that satisfies `ready` (snapshots may come from cache first).
    const groupsWhen = (mod, uid, ready) => new Promise((resolve, reject) => {
      let unsub;
      const timer = setTimeout(() => { unsub && unsub(); reject(new Error('group list never reached the expected state')); }, 8000);
      unsub = mod.subscribeToGroups(uid, (groups) => {
        if (!ready(groups)) return;
        clearTimeout(timer); setTimeout(() => unsub && unsub(), 0); resolve(groups);
      });
    });
    const has = (id) => (groups) => groups.some((g) => g.id === id);
    // A complete group shared by actor and friend: a list containing it is server-confirmed.
    await sdk.setDoc(sdk.doc(db, 'groups/marker'), { name: 'Marker', createdBy: 'actor', members: ['actor', 'friend'], memberInfo: {}, unreadCounts: {}, lastMessage: null, updatedAt: sdk.Timestamp.now() });
    const firstGroups = (mod, uid) => groupsWhen(mod, uid, has('marker'));
    // withSecurityRulesDisabled resolves to undefined, so capture the read explicitly.
    const adminGet = async (p) => { let data; await env.withSecurityRulesDisabled(async (ctx) => { data = (await sdk.getDoc(sdk.doc(ctx.firestore(), p))).data(); }); return data; };
    const adminSet = (p, data) => env.withSecurityRulesDisabled((ctx) => sdk.setDoc(sdk.doc(ctx.firestore(), p), data));
    const friendChat = client('packages/firebase/src/chat.ts', env.authenticatedContext('friend').firestore());
    const waitFor = async (fn) => { for (let i = 0; i < 50; i++) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 100)); } return false; };
    const groupData = (pending) => ({ name: 'Paused', createdBy: 'actor', members: ['actor', 'friend', ...Array.from({ length: 6 }, (_, i) => `p${i}`)],
      pendingMembers: pending, memberInfo: {}, unreadCounts: {}, lastMessage: null, updatedAt: sdk.Timestamp.now() });
    await check('interrupted group creation is hidden, then resumed by the creator', async () => {
      // State left by an app killed after the first chunk (seeded directly: a single
      // client write may add at most 8 checked identities).
      await adminSet('groups/interrupted', groupData(['q1', 'q2', 'q3']));
      assert.ok(!(await firstGroups(friendChat, 'friend')).some((g) => g.id === 'interrupted'), 'hidden from members while pending');
      // The creator's client sees it (from the server: it was seeded there) and resumes;
      // its own list shows the group only once creation is complete.
      await groupsWhen(chat, 'actor', has('interrupted'));
      assert.ok(await waitFor(async () => !((await adminGet('groups/interrupted'))?.pendingMembers?.length)));
      assert.equal((await adminGet('groups/interrupted')).members.length, 11);
      await groupsWhen(friendChat, 'friend', has('interrupted')); // visible once complete
    });
    await check('interrupted creation with a refused pending member: member dropped on resume, group completes', async () => {
      // Pending entries listed before the account deletion started (rules refuse adding them now).
      await adminSet('groups/refused', { ...groupData(['q1', 'gone']), memberInfo: { gone: { name: 'Gone' }, q1: { name: 'Q' } }, unreadCounts: { gone: 0, q1: 0 } });
      assert.ok(!(await firstGroups(friendChat, 'friend')).some((g) => g.id === 'refused'), 'hidden while pending');
      await chat.completeGroupCreation('refused');
      const g = await adminGet('groups/refused');
      assert.ok(g.members.includes('q1') && !g.members.includes('gone'));
      assert.deepEqual([g.pendingMembers, g.memberInfo.gone, g.unreadCounts.gone, g.memberInfo.q1.name], [[], undefined, undefined, 'Q']);
      // Concurrent resumes (two app instances of the creator) converge to the same result.
      await adminSet('groups/refused2', { ...groupData(['gone', 'q2']), memberInfo: { gone: { name: 'Gone' } }, unreadCounts: { gone: 0 } });
      await Promise.all([chat.completeGroupCreation('refused2'), chat.completeGroupCreation('refused2')]);
      const g2 = await adminGet('groups/refused2');
      assert.deepEqual([g2.pendingMembers, g2.members.includes('q2'), g2.members.includes('gone'), g2.memberInfo.gone], [[], true, false, undefined]);
      await groupsWhen(friendChat, 'friend', has('refused2')); // visible once complete
    });
    // ── Moderation: content filter, report queue, auto-hide, moderator actions, suspension ──
    const shared = loadShared();
    await env.withSecurityRulesDisabled(async ctx => {
      const adb = ctx.firestore();
      for (const [p, data] of Object.entries({
        'moderators/mod': { grantedBy: 'owner-console' },
        'travelPosts/flagged': { authorId: 'owner', likeCount: 0, commentCount: 0, saveCount: 0, visibility: 'public', isArchived: false, createdAt: sdk.Timestamp.now(), caption: 'Sunset', images: ['https://cdn.test/post_photos/owner/a.jpg'] },
        'postComments/rude': { authorId: 'owner', authorName: 'Owner', postId: 'p', parentCommentId: null, text: 'mean words', isDeleted: false, replyCount: 0 },
        'publicProfiles/actor': { uid: 'actor', profileVisibility: 'public', followersCount: 0, followingCount: 0, bio: 'Hi' },
      })) await sdk.setDoc(sdk.doc(adb, p), data);
    });
    const ctxDb = (uid) => env.authenticatedContext(uid, { email: `${uid}@example.test` }).firestore();
    const modDb = ctxDb('mod');
    const ownerDb = ctxDb('owner');
    const BAD = 'what the fuck';
    const rawPost = (dbx, id, caption) => sdk.setDoc(sdk.doc(dbx, `travelPosts/${id}`), { authorId: 'actor', caption, body: '', location: '', country: '', likeCount: 0, commentCount: 0, saveCount: 0, visibility: 'public', isArchived: false, createdAt: sdk.serverTimestamp() });
    // Same writes as addComment, without the client-side pre-check.
    const rawComment = async (id, text) => {
      const batch = sdk.writeBatch(db);
      batch.set(sdk.doc(db, `postComments/${id}`), { authorId: 'actor', authorName: 'Actor', authorPhoto: null, postId: 'p', parentCommentId: null, text, replyCount: 0, isDeleted: false, createdAt: sdk.serverTimestamp(), updatedAt: sdk.serverTimestamp() });
      batch.update(sdk.doc(db, 'travelPosts/p'), { commentCount: sdk.increment(1), lastCommentId: id, updatedAt: sdk.serverTimestamp() });
      return batch.commit();
    };

    await check('filter list in rules matches the shared moderation module', async () => {
      const rulesText = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
      const literal = rulesText.match(/value\.matches\('([^']+)'\)/)[1].replace(/\\\\/g, '\\');
      assert.equal(literal, shared.BLOCKED_TERMS_RULES_PATTERN);
      assert.match(rulesText, new RegExp(`next >= ${shared.REPORT_HIDE_THRESHOLD} &&`));
    });
    await check('server-side filter rejects blocked terms in public text; clean text passes', async () => {
      await assertFails(rawPost(db, 'badPost', BAD));
      await rawPost(db, 'goodPost', 'Lovely sunset in Lisbon');
      await assertFails(rawComment('badComment', `this is ${BAD}`));
      await rawComment('goodComment', 'Great photo');
      await assertFails(sdk.updateDoc(sdk.doc(db, 'postComments/goodComment'), { text: BAD, updatedAt: sdk.serverTimestamp() }));
      await assertFails(sdk.updateDoc(sdk.doc(db, 'publicProfiles/actor'), { bio: `I love ${BAD}` }));
      await sdk.updateDoc(sdk.doc(db, 'publicProfiles/actor'), { bio: 'Solo hiker from Porto' });
      await assertFails(sdk.setDoc(sdk.doc(db, 'travelGroups/badGroup'), { ownerUid: 'actor', name: BAD, description: '', visibility: 'public' }));
      await assertFails(sdk.setDoc(sdk.doc(db, 'publicTrips/badTrip'), { ownerUid: 'actor', title: 'Trip', description: BAD }));
      // The client service refuses before writing, with a clear code.
      await assert.rejects(posts.addComment({ authorId: 'actor', postId: 'p', parentCommentId: null, text: BAD }), (e) => e.code === 'moderation/blocked-term');
    });
    await check('reports: one per reporter and target; only the reporter and moderators can read them', async () => {
      const r1 = client('packages/firebase/src/firestore.ts', ctxDb('r1'));
      await r1.reportContent('r1', 'post', 'flagged', 'inappropriate', 'not ok');
      await r1.reportContent('r1', 'post', 'flagged', 'inappropriate', 'again'); // idempotent
      assert.equal((await adminGet('travelPosts/flagged')).reportCount, 1);
      await sdk.getDoc(sdk.doc(ctxDb('r1'), 'reports/post___flagged___r1'));
      await assertFails(sdk.getDoc(sdk.doc(ctxDb('r2'), 'reports/post___flagged___r1')));
      await assertFails(sdk.getDocs(sdk.collection(db, 'reports')));
      assert.ok((await sdk.getDocs(sdk.query(sdk.collection(modDb, 'reports'), sdk.where('status', '==', 'pending')))).size >= 1);
      await assertFails(sdk.setDoc(sdk.doc(db, 'reports/random-id'), { reporterUid: 'actor', targetType: 'post', targetId: 'flagged', status: 'pending' }));
      await assertFails(sdk.updateDoc(sdk.doc(db, 'travelPosts/flagged'), { reportCount: 2 })); // no report behind it
    });
    await check('three distinct reports hide a post; only its author and moderators still see it', async () => {
      for (const u of ['r2', 'r3']) await client('packages/firebase/src/firestore.ts', ctxDb(u)).reportContent(u, 'post', 'flagged', 'harassment', '');
      const after = await adminGet('travelPosts/flagged');
      assert.deepEqual([after.reportCount, after.visibility], [3, 'under_review']);
      await assertFails(sdk.getDoc(sdk.doc(db, 'travelPosts/flagged')));
      const explore = await sdk.getDocs(sdk.query(sdk.collection(db, 'travelPosts'), sdk.where('visibility', '==', 'public'), sdk.where('isArchived', '==', false)));
      assert.ok(!explore.docs.some((d) => d.id === 'flagged'));
      await sdk.getDoc(sdk.doc(ownerDb, 'travelPosts/flagged'));
      await sdk.getDoc(sdk.doc(modDb, 'travelPosts/flagged'));
      await assertFails(sdk.updateDoc(sdk.doc(ownerDb, 'travelPosts/flagged'), { visibility: 'public', updatedAt: sdk.serverTimestamp() }));
      await assertFails(sdk.updateDoc(sdk.doc(ownerDb, 'travelPosts/flagged'), { caption: 'Sunset (edited)', updatedAt: sdk.serverTimestamp() })); // frozen while under review
    });
    await check('moderators restore or remove content; nobody else can', async () => {
      const mod = client('packages/firebase/src/moderation.ts', modDb);
      const asActor = client('packages/firebase/src/moderation.ts', db);
      await assertFails(asActor.setContentVisibility('post', 'flagged', 'actor', 'public'));
      await mod.setContentVisibility('post', 'flagged', 'mod', 'public');
      assert.deepEqual([(await adminGet('travelPosts/flagged')).visibility, (await adminGet('travelPosts/flagged')).reportCount], ['public', 0]);
      await mod.setContentVisibility('post', 'flagged', 'mod', 'removed');
      await assertFails(sdk.updateDoc(sdk.doc(ownerDb, 'travelPosts/flagged'), { visibility: 'public', updatedAt: sdk.serverTimestamp() }));
      await assertFails(asActor.removeComment('rude', 'actor'));
      await mod.removeComment('rude', 'mod');
      assert.deepEqual([(await adminGet('postComments/rude')).text, (await adminGet('postComments/rude')).moderationRemoved], ['', true]);
      await assertFails(sdk.updateDoc(sdk.doc(ownerDb, 'postComments/rude'), { text: 'back', updatedAt: sdk.serverTimestamp() }));
      await mod.reviewReport('post___flagged___r1', 'mod', 'actioned', 'Removed');
      await assertFails(sdk.updateDoc(sdk.doc(ctxDb('r2'), 'reports/post___flagged___r2'), { status: 'dismissed' }));
      await assertFails(sdk.updateDoc(sdk.doc(modDb, 'reports/post___flagged___r2'), { status: 'dismissed', reviewedBy: 'someone-else', reviewedAt: sdk.serverTimestamp() }));
    });
    await check('suspension blocks writes and uploads until lifted; only moderators suspend', async () => {
      const mod = client('packages/firebase/src/moderation.ts', modDb);
      await assertFails(client('packages/firebase/src/moderation.ts', db).suspendUser('owner', 'actor', 'nope'));
      await assertFails(mod.suspendUser('mod', 'mod', 'self'));
      await sdk.setDoc(sdk.doc(ownerDb, 'users/owner/trips/before'), { destination: 'x' });
      await mod.suspendUser('owner', 'mod', 'Repeated harassment');
      await assertFails(sdk.setDoc(sdk.doc(ownerDb, 'users/owner/trips/during'), { destination: 'x' }));
      await assertFails(env.authenticatedContext('owner').storage().ref('profile_photos/owner/new.jpg').put(new Uint8Array([1]), { contentType: 'image/jpeg' }));
      await sdk.setDoc(sdk.doc(db, 'users/actor/trips/unaffected'), { destination: 'y' }); // others unaffected
      await mod.unsuspendUser('owner');
      await sdk.setDoc(sdk.doc(ownerDb, 'users/owner/trips/after'), { destination: 'x' });
    });
    // Moderation survives delete/recreate; moderated content is frozen; restores wait for media removal.
    await env.withSecurityRulesDisabled(async ctx => {
      const adb = ctx.firestore();
      const base = { authorId: 'actor', likeCount: 0, commentCount: 0, saveCount: 0, isArchived: false, createdAt: sdk.Timestamp.now(), images: ['https://cdn.test/post_photos/actor/1.jpg'] };
      for (const [p, data] of Object.entries({
        'travelPosts/heldPost': { ...base, visibility: 'under_review', reportCount: 3 },
        'travelPosts/gonePost': { ...base, visibility: 'removed', reportCount: 3 },
        'travelJournals/heldJournal': { ...base, title: 'T', visibility: 'under_review', reportCount: 3 },
        'travelJournals/goneJournal': { ...base, title: 'T', visibility: 'removed', reportCount: 3 },
        'travelPosts/normalPost': { ...base, visibility: 'public', reportCount: 0 },
        'travelPosts/clearing': { ...base, visibility: 'removed', reportCount: 3, mediaRemoval: { state: 'in_progress', leaseUntilMs: Date.now() + 120000, token: 't' } },
        'travelPosts/cleared': { ...base, visibility: 'removed', reportCount: 3, mediaRemoval: { state: 'done', leaseUntilMs: 0, token: 't' } },
        'travelPosts/clearingExpired': { ...base, visibility: 'removed', reportCount: 3, mediaRemoval: { state: 'in_progress', leaseUntilMs: Date.now() - 60000, token: 't' } },
        'travelJournals/clearingExpiredJ': { ...base, title: 'T', visibility: 'removed', reportCount: 3, mediaRemoval: { state: 'in_progress', leaseUntilMs: Date.now() - 60000, token: 't' } },
      })) await sdk.setDoc(sdk.doc(adb, p), data);
    });
    for (const p of ['travelPosts/heldPost', 'travelPosts/gonePost', 'travelJournals/heldJournal', 'travelJournals/goneJournal']) {
      await check(`author cannot delete or recreate moderated ${p}`, async () => {
        await assertFails(sdk.deleteDoc(sdk.doc(db, p)));
        await assertFails(sdk.setDoc(sdk.doc(db, p), { authorId: 'actor', likeCount: 0, commentCount: 0, saveCount: 0, reportCount: 0, visibility: 'public', isArchived: false, title: 'T', caption: 'fresh' }));
        await assertFails(sdk.updateDoc(sdk.doc(db, p), { images: ['https://cdn.test/post_photos/actor/swap.jpg'], updatedAt: sdk.serverTimestamp() }));
        await sdk.updateDoc(sdk.doc(db, p), { isArchived: true, updatedAt: sdk.serverTimestamp() }); // archiving stays allowed
      });
    }
    await check('authors still delete their unmoderated posts', () => sdk.deleteDoc(sdk.doc(db, 'travelPosts/normalPost')));
    await check('moderators cannot restore while media removal holds its lease; can once it is done', async () => {
      const mod = client('packages/firebase/src/moderation.ts', modDb);
      await assertFails(mod.setContentVisibility('post', 'clearing', 'mod', 'public'));
      // An expired lease allows a worker takeover, never a restore.
      await assertFails(mod.setContentVisibility('post', 'clearingExpired', 'mod', 'public'));
      await assertFails(mod.setContentVisibility('journal', 'clearingExpiredJ', 'mod', 'public'));
      await mod.setContentVisibility('post', 'cleared', 'mod', 'public');
    });
    await env.withSecurityRulesDisabled(ctx => sdk.setDoc(sdk.doc(ctx.firestore(), 'blocks/owner/blocked/actor'), {}));
    await check('blocked sender cannot send', () => assertFails(chat.sendDirectMessage('chat', 'actor', 'Blocked', 'blocked', ['owner'])));

    // ── Deletion barrier vs. group identity (enables skipping completed deletion steps) ──
    // Once accountDeletions/{uid} exists, nobody may re-add that UID to a group's
    // members, pendingMembers, memberInfo or unreadCounts; normal group work continues.
    await env.withSecurityRulesDisabled(async ctx => {
      const adb = ctx.firestore();
      for (const [p, data] of Object.entries({
        'accountDeletions/gone': { uid: 'gone', status: 'in_progress' },
        'groups/bobGroup': { name: 'G', createdBy: 'bob', members: ['bob', 'carol'], pendingMembers: [], memberInfo: { bob: { name: 'Bob' }, carol: { name: 'Carol' } }, unreadCounts: { bob: 0, carol: 0 }, lastMessage: null },
        'groups/bobGroupLeft': { name: 'L', createdBy: 'bob', members: ['bob'], pendingMembers: [], memberInfo: { bob: { name: 'Bob' }, carol: { name: 'Carol (left)' } }, unreadCounts: { bob: 0 }, lastMessage: null },
      })) await sdk.setDoc(sdk.doc(adb, p), data);
    });
    const bobDb = env.authenticatedContext('bob').firestore();
    const carolDb = env.authenticatedContext('carol').firestore();
    const gdoc = (d, p) => sdk.doc(d, p);
    await check('group identity: a deleting UID cannot be added as member or pending member (create or update)', async () => {
      await assertFails(sdk.setDoc(gdoc(bobDb, 'groups/n1'), { name: 'n', createdBy: 'bob', members: ['bob', 'gone'], memberInfo: {}, unreadCounts: {} }));
      await assertFails(sdk.updateDoc(gdoc(bobDb, 'groups/bobGroup'), { members: sdk.arrayUnion('gone') }));
      await assertFails(sdk.setDoc(gdoc(bobDb, 'groups/n2'), { name: 'n', createdBy: 'bob', members: ['bob'], pendingMembers: ['gone'], memberInfo: { gone: { name: 'Gone' } }, unreadCounts: { gone: 0 } }));
      await assertFails(sdk.updateDoc(gdoc(bobDb, 'groups/bobGroup'), { pendingMembers: sdk.arrayUnion('gone') }));
    });
    await check('group identity: memberInfo / unreadCounts keys cannot be added for non-members (creator or member)', async () => {
      await assertFails(sdk.updateDoc(gdoc(bobDb, 'groups/bobGroup'), { 'memberInfo.gone': { name: 'Gone' } }));
      await assertFails(sdk.updateDoc(gdoc(carolDb, 'groups/bobGroup'), { 'unreadCounts.gone': 1, updatedAt: sdk.serverTimestamp() }));
      await assertFails(sdk.updateDoc(gdoc(carolDb, 'groups/bobGroup'), { 'unreadCounts.stranger': 1, updatedAt: sdk.serverTimestamp() }));
    });
    await check('group identity: normal group operations keep working', async () => {
      await sdk.updateDoc(gdoc(bobDb, 'groups/bobGroupLeft'), { name: 'renamed' }); // stale memberInfo of a former member is tolerated
      await sdk.updateDoc(gdoc(bobDb, 'groups/bobGroup'), { members: sdk.arrayUnion('dave'), 'memberInfo.dave': { name: 'Dave' }, 'unreadCounts.dave': 0 });
      await sdk.updateDoc(gdoc(carolDb, 'groups/bobGroup'), { 'unreadCounts.bob': 2, lastMessage: { senderId: 'carol', text: 'hi' }, updatedAt: sdk.serverTimestamp() });
      await sdk.setDoc(gdoc(bobDb, 'groups/n3'), { name: 'n', createdBy: 'bob', members: ['bob'], pendingMembers: ['erin'], memberInfo: { bob: { name: 'Bob' }, erin: { name: 'Erin' } }, unreadCounts: { bob: 0, erin: 0 } });
    });
    // ── Travel preferences and traveler discovery (compatibility onboarding) ──
    await env.withSecurityRulesDisabled(async ctx => {
      const adb = ctx.firestore();
      for (const [p, data] of Object.entries({
        'users/pia': { name: 'Pia', profileVisibility: 'public', showInNearbyTravelers: true, shareCompatibility: false },
        'users/quin': { name: 'Quin', profileVisibility: 'private', showInNearbyTravelers: false },
        'users/legacy': { name: 'Old', travelStyles: ['backpacker'], interests: ['surfing'] },
        'users/sus': { name: 'Sus', profileVisibility: 'public', showInNearbyTravelers: true },
        'accountSuspensions/sus': { suspendedBy: 'mod', reason: 'r', createdAt: sdk.Timestamp.now() },
        'users/gone': { name: 'Gone', profileVisibility: 'public', showInNearbyTravelers: true },
        'nearbyTravelers/sus': { uid: 'sus', displayName: 'Sus', currentCity: '', travelStyles: [], updatedAt: sdk.Timestamp.now() },
        'nearbyTravelers/gone': { uid: 'gone', displayName: 'Gone', currentCity: '', travelStyles: [], updatedAt: sdk.Timestamp.now() },
        'moderators/mod': { grantedBy: 'owner' },
      })) await sdk.setDoc(sdk.doc(adb, p), data);
    });
    const piaDb = env.authenticatedContext('pia').firestore();
    const quinDb = env.authenticatedContext('quin').firestore();
    const legacyDb = env.authenticatedContext('legacy').firestore();
    const pia = client('packages/firebase/src/firestore.ts', piaDb);
    const record = (extra = {}) => ({ uid: 'pia', displayName: 'Pia', photoURL: null, currentCity: 'Lisbon', travelStyles: ['solo'], interests: ['hiking'], languages: ['English'],
      travelPace: null, travelSchedule: null, groupSizePreference: null, destination: null, destinationKey: null, destinationStartDate: null, destinationEndDate: null,
      updatedAt: sdk.serverTimestamp(), ...extra });
    const nt = (d, id) => sdk.doc(d, `nearbyTravelers/${id}`);
    await check('preferences: valid answers save; invalid values, setup records and lists are refused by the rules', async () => {
      await sdk.updateDoc(sdk.doc(piaDb, 'users/pia'), { travelPace: 'relaxed', travelSchedule: 'planned', groupSizePreference: 'small', travelStyles: ['solo', 'eco'],
        interests: ['hiking'], languages: ['English'], preferenceSetup: { status: 'in_progress', step: 3, updatedAtMs: 1 } });
      await sdk.updateDoc(sdk.doc(piaDb, 'users/pia'), { travelPace: null }); // clearing an answer is allowed
      await assertFails(sdk.updateDoc(sdk.doc(piaDb, 'users/pia'), { travelPace: 'frantic' }));
      await assertFails(sdk.updateDoc(sdk.doc(piaDb, 'users/pia'), { groupSizePreference: 12 }));
      await assertFails(sdk.updateDoc(sdk.doc(piaDb, 'users/pia'), { shareCompatibility: 'yes' }));
      await assertFails(sdk.updateDoc(sdk.doc(piaDb, 'users/pia'), { preferenceSetup: { status: 'done', step: 1, updatedAtMs: 1 } }));
      await assertFails(sdk.updateDoc(sdk.doc(piaDb, 'users/pia'), { preferenceSetup: { status: 'in_progress', step: 9, updatedAtMs: 1 } }));
      await assertFails(sdk.updateDoc(sdk.doc(piaDb, 'users/pia'), { travelStyles: ['solo', 'party-animal'] }));
      await assertFails(sdk.updateDoc(sdk.doc(piaDb, 'users/pia'), { interests: ['hiking', 'religion'] }));
      await assertFails(sdk.updateDoc(sdk.doc(piaDb, 'users/pia'), { languages: Array.from({ length: 13 }, (_, i) => `L${i}`) }));
      await assertFails(sdk.updateDoc(sdk.doc(quinDb, 'users/pia'), { travelPace: 'active' })); // nobody else
    });
    await check('preferences: older profiles with legacy values keep saving other fields', async () => {
      await sdk.updateDoc(sdk.doc(legacyDb, 'users/legacy'), { bio: 'still works', travelPace: 'balanced' });
      await assertFails(sdk.updateDoc(sdk.doc(legacyDb, 'users/legacy'), { travelStyles: ['backpacker', 'solo'] }));
    });
    await check('discovery: a record needs a public profile and the discovery opt-in; only its owner writes it', async () => {
      await assertFails(sdk.setDoc(nt(quinDb, 'quin'), record({ uid: 'quin', displayName: 'Quin' }))); // private, not opted in
      await assertFails(sdk.setDoc(nt(quinDb, 'pia'), record()));
      await sdk.setDoc(nt(piaDb, 'pia'), record());
    });
    await check('discovery: pace, schedule and group size need the sharing consent; withdrawal removes them', async () => {
      await assertFails(sdk.setDoc(nt(piaDb, 'pia'), record({ travelPace: 'relaxed' })));
      await sdk.updateDoc(sdk.doc(piaDb, 'users/pia'), { shareCompatibility: true });
      await sdk.setDoc(nt(piaDb, 'pia'), record({ travelPace: 'relaxed', travelSchedule: 'planned', groupSizePreference: 'small' }));
      // Withdrawing consent alone would leave them exposed: refused. The app withdraws atomically.
      await assertFails(sdk.updateDoc(sdk.doc(piaDb, 'users/pia'), { shareCompatibility: false }));
      const me = { id: 'pia', name: 'Pia', city: 'Lisbon', profileVisibility: 'public', showInNearbyTravelers: true, travelStyles: ['solo'], travelPace: 'active', shareCompatibility: true };
      await pia.setDiscoverySettings('pia', me, { shareCompatibility: false }, null);
      await assertFails(sdk.setDoc(nt(piaDb, 'pia'), record({ travelPace: 'relaxed' })));
      const stored = (await sdk.getDoc(nt(piaDb, 'pia'))).data();
      assert.equal((await sdk.getDoc(sdk.doc(piaDb, 'users/pia'))).data().shareCompatibility, false);
      assert.equal(stored.travelPace, null);
      assert.equal(stored.groupSizePreference, null);
    });
    await check('discovery: only listed fields; a shared trip is destination + dates as a complete, ordered set', async () => {
      await assertFails(sdk.setDoc(nt(piaDb, 'pia'), record({ email: 'pia@example.test' })));
      await assertFails(sdk.setDoc(nt(piaDb, 'pia'), record({ itinerary: ['day 1'] })));
      await assertFails(sdk.setDoc(nt(piaDb, 'pia'), record({ destination: 'Lisbon', destinationKey: 'lisbon' })));
      await assertFails(sdk.setDoc(nt(piaDb, 'pia'), record({ destination: 'Lisbon', destinationKey: 'lisbon',
        destinationStartDate: sdk.Timestamp.fromDate(new Date('2026-06-10')), destinationEndDate: sdk.Timestamp.fromDate(new Date('2026-06-01')) })));
      await assertFails(sdk.setDoc(nt(piaDb, 'pia'), record({ uid: 'someone-else' })));
      await assertFails(sdk.setDoc(nt(piaDb, 'pia'), record({ updatedAt: sdk.Timestamp.fromDate(new Date('2020-01-01')) })));
      const me = { id: 'pia', name: 'Pia', city: 'Lisbon', profileVisibility: 'public', showInNearbyTravelers: true };
      const lisbon = { destination: 'Lisbon, Portugal', startDate: new Date('2026-06-01'), endDate: new Date('2026-06-10') };
      await assertFails(pia.upsertNearbyTraveler('pia', me, lisbon)); // no trip chosen on the profile
      await pia.setDiscoverySettings('pia', me, { discoveryTripId: 'tripL' }, lisbon);
      const stored = (await sdk.getDoc(nt(piaDb, 'pia'))).data();
      assert.equal(stored.destinationKey, 'lisbon');
      await pia.setDiscoverySettings('pia', { ...me, discoveryTripId: 'tripL' }, { discoveryTripId: null }, null);
      assert.equal((await sdk.getDoc(nt(piaDb, 'pia'))).data().destinationKey, null);
      await pia.setDiscoverySettings('pia', me, { discoveryTripId: 'tripL' }, lisbon); // shared again for the query checks below
    });
    await check('discovery: candidate queries are bounded (limit ≤ 50) and use the bounded client helpers', async () => {
      await assertFails(sdk.getDocs(sdk.query(sdk.collection(quinDb, 'nearbyTravelers'), sdk.where('destinationKey', '==', 'lisbon'), sdk.limit(100))));
      await assertFails(sdk.getDocs(sdk.query(sdk.collection(quinDb, 'nearbyTravelers'), sdk.where('destinationKey', '==', 'lisbon'))));
      const quin = client('packages/firebase/src/firestore.ts', quinDb);
      const found = await quin.getCompanionTravelers('lisbon');
      assert.deepEqual(found.map((t) => t.uid), ['pia']);
      assert.deepEqual((await quin.getDiscoveryRecords(['pia', 'nobody'])).map((t) => t.uid), ['pia']);
    });
    await check('discovery: suspended and deleting accounts cannot write; moderators remove suspended records', async () => {
      const susDb = env.authenticatedContext('sus').firestore();
      await assertFails(sdk.setDoc(nt(susDb, 'sus'), record({ uid: 'sus', displayName: 'Sus' })));
      await assertFails(sdk.updateDoc(sdk.doc(susDb, 'users/sus'), { travelPace: 'active' }));
      const goneDb = env.authenticatedContext('gone').firestore();
      await assertFails(sdk.setDoc(nt(goneDb, 'gone'), record({ uid: 'gone', displayName: 'Gone' })));
      await assertFails(sdk.deleteDoc(nt(quinDb, 'sus'))); // not a moderator
      const modDb = env.authenticatedContext('mod').firestore();
      const moderation = client('packages/firebase/src/moderation.ts', modDb);
      await env.withSecurityRulesDisabled(async ctx => { await sdk.deleteDoc(sdk.doc(ctx.firestore(), 'accountSuspensions/sus')); });
      await moderation.suspendUser('sus', 'mod', 'test');
      await env.withSecurityRulesDisabled(async ctx => { assert.equal((await sdk.getDoc(sdk.doc(ctx.firestore(), 'nearbyTravelers/sus'))).exists(), false); });
    });
    await check('discovery: turning discovery off (or going private) removes the record', async () => {
      await pia.updateProfileVisibility('pia', { id: 'pia', name: 'Pia' }, 'private');
      assert.equal((await sdk.getDoc(nt(piaDb, 'pia'))).exists(), false);
    });
    await check('public trips: a destination key is optional (older trips) and bounded', async () => {
      await assertFails(sdk.setDoc(sdk.doc(piaDb, 'publicTrips/t-long'), { ownerUid: 'pia', title: 'T', destination: 'X', destinationKey: 'x'.repeat(81) }));
      await sdk.setDoc(sdk.doc(piaDb, 'publicTrips/t-old'), { ownerUid: 'pia', title: 'T', destination: 'X' });
      await sdk.setDoc(sdk.doc(piaDb, 'publicTrips/t-new'), { ownerUid: 'pia', title: 'T', destination: 'Lisbon', destinationKey: 'lisbon' });
    });
    await check('join requests: the existing flow works for a requester; blocking (either way) and deleting organizers are refused', async () => {
      await env.withSecurityRulesDisabled(async ctx => {
        const adb = ctx.firestore();
        await sdk.setDoc(sdk.doc(adb, 'blocks/blocker/blocked/quin'), { blockedUid: 'quin' });
        await sdk.setDoc(sdk.doc(adb, 'blocks/quin/blocked/blockedByQuin'), { blockedUid: 'blockedByQuin' });
      });
      const quin = client('packages/firebase/src/firestore.ts', quinDb);
      const requestor = { id: 'quin', name: 'Quin', photoURL: null, bio: '' };
      await quin.submitTripJoinRequest('t-new', { ownerUid: 'pia', destination: 'Lisbon', title: 'T' }, requestor, 'hello');
      assert.equal(await quin.getTripJoinRequestStatus('t-new', 'quin'), 'pending');
      await assertFails(quin.submitTripJoinRequest('t-b1', { ownerUid: 'blocker', destination: 'X', title: 'T' }, requestor, ''));
      await assertFails(quin.submitTripJoinRequest('t-b2', { ownerUid: 'blockedByQuin', destination: 'X', title: 'T' }, requestor, ''));
      await assertFails(quin.submitTripJoinRequest('t-gone', { ownerUid: 'gone', destination: 'X', title: 'T' }, requestor, ''));
      await assertFails(quin.submitTripJoinRequest('t-new', { ownerUid: 'pia', destination: 'Lisbon', title: 'T' }, requestor, 'again')); // pending already: not a new request
      // Cancel really cancels, and the requester may ask again afterwards.
      await quin.cancelTripJoinRequest('t-new_quin', 'quin');
      assert.equal(await quin.getTripJoinRequestStatus('t-new', 'quin'), 'cancelled');
      await quin.submitTripJoinRequest('t-new', { ownerUid: 'pia', destination: 'Lisbon', title: 'T' }, requestor, 'again');
      assert.equal(await quin.getTripJoinRequestStatus('t-new', 'quin'), 'pending');
      // Re-asking cannot redirect the request to another organizer or trip.
      await quin.cancelTripJoinRequest('t-new_quin', 'quin');
      await assertFails(sdk.setDoc(sdk.doc(quinDb, 'tripJoinRequests/t-new_quin'), { requestId: 't-new_quin', tripId: 'other', ownerUid: 'pia', requestorUid: 'quin', status: 'pending' }));
      // After a rejection the organizer's decision stands.
      await quin.submitTripJoinRequest('t-new', { ownerUid: 'pia', destination: 'Lisbon', title: 'T' }, requestor, 'again');
      await sdk.updateDoc(sdk.doc(piaDb, 'tripJoinRequests/t-new_quin'), { status: 'rejected' });
      await assertFails(quin.submitTripJoinRequest('t-new', { ownerUid: 'pia', destination: 'Lisbon', title: 'T' }, requestor, 'please'));
    });
    // ── Consent: discovery settings and the discovery record change together ──
    await env.withSecurityRulesDisabled(async ctx => {
      const adb = ctx.firestore();
      for (const [p, data] of Object.entries({
        'users/cara': { name: 'Cara', city: 'Porto', profileVisibility: 'public', showInNearbyTravelers: true, shareCompatibility: true, travelPace: 'relaxed', discoveryTripId: 'tc' },
        'users/cara/trips/tc': { userId: 'cara', destination: 'Porto', startDate: sdk.Timestamp.fromDate(new Date('2026-07-01')), endDate: sdk.Timestamp.fromDate(new Date('2026-07-05')), isArchived: false },
        'users/cara/trips/other': { userId: 'cara', destination: 'Rome', startDate: sdk.Timestamp.fromDate(new Date('2026-08-01')), endDate: sdk.Timestamp.fromDate(new Date('2026-08-05')), isArchived: false },
        'nearbyTravelers/cara': { uid: 'cara', displayName: 'Cara', photoURL: null, currentCity: 'Porto', travelStyles: [], interests: [], languages: [], travelPace: 'relaxed',
          travelSchedule: null, groupSizePreference: null, destination: 'Porto', destinationKey: 'porto',
          destinationStartDate: sdk.Timestamp.fromDate(new Date('2026-07-01')), destinationEndDate: sdk.Timestamp.fromDate(new Date('2026-07-05')), updatedAt: sdk.Timestamp.now() },
      })) await sdk.setDoc(sdk.doc(adb, p), data);
    });
    const caraDb = env.authenticatedContext('cara').firestore();
    const cara = client('packages/firebase/src/firestore.ts', caraDb);
    const caraUser = async () => (await sdk.getDoc(sdk.doc(caraDb, 'users/cara'))).data();
    const caraRecord = async () => { const r = await sdk.getDoc(nt(caraDb, 'cara')); return r.exists() ? r.data() : null; };
    const CARA = { id: 'cara', name: 'Cara', city: 'Porto', profileVisibility: 'public', showInNearbyTravelers: true, shareCompatibility: true, travelPace: 'relaxed', discoveryTripId: 'tc' };
    const PORTO = { destination: 'Porto', startDate: new Date('2026-07-01'), endDate: new Date('2026-07-05') };
    await check('consent: direct SDK writes cannot withdraw, opt out or go private while shared data stays in the record', async () => {
      await assertFails(sdk.updateDoc(sdk.doc(caraDb, 'users/cara'), { shareCompatibility: false }));
      await assertFails(sdk.updateDoc(sdk.doc(caraDb, 'users/cara'), { showInNearbyTravelers: false }));
      await assertFails(sdk.updateDoc(sdk.doc(caraDb, 'users/cara'), { profileVisibility: 'private' }));
      await assertFails(sdk.updateDoc(sdk.doc(caraDb, 'users/cara'), { discoveryTripId: null }));
      // Unrelated profile edits still work.
      await sdk.updateDoc(sdk.doc(caraDb, 'users/cara'), { bio: 'hello' });
      // The interrupted two-step sequence the app used to run cannot leave an unsafe state:
      // step 1 alone is refused, so nothing changes.
      assert.equal((await caraUser()).shareCompatibility, true);
      assert.equal((await caraRecord()).travelPace, 'relaxed');
    });
    await check('consent: an interrupted settings write changes nothing and reports failure', async () => {
      // A record the rules refuse (blocked term in the name) makes the whole batch fail.
      await assert.rejects(cara.setDiscoverySettings('cara', { ...CARA, name: 'kys' }, { shareCompatibility: false }, PORTO));
      assert.equal((await caraUser()).shareCompatibility, true);
      assert.equal((await caraRecord()).travelPace, 'relaxed');
    });
    await check('consent: withdrawal, trip removal, opt-out and going private are atomic', async () => {
      await cara.setDiscoverySettings('cara', CARA, { shareCompatibility: false }, PORTO);
      assert.deepEqual([(await caraUser()).shareCompatibility, (await caraRecord()).travelPace, (await caraRecord()).destinationKey], [false, null, 'porto']);
      await cara.setDiscoverySettings('cara', { ...CARA, shareCompatibility: false }, { discoveryTripId: null }, null);
      assert.deepEqual([(await caraUser()).discoveryTripId, (await caraRecord()).destinationKey], [null, null]);
      await cara.setDiscoverySettings('cara', { ...CARA, shareCompatibility: false, discoveryTripId: null }, { showInNearbyTravelers: false }, null);
      assert.deepEqual([(await caraUser()).showInNearbyTravelers, await caraRecord()], [false, null]);
      // Opting in again creates the record in the same write.
      await cara.setDiscoverySettings('cara', { ...CARA, shareCompatibility: false, discoveryTripId: null, showInNearbyTravelers: false }, { showInNearbyTravelers: true }, null);
      assert.ok(await caraRecord());
      await cara.updateProfileVisibility('cara', { ...CARA, shareCompatibility: false, discoveryTripId: null }, 'private');
      assert.deepEqual([(await caraUser()).profileVisibility, (await caraUser()).showInNearbyTravelers, await caraRecord()], ['private', false, null]);
    });
    await check('shared trip: editing updates and archiving removes its discovery details in the same write; consent is kept', async () => {
      await env.withSecurityRulesDisabled(async ctx => {
        await sdk.setDoc(sdk.doc(ctx.firestore(), 'users/cara'), { ...CARA });
      });
      await cara.setDiscoverySettings('cara', { ...CARA, discoveryTripId: null }, { discoveryTripId: 'tc' }, PORTO);
      const moved = { destination: 'Porto', startDate: new Date('2026-07-10'), endDate: new Date('2026-07-12') };
      await cara.updateTrip('cara', 'tc', { startDate: moved.startDate, endDate: moved.endDate }, { profile: CARA, sharedTrip: moved });
      assert.equal((await caraRecord()).destinationStartDate.toDate().toISOString().slice(0, 10), '2026-07-10');
      await cara.updateTrip('cara', 'tc', { destination: 'Lisbon' }, { profile: CARA, sharedTrip: { ...moved, destination: 'Lisbon' } });
      assert.equal((await caraRecord()).destinationKey, 'lisbon');
      await cara.archiveTrip('cara', 'tc', { profile: CARA });
      const u = await caraUser();
      const r = await caraRecord();
      assert.deepEqual([u.discoveryTripId, u.shareCompatibility, r.destinationKey, r.travelPace], [null, true, null, 'relaxed']);
      assert.equal((await sdk.getDoc(sdk.doc(caraDb, 'users/cara/trips/other'))).data().isArchived, false, 'no other trip is published');
    });

    // ── Join requests: state machine and identity ──
    await check('join requests: rejected cannot become cancelled or pending again (bypass sequence)', async () => {
      const quin = client('packages/firebase/src/firestore.ts', quinDb);
      const requestor = { id: 'quin', name: 'Quin', photoURL: null, bio: '' };
      await quin.submitTripJoinRequest('t-sm', { ownerUid: 'pia', destination: 'Lisbon', title: 'T' }, requestor, 'hi');
      await sdk.updateDoc(sdk.doc(piaDb, 'tripJoinRequests/t-sm_quin'), { status: 'rejected', updatedAt: sdk.serverTimestamp() });
      await assertFails(quin.cancelTripJoinRequest('t-sm_quin', 'quin'));
      await assertFails(sdk.updateDoc(sdk.doc(quinDb, 'tripJoinRequests/t-sm_quin'), { status: 'cancelled' }));
      await assertFails(quin.submitTripJoinRequest('t-sm', { ownerUid: 'pia', destination: 'Lisbon', title: 'T' }, requestor, 'again'));
      assert.equal(await quin.getTripJoinRequestStatus('t-sm', 'quin'), 'rejected');
      // The organizer cannot flip a decision either.
      await assertFails(sdk.updateDoc(sdk.doc(piaDb, 'tripJoinRequests/t-sm_quin'), { status: 'approved' }));
    });
    await check('join requests: pending → cancelled → pending and organizer approval still work; identity is immutable', async () => {
      const quin = client('packages/firebase/src/firestore.ts', quinDb);
      const requestor = { id: 'quin', name: 'Quin', photoURL: null, bio: '' };
      await quin.submitTripJoinRequest('t-ok', { ownerUid: 'pia', destination: 'Lisbon', title: 'T' }, requestor, 'hi');
      await assertFails(sdk.updateDoc(sdk.doc(quinDb, 'tripJoinRequests/t-ok_quin'), { status: 'cancelled', ownerUid: 'someone' }));
      await assertFails(sdk.updateDoc(sdk.doc(quinDb, 'tripJoinRequests/t-ok_quin'), { status: 'cancelled', tripId: 'other' }));
      await quin.cancelTripJoinRequest('t-ok_quin', 'quin');
      await assertFails(quin.cancelTripJoinRequest('t-ok_quin', 'quin')); // already cancelled
      await assertFails(sdk.updateDoc(sdk.doc(piaDb, 'tripJoinRequests/t-ok_quin'), { status: 'approved' })); // nothing pending to decide
      await quin.submitTripJoinRequest('t-ok', { ownerUid: 'pia', destination: 'Lisbon', title: 'T' }, requestor, 'again');
      await assertFails(sdk.updateDoc(sdk.doc(piaDb, 'tripJoinRequests/t-ok_quin'), { status: 'approved', requestorUid: 'pia' }));
      await assertFails(sdk.updateDoc(sdk.doc(piaDb, 'tripJoinRequests/t-ok_quin'), { status: 'approved', message: 'edited' }));
      await sdk.updateDoc(sdk.doc(piaDb, 'tripJoinRequests/t-ok_quin'), { status: 'approved', updatedAt: sdk.serverTimestamp() });
      assert.equal(await quin.getTripJoinRequestStatus('t-ok', 'quin'), 'approved');
      await assertFails(quin.cancelTripJoinRequest('t-ok_quin', 'quin')); // approved is not cancellable
      await assertFails(sdk.updateDoc(sdk.doc(piaDb, 'tripJoinRequests/t-ok_quin'), { status: 'rejected' }));
    });
    // QA phase (2026-10-19): public trip editing, member leave, organizer context, terms, group leave
    const FS = 'packages/firebase/src/firestore.ts';
    const tripData = (over = {}) => ({ title: 'Lisbon', destination: 'Lisbon, Portugal', startDate: new Date('2026-11-19'), endDate: new Date('2026-11-27'), description: 'Walking week', tags: [], maxMembers: 3,
      isAcceptingMembers: true, coverPhotoURL: null, ownerName: 'Rho', ownerPhotoURL: null, memberCount: 1, expectations: 'Easy pace, no early starts', budgetNote: 'Mid-range, costs split evenly', ...over });
    const rhoDb = ctxDb('rho'), samDb = ctxDb('sam'), tessDb = ctxDb('tess');
    const rho = client(FS, rhoDb), sam = client(FS, samDb);
    let qaTrip;
    await check('public trip: the organizer can edit after publishing (update, not replace); member count and members survive; expectations and budget are stored', async () => {
      qaTrip = await rho.createTrip('rho', { destination: 'Lisbon, Portugal', startDate: new Date('2026-11-19'), endDate: new Date('2026-11-27'), notes: '', coverPhotoURL: null });
      await rho.setTripVisibility('rho', qaTrip, 'public', tripData());
      await sam.submitTripJoinRequest(qaTrip, { ownerUid: 'rho', destination: 'Lisbon, Portugal', title: 'Lisbon' }, { id: 'sam', name: 'Sam', photoURL: null, bio: '' }, 'hi');
      await rho.approveTripJoinRequest(`${qaTrip}_sam`, qaTrip, 'rho', { requestorUid: 'sam', requestorName: 'Sam', requestorPhotoURL: null });
      const before = (await sdk.getDoc(sdk.doc(rhoDb, `publicTrips/${qaTrip}`))).data();
      assert.equal(before.memberCount, 2);
      // Second save: the app passes the stale private count (1) and a changed description and capacity.
      await rho.setTripVisibility('rho', qaTrip, 'public', tripData({ description: 'Changed', maxMembers: 4, memberCount: 1, budgetNote: 'Budget' }));
      const after = (await sdk.getDoc(sdk.doc(rhoDb, `publicTrips/${qaTrip}`))).data();
      assert.equal(after.description, 'Changed'); assert.equal(after.maxMembers, 4); assert.equal(after.memberCount, 2, 'count not reset');
      assert.equal(after.expectations, 'Easy pace, no early starts'); assert.equal(after.budgetNote, 'Budget');
      assert.equal(after.createdAt.toMillis(), before.createdAt.toMillis(), 'createdAt kept');
      assert.equal((await sdk.getDoc(sdk.doc(rhoDb, `trips/${qaTrip}/members/rho`))).data().role, 'owner');
      assert.equal((await sdk.getDoc(sdk.doc(rhoDb, `trips/${qaTrip}/members/sam`))).exists(), true);
      assert.equal(after.ownerUid, 'rho');
    });
    await check('public trip: expectations (300) and budget (80) are length-limited and text-filtered; a stranger cannot edit', async () => {
      await assertFails(rho.setTripVisibility('rho', qaTrip, 'public', tripData({ expectations: 'x'.repeat(301) })));
      await assertFails(rho.setTripVisibility('rho', qaTrip, 'public', tripData({ budgetNote: 'x'.repeat(81) })));
      await assertFails(rho.setTripVisibility('rho', qaTrip, 'public', tripData({ expectations: 'no kill yourself talk' })));
      await assertFails(sdk.updateDoc(sdk.doc(tessDb, `publicTrips/${qaTrip}`), { description: 'hijack', updatedAt: sdk.serverTimestamp() }));
      assert.equal((await sdk.getDoc(sdk.doc(rhoDb, `publicTrips/${qaTrip}`))).data().description, 'Changed');
    });
    await check('leave trip: a member leaves and the count drops by one; strangers and extra changes are refused', async () => {
      await assertFails(sdk.updateDoc(sdk.doc(tessDb, `publicTrips/${qaTrip}`), { memberCount: sdk.increment(-1), updatedAt: sdk.serverTimestamp() })); // not a member
      await assertFails(sdk.updateDoc(sdk.doc(samDb, `publicTrips/${qaTrip}`), { memberCount: sdk.increment(-1), updatedAt: sdk.serverTimestamp() })); // member document not removed in the same write
      const b = sdk.writeBatch(samDb);
      b.delete(sdk.doc(samDb, `trips/${qaTrip}/members/sam`)); b.update(sdk.doc(samDb, `publicTrips/${qaTrip}`), { memberCount: sdk.increment(-2), updatedAt: sdk.serverTimestamp() });
      await assertFails(b.commit()); // more than one
      const c = sdk.writeBatch(samDb);
      c.delete(sdk.doc(samDb, `trips/${qaTrip}/members/sam`)); c.update(sdk.doc(samDb, `publicTrips/${qaTrip}`), { memberCount: sdk.increment(-1), description: 'changed by member', updatedAt: sdk.serverTimestamp() });
      await assertFails(c.commit()); // anything else
      await sam.leavePublicTrip(qaTrip, 'sam');
      assert.equal((await sdk.getDoc(sdk.doc(rhoDb, `publicTrips/${qaTrip}`))).data().memberCount, 1);
      assert.equal((await sdk.getDoc(sdk.doc(rhoDb, `trips/${qaTrip}/members/sam`))).exists(), false);
      await assertFails(sam.leavePublicTrip(qaTrip, 'sam')); // no longer a member
    });
    await check('terms acceptance: only a version string and the server time', async () => {
      const tomDb = ctxDb('tom'); const tom = client(FS, tomDb);
      await sdk.setDoc(sdk.doc(tomDb, 'users/tom'), { name: 'Tom', email: 'tom@example.test' });
      await tom.acceptTerms('tom', '2026-10-19');
      const d = (await sdk.getDoc(sdk.doc(tomDb, 'users/tom'))).data();
      assert.equal(d.termsAcceptedVersion, '2026-10-19'); assert.ok(d.termsAcceptedAt.toMillis() > 0);
      await assertFails(sdk.updateDoc(sdk.doc(tomDb, 'users/tom'), { termsAcceptedVersion: 'v'.repeat(21), termsAcceptedAt: sdk.serverTimestamp() }));
      await assertFails(sdk.updateDoc(sdk.doc(tomDb, 'users/tom'), { termsAcceptedVersion: 7, termsAcceptedAt: sdk.serverTimestamp() }));
      await assertFails(sdk.updateDoc(sdk.doc(tomDb, 'users/tom'), { termsAcceptedVersion: '2026-10-19', termsAcceptedAt: new Date('2020-01-01') })); // not the server time
      await assertFails(sdk.updateDoc(sdk.doc(tessDb, 'users/tom'), { termsAcceptedVersion: '2026-10-19', termsAcceptedAt: sdk.serverTimestamp() })); // someone else's account
    });
    await check('leave group chat: a member removes only themselves; others cannot be removed; non-members cannot', async () => {
      await env.withSecurityRulesDisabled(async ctx => {
        await sdk.setDoc(sdk.doc(ctx.firestore(), 'groups/qag'), { name: 'QA group', createdBy: 'gcreator', members: ['gcreator', 'gmember'], memberInfo: {}, lastMessage: null, unreadCounts: { gcreator: 0, gmember: 0 } });
      });
      const gDb = ctxDb('gmember'); const g = client('packages/firebase/src/chat.ts', gDb);
      await assertFails(sdk.updateDoc(sdk.doc(gDb, 'groups/qag'), { members: sdk.arrayRemove('gcreator') })); // cannot remove someone else
      await assertFails(client('packages/firebase/src/chat.ts', ctxDb('stranger')).leaveChatGroup('qag', 'stranger', 'S')); // not a member
      await g.leaveChatGroup('qag', 'gmember', 'Gem');
      await env.withSecurityRulesDisabled(async ctx => {
        const d = (await sdk.getDoc(sdk.doc(ctx.firestore(), 'groups/qag'))).data();
        assert.deepEqual(d.members, ['gcreator']);
        const msgs = await sdk.getDocs(sdk.collection(ctx.firestore(), 'groups/qag/messages'));
        assert.equal(msgs.size, 1); assert.equal(msgs.docs[0].data().text, 'Gem left the group'); assert.equal(msgs.docs[0].data().type, 'system');
      });
      await assertFails(sdk.getDocs(sdk.collection(gDb, 'groups/qag/messages'))); // no longer a member: cannot read it
    });
    console.log(`${checks} release rule checks passed`);
  } finally { await env.cleanup(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
