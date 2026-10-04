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
    const code = ts.transpileModule(fs.readFileSync(path.join(root, 'packages/shared/src/moderation.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    new Function('module', 'exports', code)(sharedModule, sharedModule.exports);
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
    const friendChat = client('packages/firebase/src/chat.ts', env.authenticatedContext('friend').firestore());
    const waitFor = async (fn) => { for (let i = 0; i < 50; i++) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 100)); } return false; };
    const groupData = (pending) => ({ name: 'Paused', createdBy: 'actor', members: ['actor', 'friend', ...Array.from({ length: 6 }, (_, i) => `p${i}`)],
      pendingMembers: pending, memberInfo: {}, unreadCounts: {}, lastMessage: null, updatedAt: sdk.Timestamp.now() });
    await check('interrupted group creation is hidden, then resumed by the creator', async () => {
      // State left by an app killed after the first chunk.
      await sdk.setDoc(sdk.doc(db, 'groups/interrupted'), groupData(['q1', 'q2', 'q3']));
      assert.ok(!(await firstGroups(friendChat, 'friend')).some((g) => g.id === 'interrupted'), 'hidden from members while pending');
      await firstGroups(chat, 'actor'); // creator's client sees it and resumes
      assert.ok(await waitFor(async () => !((await adminGet('groups/interrupted'))?.pendingMembers?.length)));
      assert.equal((await adminGet('groups/interrupted')).members.length, 11);
      await groupsWhen(friendChat, 'friend', has('interrupted')); // visible once complete
    });
    await check('interrupted creation with a refused pending member: member dropped on resume, group completes', async () => {
      await sdk.setDoc(sdk.doc(db, 'groups/refused'), { ...groupData(['q1', 'gone']), memberInfo: { gone: { name: 'Gone' }, q1: { name: 'Q' } }, unreadCounts: { gone: 0, q1: 0 } });
      assert.ok(!(await firstGroups(friendChat, 'friend')).some((g) => g.id === 'refused'), 'hidden while pending');
      await chat.completeGroupCreation('refused');
      const g = await adminGet('groups/refused');
      assert.ok(g.members.includes('q1') && !g.members.includes('gone'));
      assert.deepEqual([g.pendingMembers, g.memberInfo.gone, g.unreadCounts.gone, g.memberInfo.q1.name], [[], undefined, undefined, 'Q']);
      // Concurrent resumes (two app instances of the creator) converge to the same result.
      await sdk.setDoc(sdk.doc(db, 'groups/refused2'), { ...groupData(['gone', 'q2']), memberInfo: { gone: { name: 'Gone' } }, unreadCounts: { gone: 0 } });
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
      await mod.setContentVisibility('post', 'cleared', 'mod', 'public');
    });
    await env.withSecurityRulesDisabled(ctx => sdk.setDoc(sdk.doc(ctx.firestore(), 'blocks/owner/blocked/actor'), {}));
    await check('blocked sender cannot send', () => assertFails(chat.sendDirectMessage('chat', 'actor', 'Blocked', 'blocked', ['owner'])));
    console.log(`${checks} release rule checks passed`);
  } finally { await env.cleanup(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
