const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const assert = require('node:assert/strict');
const { initializeTestEnvironment, assertFails } = require('@firebase/rules-unit-testing');
const sdk = require('firebase/firestore');
const root = path.resolve(__dirname, '../..');
const TERMS = '2026-10-19';
let sharedModule;
function loadShared() {
  if (!sharedModule) {
    sharedModule = { exports: {} };
    for (const f of ['moderation', 'preferences', 'types/Community', 'policy']) {
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
        // Everyone who creates content has accepted the current Terms (rules refuse content creation otherwise).
        ...Object.fromEntries(['actor', 'owner', 'bob', 'carol', 'friend', 'mod', 'outsider', 'rho', 'sam', 'tess', 'gone', 'sus', 'r1', 'r2', 'r3', 'lift1', 'lift2', 'mod2'].map((u) => [`users/${u}`, { termsAcceptedVersion: TERMS }])),
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
      await sdk.setDoc(sdk.doc(db,'users/actor'), { email:'actor@example.test', termsAcceptedVersion: TERMS });
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
    // withSecurityRulesDisabled resolves to undefined, so capture the read explicitly.
    const adminGet = async (p) => { let data; await env.withSecurityRulesDisabled(async (ctx) => { data = (await sdk.getDoc(sdk.doc(ctx.firestore(), p))).data(); }); return data; };
    const adminSet = (p, data) => env.withSecurityRulesDisabled((ctx) => sdk.setDoc(sdk.doc(ctx.firestore(), p), data));
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
    const ctxDb = (uid) => env.authenticatedContext(uid, { email: `${uid}@example.test`, email_verified: true }).firestore();
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
    const chatOf = (uid) => client('packages/firebase/src/chat.ts', env.authenticatedContext(uid, { email: `${uid}@example.test`, email_verified: true }).firestore());
    const gdoc = (d, p) => sdk.doc(d, p);
    await check('group identity: a deleting UID cannot be added as member or pending member (create or update)', async () => {
      await assertFails(sdk.setDoc(gdoc(bobDb, 'groups/n1'), { name: 'n', createdBy: 'bob', members: ['bob', 'gone'], memberInfo: {}, unreadCounts: {} }));
      await assertFails(sdk.updateDoc(gdoc(bobDb, 'groups/bobGroup'), { members: sdk.arrayUnion('gone') }));
      await assertFails(sdk.setDoc(gdoc(bobDb, 'groups/n2'), { name: 'n', createdBy: 'bob', members: ['bob'], pendingMembers: ['gone'], memberInfo: { gone: { name: 'Gone' } }, unreadCounts: { gone: 0 } }));
      await assertFails(sdk.updateDoc(gdoc(bobDb, 'groups/bobGroup'), { pendingMembers: sdk.arrayUnion('gone') }));
      // The deleting account cannot join through an invitation either.
      await env.withSecurityRulesDisabled((ctx) => sdk.setDoc(sdk.doc(ctx.firestore(), 'groupInvites/bobGroup_gone@example.test'), { groupId: 'bobGroup', groupName: 'G', inviterUid: 'bob', inviterName: 'Bob', inviteeEmail: 'gone@example.test', status: 'pending', expiresAt: sdk.Timestamp.fromMillis(Date.now() + 3600000) }));
      await assertFails(chatOf('gone').acceptGroupInvite({ id: 'bobGroup_gone@example.test', groupId: 'bobGroup' }, { uid: 'gone', info: { name: 'Gone', initials: 'G' } }));
    });
    await check('group identity: memberInfo / unreadCounts keys cannot be added for non-members (creator or member)', async () => {
      await assertFails(sdk.updateDoc(gdoc(bobDb, 'groups/bobGroup'), { 'memberInfo.gone': { name: 'Gone' } }));
      await assertFails(sdk.updateDoc(gdoc(carolDb, 'groups/bobGroup'), { 'unreadCounts.gone': 1, updatedAt: sdk.serverTimestamp() }));
      await assertFails(sdk.updateDoc(gdoc(carolDb, 'groups/bobGroup'), { 'unreadCounts.stranger': 1, updatedAt: sdk.serverTimestamp() }));
    });
    await check('group identity: normal group operations keep working', async () => {
      await sdk.updateDoc(gdoc(bobDb, 'groups/bobGroupLeft'), { name: 'renamed' }); // stale memberInfo of a former member is tolerated
      await sdk.updateDoc(gdoc(bobDb, 'groups/bobGroup'), { members: sdk.arrayRemove('carol') }); // the creator can remove a member
      await sdk.updateDoc(gdoc(bobDb, 'groups/bobGroup'), { members: sdk.arrayUnion('carol'), 'memberInfo.carol': { name: 'Carol' } }).then(() => assert.fail('creator must not add people directly'), () => {});
      await env.withSecurityRulesDisabled((ctx) => sdk.updateDoc(sdk.doc(ctx.firestore(), 'groups/bobGroup'), { members: ['bob', 'carol'] }));
      await sdk.updateDoc(gdoc(carolDb, 'groups/bobGroup'), { 'unreadCounts.bob': 2, lastMessage: { senderId: 'carol', text: 'hi' }, updatedAt: sdk.serverTimestamp() });
      await sdk.setDoc(gdoc(bobDb, 'groups/n3'), { name: 'n', createdBy: 'bob', members: ['bob'], memberInfo: { bob: { name: 'Bob' } }, unreadCounts: { bob: 0 } });
    });
    // ── Travel preferences and traveler discovery (compatibility onboarding) ──
    await env.withSecurityRulesDisabled(async ctx => {
      const adb = ctx.firestore();
      for (const [p, data] of Object.entries({
        'users/pia': { termsAcceptedVersion: TERMS, name: 'Pia', profileVisibility: 'public', showInNearbyTravelers: true, shareCompatibility: false },
        'users/quin': { termsAcceptedVersion: TERMS, name: 'Quin', profileVisibility: 'private', showInNearbyTravelers: false },
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
      await adminSet('trips/t-ok/members/quin', { uid: 'quin', role: 'member', displayName: 'Quin' });
      await assertFails(quin.cancelTripJoinRequest('t-ok_quin', 'quin')); // approved is not cancellable while the person is a member
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
      await sam.leavePublicTrip(qaTrip, 'sam'); // a retry after success is a no-op, not an error
      assert.equal((await sdk.getDoc(sdk.doc(rhoDb, `publicTrips/${qaTrip}`))).data().memberCount, 1);
    });
    await check('public trip: going private removes the public trip and its members, and the trip can be published again (it used to fail)', async () => {
      await sam.submitTripJoinRequest(qaTrip, { ownerUid: 'rho', destination: 'Lisbon, Portugal', title: 'Lisbon' }, { id: 'sam', name: 'Sam', photoURL: null, bio: '' }, 'again');
      await rho.approveTripJoinRequest(`${qaTrip}_sam`, qaTrip, 'rho', { requestorUid: 'sam', requestorName: 'Sam', requestorPhotoURL: null });
      await rho.setTripVisibility('rho', qaTrip, 'private');
      assert.equal((await sdk.getDoc(sdk.doc(rhoDb, `publicTrips/${qaTrip}`))).exists(), false);
      assert.equal((await sdk.getDocs(sdk.collection(rhoDb, `trips/${qaTrip}/members`))).size, 0, 'members removed with the public trip');
      await rho.setTripVisibility('rho', qaTrip, 'public', tripData({ description: 'Published again' }));
      const again = (await sdk.getDoc(sdk.doc(rhoDb, `publicTrips/${qaTrip}`))).data();
      assert.equal(again.memberCount, 1); assert.equal(again.description, 'Published again');
      assert.equal((await sdk.getDoc(sdk.doc(rhoDb, `trips/${qaTrip}/members/rho`))).data().role, 'owner');
      await rho.setTripVisibility('rho', qaTrip, 'public', tripData({ description: 'Edited once more' })); // and editing still works
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
        await sdk.setDoc(sdk.doc(ctx.firestore(), 'users/gmember'), { termsAcceptedVersion: TERMS });
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
    // ── Follow-up phase (2026-10-20): invitations, moderation of trips and groups, Terms barrier, leaving, lifting suspensions ──
    const CHAT = 'packages/firebase/src/chat.ts', MOD = 'packages/firebase/src/moderation.ts';
    const people = ['ivy', 'jon', 'kai', 'lee', 'mia', 'nia', 'oli', 'pat', 'quentin', 'rae', 'zed', 'dee'];
    await env.withSecurityRulesDisabled(async ctx => {
      const adb = ctx.firestore();
      for (const u of people) await sdk.setDoc(sdk.doc(adb, `users/${u}`), { termsAcceptedVersion: TERMS, name: u });
      await sdk.setDoc(sdk.doc(adb, 'blocks/nia/blocked/ivy'), { blockedUid: 'ivy' });
    });
    const dbOf = (uid) => ctxDb(uid);
    const em = (uid) => `${uid}@example.test`;
    const person = (uid) => ({ name: uid, initials: uid[0].toUpperCase() });
    const inviteDoc = (group, uid) => `groupInvites/${group}_${em(uid)}`;
    const ivyChat = chatOf('ivy');
    let G;
    await check('group chat: the creator starts alone; nobody is added directly (create or update, with or without a pending list)', async () => {
      G = await ivyChat.createGroup('ivy', 'Trip', person('ivy'));
      assert.deepEqual((await adminGet(`groups/${G}`)).members, ['ivy']);
      const d = dbOf('ivy');
      await assertFails(sdk.setDoc(sdk.doc(d, 'groups/x1'), { name: 'x', createdBy: 'ivy', members: ['ivy', 'jon'], memberInfo: {}, unreadCounts: {}, lastMessage: null }));
      await assertFails(sdk.setDoc(sdk.doc(d, 'groups/x2'), { name: 'x', createdBy: 'ivy', members: ['ivy'], pendingMembers: ['jon'], memberInfo: {}, unreadCounts: {}, lastMessage: null }));
      await assertFails(sdk.updateDoc(sdk.doc(d, `groups/${G}`), { members: sdk.arrayUnion('jon') }));
      await assertFails(sdk.updateDoc(sdk.doc(d, `groups/${G}`), { pendingMembers: sdk.arrayUnion('jon') }));
    });
    await check('invitation: only the group creator invites; the sender cannot be spoofed and cannot invite themselves; extra fields and long expiry are refused', async () => {
      await ivyChat.inviteToGroup({ id: G, name: 'Trip' }, { uid: 'ivy', name: 'Ivy' }, ' Jon@Example.test ');
      await assertFails(chatOf('kai').inviteToGroup({ id: G, name: 'Trip' }, { uid: 'kai', name: 'Kai' }, em('lee')));
      await assertFails(ivyChat.inviteToGroup({ id: G, name: 'Trip' }, { uid: 'kai', name: 'Kai' }, em('lee')));
      await assertFails(ivyChat.inviteToGroup({ id: G, name: 'Trip' }, { uid: 'ivy', name: 'Ivy' }, em('ivy')));
      const base = { groupId: G, groupName: 'Trip', inviterUid: 'ivy', inviterName: 'Ivy', inviteeEmail: em('lee'), status: 'pending', createdAt: sdk.serverTimestamp(), updatedAt: sdk.serverTimestamp(), expiresAt: sdk.Timestamp.fromMillis(Date.now() + 3600000) };
      await assertFails(sdk.setDoc(sdk.doc(dbOf('ivy'), inviteDoc(G, 'lee')), { ...base, extra: 1 }));
      await assertFails(sdk.setDoc(sdk.doc(dbOf('ivy'), inviteDoc(G, 'lee')), { ...base, expiresAt: sdk.Timestamp.fromMillis(Date.now() + 40 * 86400000) }));
      await assertFails(sdk.setDoc(sdk.doc(dbOf('ivy'), inviteDoc(G, 'lee')), { ...base, inviteeEmail: em('mia') })); // id must match the address
      await assertFails(sdk.setDoc(sdk.doc(dbOf('ivy'), inviteDoc(G, 'lee')), { ...base, groupName: 'what the fuck' }));
      assert.deepEqual((await adminGet(`groups/${G}`)).members, ['ivy'], 'sending an invitation adds nobody');
    });
    await check('invitation: only the addressed person reads it; the sender sees what they sent; no account lookup is needed or revealed', async () => {
      const mine = await sdk.getDocs(sdk.query(sdk.collection(dbOf('jon'), 'groupInvites'), sdk.where('inviteeEmail', '==', em('jon')), sdk.where('status', '==', 'pending')));
      assert.equal(mine.size, 1);
      await assertFails(sdk.getDocs(sdk.query(sdk.collection(dbOf('kai'), 'groupInvites'), sdk.where('inviteeEmail', '==', em('jon')))));
      await assertFails(sdk.getDoc(sdk.doc(dbOf('kai'), inviteDoc(G, 'jon'))));
      await assertFails(sdk.getDocs(sdk.collection(dbOf('kai'), 'groupInvites')));
      const sent = await sdk.getDocs(sdk.query(sdk.collection(dbOf('ivy'), 'groupInvites'), sdk.where('inviterUid', '==', 'ivy'), sdk.where('groupId', '==', G)));
      assert.equal(sent.size, 1);
      // An invitation to an address with no account looks identical to the sender (it is just a document).
      await ivyChat.inviteToGroup({ id: G, name: 'Trip' }, { uid: 'ivy', name: 'Ivy' }, 'nobody-has-this@example.test');
    });
    await check('invitation: joining is only by accepting; adding yourself, accepting for someone else, or accepting without an invitation is refused', async () => {
      const grab = { members: sdk.arrayUnion('jon'), 'memberInfo.jon': person('jon'), 'unreadCounts.jon': 0, updatedAt: sdk.serverTimestamp() };
      await assertFails(sdk.updateDoc(sdk.doc(dbOf('jon'), `groups/${G}`), grab)); // invited, but has not accepted
      await assertFails(chatOf('kai').acceptGroupInvite({ id: `${G}_${em('kai')}`, groupId: G }, { uid: 'kai', info: person('kai') })); // no invitation at all
      await assertFails(chatOf('kai').acceptGroupInvite({ id: `${G}_${em('jon')}`, groupId: G }, { uid: 'kai', info: person('kai') })); // jon's invitation
      assert.deepEqual((await adminGet(`groups/${G}`)).members, ['ivy']);
    });
    await check('invitation: accepting joins atomically, marks the invitation accepted, replays and re-invites are refused, and the member can read and leave', async () => {
      const invite = { id: `${G}_${em('jon')}`, groupId: G };
      await chatOf('jon').acceptGroupInvite(invite, { uid: 'jon', info: person('jon') });
      const g = await adminGet(`groups/${G}`);
      assert.deepEqual([g.members, g.memberInfo.jon.name, g.unreadCounts.jon], [['ivy', 'jon'], 'jon', 0]);
      assert.equal((await adminGet(inviteDoc(G, 'jon'))).status, 'accepted');
      await assertFails(chatOf('jon').acceptGroupInvite(invite, { uid: 'jon', info: person('jon') })); // replay
      await assertFails(ivyChat.inviteToGroup({ id: G, name: 'Trip' }, { uid: 'ivy', name: 'Ivy' }, em('jon'))); // a decided invitation is final
      await sdk.getDocs(sdk.collection(dbOf('jon'), `groups/${G}/messages`)); // member can read
      await chatOf('jon').leaveChatGroup(G, 'jon', 'jon');
      assert.deepEqual((await adminGet(`groups/${G}`)).members, ['ivy']);
      await assertFails(sdk.getDocs(sdk.collection(dbOf('jon'), `groups/${G}/messages`))); // no access after leaving
      await assertFails(chatOf('jon').acceptGroupInvite(invite, { uid: 'jon', info: person('jon') })); // the old acceptance cannot be reused to rejoin
    });
    await check('invitation: declining is final; the sender cannot re-send over a decline', async () => {
      await ivyChat.inviteToGroup({ id: G, name: 'Trip' }, { uid: 'ivy', name: 'Ivy' }, em('kai'));
      await chatOf('kai').declineGroupInvite(`${G}_${em('kai')}`);
      await assertFails(chatOf('kai').acceptGroupInvite({ id: `${G}_${em('kai')}`, groupId: G }, { uid: 'kai', info: person('kai') }));
      await assertFails(ivyChat.inviteToGroup({ id: G, name: 'Trip' }, { uid: 'ivy', name: 'Ivy' }, em('kai')));
      assert.deepEqual((await adminGet(`groups/${G}`)).members, ['ivy']);
    });
    await check('invitation: the sender can withdraw a pending one (and send a fresh one later); the withdrawn one cannot be accepted', async () => {
      await ivyChat.inviteToGroup({ id: G, name: 'Trip' }, { uid: 'ivy', name: 'Ivy' }, em('lee'));
      await assertFails(chatOf('kai').cancelGroupInvite(`${G}_${em('lee')}`)); // not the sender
      await ivyChat.cancelGroupInvite(`${G}_${em('lee')}`);
      await assertFails(chatOf('lee').acceptGroupInvite({ id: `${G}_${em('lee')}`, groupId: G }, { uid: 'lee', info: person('lee') }));
      await ivyChat.inviteToGroup({ id: G, name: 'Trip' }, { uid: 'ivy', name: 'Ivy' }, em('lee'));
      await chatOf('lee').acceptGroupInvite({ id: `${G}_${em('lee')}`, groupId: G }, { uid: 'lee', info: person('lee') });
      assert.deepEqual((await adminGet(`groups/${G}`)).members, ['ivy', 'lee']);
    });
    await check('invitation: an expired one cannot be accepted (the sender can re-send)', async () => {
      await adminSet(inviteDoc(G, 'mia'), { groupId: G, groupName: 'Trip', inviterUid: 'ivy', inviterName: 'Ivy', inviteeEmail: em('mia'), status: 'pending', createdAt: sdk.Timestamp.now(), updatedAt: sdk.Timestamp.now(), expiresAt: sdk.Timestamp.fromMillis(Date.now() - 1000) });
      await assertFails(chatOf('mia').acceptGroupInvite({ id: `${G}_${em('mia')}`, groupId: G }, { uid: 'mia', info: person('mia') }));
      await ivyChat.inviteToGroup({ id: G, name: 'Trip' }, { uid: 'ivy', name: 'Ivy' }, em('mia')); // fresh over expired
      await chatOf('mia').acceptGroupInvite({ id: `${G}_${em('mia')}`, groupId: G }, { uid: 'mia', info: person('mia') });
      assert.ok((await adminGet(`groups/${G}`)).members.includes('mia'));
    });
    await check('invitation: blocked, suspended and Terms-less people cannot join', async () => {
      await ivyChat.inviteToGroup({ id: G, name: 'Trip' }, { uid: 'ivy', name: 'Ivy' }, em('nia'));
      await assertFails(chatOf('nia').acceptGroupInvite({ id: `${G}_${em('nia')}`, groupId: G }, { uid: 'nia', info: person('nia') })); // nia blocked ivy
      for (const u of ['sus', 'legacy']) {
        await adminSet(inviteDoc(G, u), { groupId: G, groupName: 'Trip', inviterUid: 'ivy', inviterName: 'Ivy', inviteeEmail: em(u), status: 'pending', createdAt: sdk.Timestamp.now(), updatedAt: sdk.Timestamp.now(), expiresAt: sdk.Timestamp.fromMillis(Date.now() + 3600000) });
        await assertFails(chatOf(u).acceptGroupInvite({ id: `${G}_${em(u)}`, groupId: G }, { uid: u, info: person(u) }));
      }
      assert.ok(!(await adminGet(`groups/${G}`)).members.some((m) => ['nia', 'sus', 'legacy'].includes(m)));
    });
    await check('invitation: a deleting or suspended inviter cannot send', async () => {
      await adminSet('groups/gonegrp', { name: 'G', createdBy: 'gone', members: ['gone'], memberInfo: {}, unreadCounts: {}, lastMessage: null });
      await assertFails(chatOf('gone').inviteToGroup({ id: 'gonegrp', name: 'G' }, { uid: 'gone', name: 'Gone' }, em('kai')));
      await adminSet('groups/susgrp', { name: 'G', createdBy: 'sus', members: ['sus'], memberInfo: {}, unreadCounts: {}, lastMessage: null });
      await assertFails(chatOf('sus').inviteToGroup({ id: 'susgrp', name: 'G' }, { uid: 'sus', name: 'Sus' }, em('kai')));
    });
    // ── Terms barrier ──
    const infoX = { name: 'X', initials: 'X' };
    const termsActions = {
      post: (u, t) => sdk.setDoc(sdk.doc(dbOf(u), `travelPosts/${t}`), { authorId: u, caption: 'x', body: '', location: '', country: '', likeCount: 0, commentCount: 0, saveCount: 0, visibility: 'public', isArchived: false, createdAt: sdk.serverTimestamp() }),
      comment: (u, t) => { const d = dbOf(u); const b = sdk.writeBatch(d); b.set(sdk.doc(d, `postComments/${t}`), { authorId: u, authorName: 'X', authorPhoto: null, postId: 'p', parentCommentId: null, text: 'hi', replyCount: 0, isDeleted: false, createdAt: sdk.serverTimestamp(), updatedAt: sdk.serverTimestamp() }); b.update(sdk.doc(d, 'travelPosts/p'), { commentCount: sdk.increment(1), lastCommentId: t, updatedAt: sdk.serverTimestamp() }); return b.commit(); },
      journal: (u, t) => sdk.setDoc(sdk.doc(dbOf(u), `travelJournals/${t}`), { authorId: u, title: 'T', body: 'b', likeCount: 0, commentCount: 0, saveCount: 0, visibility: 'public', isArchived: false, createdAt: sdk.serverTimestamp() }),
      publicTrip: (u, t) => sdk.setDoc(sdk.doc(dbOf(u), `publicTrips/${t}`), { ownerUid: u, title: 'T', description: '', destination: 'Rome', destinationKey: 'rome', memberCount: 1, isAcceptingMembers: true, createdAt: sdk.serverTimestamp(), updatedAt: sdk.serverTimestamp() }),
      travelGroup: (u, t) => sdk.setDoc(sdk.doc(dbOf(u), `travelGroups/${t}`), { ownerUid: u, name: 'N', description: '', visibility: 'public', memberCount: 1, createdAt: sdk.serverTimestamp(), updatedAt: sdk.serverTimestamp() }),
      tripJoinRequest: (u, t) => sdk.setDoc(sdk.doc(dbOf(u), `tripJoinRequests/${t}_${u}`), { requestId: `${t}_${u}`, tripId: t, ownerUid: 'owner', requestorUid: u, status: 'pending' }),
      groupJoinRequest: (u, t) => sdk.setDoc(sdk.doc(dbOf(u), `groupJoinRequests/${t}_${u}`), { requestId: `${t}_${u}`, groupId: t, ownerUid: 'owner', requestorUid: u, status: 'pending' }),
      activityFeed: (u, t) => sdk.setDoc(sdk.doc(dbOf(u), `activityFeed/${t}`), { feedItemId: t, type: 'trip_shared', actorUid: u, actorName: 'X', targetId: 'x', targetType: 'trip', targetTitle: 'T', visibility: 'public', createdAt: sdk.serverTimestamp() }),
      groupChat: (u) => chatOf(u).createGroup(u, 'T', infoX),
      directChat: (u, t) => chatOf(u).getOrCreateDirectChat(u, infoX, `peer-${t}`, infoX),
      directMessage: (u, t) => chatOf(u).sendDirectMessage(`${u}_peer`, u, 'hello', `m-${t}`, ['peer']),
    };
    await adminSet('users/legacy', { name: 'Old' });
    await adminSet('users/dee', { termsAcceptedVersion: TERMS, name: 'dee', profileVisibility: 'public', showInNearbyTravelers: false });
    for (const u of ['legacy', 'dee']) await adminSet(`direct_chats/${u}_peer`, { participants: [u, 'peer'].sort(), participantInfo: {}, lastMessage: null, unreadCounts: { [u]: 0, peer: 0 } });
    for (const [name, action] of Object.entries(termsActions)) {
      await check(`terms: ${name} is refused until the current Terms are accepted, and works after`, async () => {
        await assertFails(action('legacy', `tl-${name}`));
        await action('dee', `td-${name}`);
      });
    }
    await check('terms: an older accepted version does not count; acceptance, reporting and leaving a group stay open without it', async () => {
      await adminSet('users/olduser', { name: 'Older', termsAcceptedVersion: '2025-01-01' });
      await assertFails(termsActions.post('olduser', 'old-post'));
      await adminSet('groups/legacygrp', { name: 'G', createdBy: 'ivy', members: ['ivy', 'legacy'], memberInfo: {}, unreadCounts: {}, lastMessage: null });
      await chatOf('legacy').leaveChatGroup('legacygrp', 'legacy', 'Old');
      assert.deepEqual((await adminGet('groups/legacygrp')).members, ['ivy']);
      await client(FS, dbOf('legacy')).reportContent('legacy', 'user', 'ivy', 'spam', '');
      await client(FS, dbOf('legacy')).acceptTerms('legacy', TERMS);
      await termsActions.post('legacy', 'after-accept');
    });
    await check('terms: the version in the rules is the one the app asks people to accept', async () => {
      const policy = fs.readFileSync(path.join(root, 'packages/shared/src/policy.ts'), 'utf8').match(/TERMS_VERSION = '([^']+)'/)[1];
      assert.equal(policy, TERMS);
      assert.ok(fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8').includes(`get('termsAcceptedVersion', '') == '${policy}'`));
    });
    // ── Direct chats whose other participant's account was deleted ──
    await check('deleted participants: only the deletion service writes the record; messages to a chat with one are refused, history stays readable', async () => {
      await assertFails(sdk.setDoc(sdk.doc(dbOf('ivy'), 'direct_chats/ivy_kai'), { participants: ['ivy', 'kai'], participantInfo: {}, lastMessage: null, unreadCounts: { ivy: 0, kai: 0 }, deletedParticipants: [] }));
      await assertFails(sdk.setDoc(sdk.doc(dbOf('ivy'), 'direct_chats/ivy_kai'), { participants: ['ivy', 'kai'], participantInfo: {}, lastMessage: null, unreadCounts: { ivy: 0, kai: 0 }, createdBy: 'kai' }));
      await adminSet('direct_chats/dp_ivy_kai', { participants: ['ivy', 'kai'], participantInfo: {}, lastMessage: null, unreadCounts: { ivy: 0, kai: 0 }, deletedParticipants: ['kai'] });
      await adminSet('direct_chats/dp_ivy_kai/messages/old', { senderId: 'kai', text: 'bye', clientId: 'old', sentAt: sdk.Timestamp.now() });
      await assertFails(chatOf('ivy').sendDirectMessage('dp_ivy_kai', 'ivy', 'are you there', 'dp-1', ['kai']));
      await assertFails(sdk.updateDoc(sdk.doc(dbOf('ivy'), 'direct_chats/dp_ivy_kai'), { deletedParticipants: [] }));
      assert.equal((await sdk.getDocs(sdk.collection(dbOf('ivy'), 'direct_chats/dp_ivy_kai/messages'))).size, 1);
      await chatOf('ivy').markDirectChatRead('dp_ivy_kai', 'ivy');
    });
    // ── Moderating public trips and community groups ──
    const nowTs = sdk.Timestamp.now();
    await env.withSecurityRulesDisabled(async ctx => {
      const adb = ctx.firestore();
      for (const [p, data] of Object.entries({
        'publicTrips/mt1': { ownerUid: 'oli', ownerName: 'Oli', title: 'Moderated trip', description: 'd', destination: 'Rome', destinationKey: 'rome', memberCount: 3, maxMembers: 6, isAcceptingMembers: true, createdAt: nowTs, updatedAt: nowTs },
        'trips/mt1/members/oli': { uid: 'oli', role: 'owner', displayName: 'Oli' },
        'trips/mt1/members/pat': { uid: 'pat', role: 'member', displayName: 'Pat' },
        'trips/mt1/members/rae': { uid: 'rae', role: 'member', displayName: 'Rae' },
        'tripJoinRequests/mt1_zed': { requestId: 'mt1_zed', tripId: 'mt1', ownerUid: 'oli', requestorUid: 'zed', requestorName: 'Zed', status: 'pending', createdAt: nowTs },
        'travelGroups/mg1': { ownerUid: 'oli', ownerName: 'Oli', name: 'Moderated group', description: 'd', destination: 'Rome', visibility: 'public', capacity: 8, memberCount: 3, isAcceptingMembers: true, createdAt: nowTs, updatedAt: nowTs },
        'travelGroups/mg1/members/oli': { uid: 'oli', role: 'owner', displayName: 'Oli' },
        'travelGroups/mg1/members/pat': { uid: 'pat', role: 'member', displayName: 'Pat' },
        'travelGroups/mg1/members/rae': { uid: 'rae', role: 'member', displayName: 'Rae' },
        'groupJoinRequests/mg1_zed': { requestId: 'mg1_zed', groupId: 'mg1', groupName: 'Moderated group', ownerUid: 'oli', requestorUid: 'zed', requestorName: 'Zed', status: 'pending', createdAt: nowTs },
      })) await sdk.setDoc(sdk.doc(adb, p), data);
    });
    const modClient = client(MOD, modDb);
    const rawStatus = (dbx, coll, id, status, by) => sdk.updateDoc(sdk.doc(dbx, `${coll}/${id}`), { moderationStatus: status, moderatedBy: by, moderatedAt: sdk.serverTimestamp() });
    for (const [kind, coll, id, req, member] of [['trip', 'publicTrips', 'mt1', 'tripJoinRequests', 'trips'], ['group', 'travelGroups', 'mg1', 'groupJoinRequests', 'travelGroups']]) {
      await check(`moderation of a ${kind}: only moderators set the status, and only with their own id`, async () => {
        await assertFails(rawStatus(dbOf('oli'), coll, id, 'hidden', 'oli')); // the owner
        await assertFails(rawStatus(dbOf('pat'), coll, id, 'hidden', 'pat')); // a member
        await assertFails(rawStatus(modDb, coll, id, 'hidden', 'someone-else')); // forged moderator id
        await assertFails(rawStatus(modDb, coll, id, 'archived', 'mod')); // unknown status
        await assertFails(sdk.updateDoc(sdk.doc(modDb, `${coll}/${id}`), { moderationStatus: 'hidden', moderatedBy: 'mod', moderatedAt: sdk.serverTimestamp(), description: 'edited by a moderator' }));
        await modClient.setItemModeration(kind, id, 'mod', 'hidden');
        assert.equal((await adminGet(`${coll}/${id}`)).moderationStatus, 'hidden');
      });
      await check(`moderation of a ${kind}: while hidden the owner cannot edit, restore, delete or recreate it`, async () => {
        const o = dbOf('oli');
        await assertFails(sdk.updateDoc(sdk.doc(o, `${coll}/${id}`), { description: 'still editing', updatedAt: sdk.serverTimestamp() }));
        await assertFails(rawStatus(o, coll, id, 'visible', 'oli'));
        await assertFails(sdk.updateDoc(sdk.doc(o, `${coll}/${id}`), { moderationStatus: 'visible' }));
        await assertFails(sdk.updateDoc(sdk.doc(o, `${coll}/${id}`), { moderationStatus: sdk.deleteField(), updatedAt: sdk.serverTimestamp() }));
        await assertFails(sdk.deleteDoc(sdk.doc(o, `${coll}/${id}`)));
        await assertFails(sdk.setDoc(sdk.doc(o, `${coll}/${id}`), { ownerUid: 'oli', title: 'fresh', name: 'fresh', description: '', visibility: 'public', destination: 'Rome', memberCount: 1, createdAt: sdk.serverTimestamp(), updatedAt: sdk.serverTimestamp() }));
        assert.equal((await adminGet(`${coll}/${id}`)).moderationStatus, 'hidden');
      });
      await check(`moderation of a ${kind}: while hidden it takes no new requests and the owner cannot approve one`, async () => {
        await assertFails(termsActions[kind === 'trip' ? 'tripJoinRequest' : 'groupJoinRequest']('quentin', id));
        const od = dbOf('oli');
        const b = sdk.writeBatch(od);
        b.update(sdk.doc(od, `${req}/${id}_zed`), { status: 'approved', updatedAt: sdk.serverTimestamp() });
        b.set(sdk.doc(od, `${member}/${id}/members/zed`), { uid: 'zed', displayName: 'Zed', photoURL: null, role: 'member', joinedAt: sdk.serverTimestamp() });
        b.update(sdk.doc(od, `${coll}/${id}`), { memberCount: sdk.increment(1), updatedAt: sdk.serverTimestamp() });
        await assertFails(b.commit());
      });
      await check(`moderation of a ${kind}: members can still leave and anyone can still report while hidden`, async () => {
        const fsClient = client(FS, dbOf('pat'));
        await (kind === 'trip' ? fsClient.leavePublicTrip(id, 'pat') : fsClient.leaveGroup(id, 'pat'));
        assert.equal((await adminGet(`${coll}/${id}`)).memberCount, 2);
        await fsClient.reportContent('pat', kind, id, 'safety', 'seen this while hidden');
        assert.ok(await adminGet(`reports/${kind}___${id}___pat`));
      });
      await check(`moderation of a ${kind}: the discovery filter leaves it out; removed stays removed; restoring brings it back and the owner can edit again`, async () => {
        const qd = dbOf('quentin');
        const listed = await sdk.getDocs(kind === 'group' ? sdk.query(sdk.collection(qd, coll), sdk.where('visibility', '==', 'public')) : sdk.collection(qd, coll));
        const asApp = listed.docs.map((d) => ({ id: d.id, moderationStatus: d.data().moderationStatus })).filter((x) => loadShared().isListed(x));
        assert.ok(!asApp.some((x) => x.id === id), 'hidden item filtered');
        await modClient.setItemModeration(kind, id, 'mod', 'removed');
        await assertFails(rawStatus(dbOf('oli'), coll, id, 'visible', 'oli'));
        await modClient.setItemModeration(kind, id, 'mod', 'visible');
        await sdk.updateDoc(sdk.doc(dbOf('oli'), `${coll}/${id}`), { description: 'edited after restore', updatedAt: sdk.serverTimestamp() });
        await termsActions[kind === 'trip' ? 'tripJoinRequest' : 'groupJoinRequest']('quentin', id);
        assert.ok(await adminGet(`${req}/${id}_quentin`), 'requests are accepted again once visible');
      });
    }
    await check('community group: a join request goes through the app function, and is refused when either side blocked the other', async () => {
      const asQuentin = client(FS, dbOf('quentin'));
      await adminSet('travelGroups/mg2', { ownerUid: 'oli', ownerName: 'Oli', name: 'Open group', description: 'd', destination: 'Rome', visibility: 'public', capacity: 8, memberCount: 1, isAcceptingMembers: true, createdAt: nowTs, updatedAt: nowTs });
      await asQuentin.submitGroupJoinRequest('mg2', 'Open group', 'oli', { id: 'quentin', name: 'Quentin', photoURL: null, bio: '' }, 'hello');
      assert.equal((await adminGet('groupJoinRequests/mg2_quentin')).status, 'pending');
      await adminSet('blocks/oli/blocked/nia', { blockedUid: 'nia' });
      await assertFails(client(FS, dbOf('nia')).submitGroupJoinRequest('mg2', 'Open group', 'oli', { id: 'nia', name: 'Nia', photoURL: null, bio: '' }, 'hi')); // the organizer blocked nia
      await adminSet('blocks/pat/blocked/oli', { blockedUid: 'oli' });
      await assertFails(client(FS, dbOf('pat')).submitGroupJoinRequest('mg2', 'Open group', 'oli', { id: 'pat', name: 'Pat', photoURL: null, bio: '' }, 'hi')); // pat blocked the organizer
    });
    await check('rejoining: leaving ends the approved request so the person can ask again; a current member cannot cancel an approved request; rejected stays final (trip and group)', async () => {
      // Trip: pat joins (approved), is still a member: cannot cancel; leaves through the app: request cancelled; asks again; organizer approves again.
      const zedClient = client(FS, dbOf('zed'));
      await adminSet('publicTrips/rj1', { ownerUid: 'oli', ownerName: 'Oli', title: 'Rejoin trip', description: 'd', destination: 'Rome', destinationKey: 'rome', memberCount: 2, maxMembers: 6, isAcceptingMembers: true, createdAt: nowTs, updatedAt: nowTs });
      await adminSet('trips/rj1/members/oli', { uid: 'oli', role: 'owner', displayName: 'Oli' });
      await adminSet('trips/rj1/members/zed', { uid: 'zed', role: 'member', displayName: 'Zed' });
      await adminSet('tripJoinRequests/rj1_zed', { requestId: 'rj1_zed', tripId: 'rj1', ownerUid: 'oli', requestorUid: 'zed', requestorName: 'Zed', status: 'approved', createdAt: nowTs });
      await assertFails(sdk.updateDoc(sdk.doc(dbOf('zed'), 'tripJoinRequests/rj1_zed'), { status: 'cancelled', updatedAt: sdk.serverTimestamp() })); // still a member
      await zedClient.leavePublicTrip('rj1', 'zed');
      assert.equal((await adminGet('tripJoinRequests/rj1_zed')).status, 'cancelled');
      assert.equal((await adminGet('publicTrips/rj1')).memberCount, 1);
      await zedClient.submitTripJoinRequest('rj1', { ownerUid: 'oli', destination: 'Rome', title: 'Rejoin trip' }, { id: 'zed', name: 'Zed', photoURL: null, bio: '' }, 'back again');
      assert.equal((await adminGet('tripJoinRequests/rj1_zed')).status, 'pending');
      // Older data: left before leaving cancelled the request. The stale approved request is closed, then a new one is sent.
      await adminSet('tripJoinRequests/rj1_zed', { requestId: 'rj1_zed', tripId: 'rj1', ownerUid: 'oli', requestorUid: 'zed', requestorName: 'Zed', status: 'approved', createdAt: nowTs });
      await env.withSecurityRulesDisabled((ctx) => sdk.deleteDoc(sdk.doc(ctx.firestore(), 'trips/rj1/members/zed')));
      await zedClient.submitTripJoinRequest('rj1', { ownerUid: 'oli', destination: 'Rome', title: 'Rejoin trip' }, { id: 'zed', name: 'Zed', photoURL: null, bio: '' }, 'again');
      assert.equal((await adminGet('tripJoinRequests/rj1_zed')).status, 'pending');
      // Group: same shape, and a rejection is final.
      await adminSet('travelGroups/rj2', { ownerUid: 'oli', ownerName: 'Oli', name: 'Rejoin group', description: 'd', destination: 'Rome', visibility: 'public', capacity: 8, memberCount: 2, isAcceptingMembers: true, createdAt: nowTs, updatedAt: nowTs });
      await adminSet('travelGroups/rj2/members/oli', { uid: 'oli', role: 'owner', displayName: 'Oli' });
      await adminSet('travelGroups/rj2/members/zed', { uid: 'zed', role: 'member', displayName: 'Zed' });
      await adminSet('groupJoinRequests/rj2_zed', { requestId: 'rj2_zed', groupId: 'rj2', groupName: 'Rejoin group', ownerUid: 'oli', requestorUid: 'zed', requestorName: 'Zed', status: 'approved', createdAt: nowTs });
      await assertFails(sdk.updateDoc(sdk.doc(dbOf('zed'), 'groupJoinRequests/rj2_zed'), { status: 'cancelled', updatedAt: sdk.serverTimestamp() }));
      await zedClient.leaveGroup('rj2', 'zed');
      assert.equal((await adminGet('groupJoinRequests/rj2_zed')).status, 'cancelled');
      await zedClient.submitGroupJoinRequest('rj2', 'Rejoin group', 'oli', { id: 'zed', name: 'Zed', photoURL: null, bio: '' }, 'back again');
      assert.equal((await adminGet('groupJoinRequests/rj2_zed')).status, 'pending');
      await adminSet('groupJoinRequests/rj3_zed', { requestId: 'rj3_zed', groupId: 'rj2', groupName: 'Rejoin group', ownerUid: 'oli', requestorUid: 'zed', requestorName: 'Zed', status: 'rejected', createdAt: nowTs });
      await assertFails(sdk.updateDoc(sdk.doc(dbOf('zed'), 'groupJoinRequests/rj3_zed'), { status: 'cancelled', updatedAt: sdk.serverTimestamp() }));
      await assertFails(sdk.updateDoc(sdk.doc(dbOf('zed'), 'groupJoinRequests/rj3_zed'), { status: 'pending', updatedAt: sdk.serverTimestamp() }));
    });
    await check('leave trip: retries, a second tap racing the first, and the organizer; the count falls exactly once', async () => {
      const rae = client(FS, dbOf('rae'));
      const before = (await adminGet('publicTrips/mt1')).memberCount;
      const outcomes = await Promise.allSettled([rae.leavePublicTrip('mt1', 'rae'), rae.leavePublicTrip('mt1', 'rae')]);
      assert.ok(outcomes.every((o) => o.status === 'fulfilled'), 'both calls report success');
      await rae.leavePublicTrip('mt1', 'rae'); // lost-acknowledgement retry
      assert.equal((await adminGet('publicTrips/mt1')).memberCount, before - 1);
      assert.equal(await adminGet('trips/mt1/members/rae'), undefined, 'no access left: the member document is gone');
      await assert.rejects(client(FS, dbOf('oli')).leavePublicTrip('mt1', 'oli'), (e) => e.code === 'community/organizer-cannot-leave'); // the organizer cannot leave
      assert.ok(await adminGet('trips/mt1/members/oli'));
    });
    await check('leave community group: retries, a racing second tap and the owner; the count falls exactly once; access ends', async () => {
      const rae = client(FS, dbOf('rae'));
      const before = (await adminGet('travelGroups/mg1')).memberCount;
      const outcomes = await Promise.allSettled([rae.leaveGroup('mg1', 'rae'), rae.leaveGroup('mg1', 'rae')]);
      assert.ok(outcomes.every((o) => o.status === 'fulfilled'));
      await rae.leaveGroup('mg1', 'rae');
      assert.equal((await adminGet('travelGroups/mg1')).memberCount, before - 1);
      assert.equal(await adminGet('travelGroups/mg1/members/rae'), undefined);
      await assert.rejects(client(FS, dbOf('oli')).leaveGroup('mg1', 'oli'), (e) => e.code === 'community/organizer-cannot-leave'); // the owner cannot leave
      assert.ok(await adminGet('travelGroups/mg1/members/oli'));
      await assertFails(sdk.updateDoc(sdk.doc(dbOf('quentin'), 'travelGroups/mg1'), { memberCount: sdk.increment(-1), updatedAt: sdk.serverTimestamp() })); // a stranger cannot lower the count
    });
    await check('trip availability: gone, unavailable and available', async () => {
      const fsClient = client(FS, dbOf('quentin'));
      assert.equal(await fsClient.getTripAvailability('mt1'), 'available');
      assert.equal(await fsClient.getTripAvailability('does-not-exist'), 'gone');
      await modClient.setItemModeration('trip', 'mt1', 'mod', 'hidden');
      assert.equal(await fsClient.getTripAvailability('mt1'), 'unavailable');
      await modClient.setItemModeration('trip', 'mt1', 'mod', 'visible');
    });
    // ── Lifting a suspension ──
    await check('lift suspension: moderators only, not for an account being deleted, and not by a suspended moderator', async () => {
      await env.withSecurityRulesDisabled(async ctx => {
        const adb = ctx.firestore();
        for (const [p, data] of Object.entries({
          'accountSuspensions/lift1': { suspendedBy: 'mod', reason: 'x', createdAt: sdk.Timestamp.now() },
          'accountSuspensions/lift2': { suspendedBy: 'mod', reason: 'x', createdAt: sdk.Timestamp.now() },
          'accountSuspensions/gone': { suspendedBy: 'mod', reason: 'x', createdAt: sdk.Timestamp.now() },
          'moderators/mod2': { grantedBy: 'owner-console' },
          'accountSuspensions/mod2': { suspendedBy: 'mod', reason: 'x', createdAt: sdk.Timestamp.now() },
        })) await sdk.setDoc(sdk.doc(adb, p), data);
      });
      await assertFails(client(MOD, dbOf('oli')).unsuspendUser('lift1')); // not a moderator
      await assertFails(client(MOD, dbOf('lift1')).unsuspendUser('lift1')); // not a self-service lift
      await assertFails(modClient.unsuspendUser('gone')); // being deleted
      await assertFails(client(MOD, dbOf('mod2')).unsuspendUser('lift2')); // the moderator is suspended
      assert.ok(await adminGet('accountSuspensions/lift2'));
      await modClient.unsuspendUser('lift1');
      assert.equal(await adminGet('accountSuspensions/lift1'), undefined);
      const listed = await sdk.getDocs(sdk.collection(modDb, 'accountSuspensions'));
      assert.ok(listed.size >= 2, 'moderators can list suspensions');
      await assertFails(sdk.getDocs(sdk.collection(dbOf('oli'), 'accountSuspensions')));
      await assertFails(sdk.getDoc(sdk.doc(dbOf('oli'), 'accountSuspensions/lift2'))); // not another account's
      await sdk.getDoc(sdk.doc(dbOf('lift2'), 'accountSuspensions/lift2')); // your own
    });
    // ── Discovery consent after a suspension ──
    await check('discovery consent: an opt-in with no record behind it is switched off once the suspension is gone; never republished', async () => {
      await adminSet('users/dee', { termsAcceptedVersion: TERMS, name: 'dee', profileVisibility: 'public', showInNearbyTravelers: true, shareCompatibility: false });
      const deeFs = client(FS, dbOf('dee'));
      await adminSet('accountSuspensions/dee', { suspendedBy: 'mod', reason: 'x', createdAt: sdk.Timestamp.now() });
      assert.equal(await deeFs.reconcileDiscoveryConsent('dee', { showInNearbyTravelers: true }), false, 'still suspended: nothing changes');
      assert.equal((await adminGet('users/dee')).showInNearbyTravelers, true);
      await modClient.unsuspendUser('dee');
      assert.equal(await deeFs.reconcileDiscoveryConsent('dee', { showInNearbyTravelers: false }), false, 'not opted in: nothing to do');
      assert.equal(await deeFs.reconcileDiscoveryConsent('dee', { showInNearbyTravelers: true }), true);
      assert.equal((await adminGet('users/dee')).showInNearbyTravelers, false);
      assert.equal(await adminGet('nearbyTravelers/dee'), undefined, 'no record was written');
      // A record that exists means consent is in effect: leave it alone.
      await adminSet('users/dee', { termsAcceptedVersion: TERMS, name: 'dee', profileVisibility: 'public', showInNearbyTravelers: true, shareCompatibility: false });
      await adminSet('nearbyTravelers/dee', { uid: 'dee', displayName: 'dee', photoURL: null, currentCity: '', travelStyles: [], interests: [], languages: [], travelPace: null, travelSchedule: null, groupSizePreference: null, destination: null, destinationKey: null, destinationStartDate: null, destinationEndDate: null, updatedAt: sdk.Timestamp.now() });
      assert.equal(await deeFs.reconcileDiscoveryConsent('dee', { showInNearbyTravelers: true }), false);
      assert.equal((await adminGet('users/dee')).showInNearbyTravelers, true);
    });
    // ── Verified e-mail ownership for invitations (2026-10-20) ──
    const withClaims = (uid, claims) => env.authenticatedContext(uid, claims).firestore();
    const chatWith = (uid, claims) => client('packages/firebase/src/chat.ts', withClaims(uid, claims));
    for (const u of ['vic', 'mal', 'nora', 'sam2', 'ina']) await adminSet(`users/${u}`, { termsAcceptedVersion: TERMS, name: u });
    await adminSet('users/ina', { termsAcceptedVersion: TERMS, name: 'ina' });
    let V; // group used below
    await check('invitation e-mail ownership: an unverified token carrying the invited address cannot read, list, accept or decline; a verified one can', async () => {
      V = await chatOf('ivy').createGroup('ivy', 'Verified group', person('ivy'));
      await chatOf('ivy').inviteToGroup({ id: V, name: 'Verified group' }, { uid: 'ivy', name: 'Ivy' }, 'vic@example.test');
      const id = `${V}_vic@example.test`;
      for (const [label, claims] of [['unverified', { email: 'vic@example.test', email_verified: false }], ['no claim', { email: 'vic@example.test' }]]) {
        const d = withClaims('mal', claims);
        await assertFails(sdk.getDoc(sdk.doc(d, `groupInvites/${id}`)));
        await assertFails(sdk.getDocs(sdk.query(sdk.collection(d, 'groupInvites'), sdk.where('inviteeEmail', '==', 'vic@example.test'), sdk.where('status', '==', 'pending'))));
        await assertFails(chatWith('mal', claims).declineGroupInvite(id));
        await assertFails(chatWith('mal', claims).acceptGroupInvite({ id, groupId: V }, { uid: 'mal', info: person('mal') }));
      }
      assert.deepEqual((await adminGet(`groups/${V}`)).members, ['ivy'], 'the impostor did not join');
      assert.equal((await adminGet(`groupInvites/${id}`)).status, 'pending', 'and did not decide the invitation');
      const ok = { email: 'vic@example.test', email_verified: true };
      assert.equal((await sdk.getDocs(sdk.query(sdk.collection(withClaims('vic', ok), 'groupInvites'), sdk.where('inviteeEmail', '==', 'vic@example.test'), sdk.where('status', '==', 'pending')))).size, 1);
      await chatWith('vic', ok).acceptGroupInvite({ id, groupId: V }, { uid: 'vic', info: person('vic') });
      assert.deepEqual((await adminGet(`groups/${V}`)).members, ['ivy', 'vic']);
    });
    await check('invitation e-mail ownership: the inviter keeps access and cancellation without any verification', async () => {
      const unverifiedInviter = { email: 'ivy@example.test', email_verified: false };
      await chatWith('ivy', unverifiedInviter).inviteToGroup({ id: V, name: 'Verified group' }, { uid: 'ivy', name: 'Ivy' }, 'nora@example.test');
      const sent = await sdk.getDocs(sdk.query(sdk.collection(withClaims('ivy', unverifiedInviter), 'groupInvites'), sdk.where('inviterUid', '==', 'ivy'), sdk.where('groupId', '==', V)));
      assert.ok(sent.size >= 2);
      await chatWith('ivy', unverifiedInviter).cancelGroupInvite(`${V}_nora@example.test`);
      assert.equal((await adminGet(`groupInvites/${V}_nora@example.test`)).status, 'cancelled');
    });
    await check('invitation e-mail ownership: a verified token for a different address cannot touch the invitation', async () => {
      await chatOf('ivy').inviteToGroup({ id: V, name: 'Verified group' }, { uid: 'ivy', name: 'Ivy' }, 'sam2@example.test');
      const id = `${V}_sam2@example.test`;
      const other = { email: 'mal@example.test', email_verified: true };
      await assertFails(sdk.getDoc(sdk.doc(withClaims('mal', other), `groupInvites/${id}`)));
      await assertFails(chatWith('mal', other).acceptGroupInvite({ id, groupId: V }, { uid: 'mal', info: person('mal') }));
      await assertFails(chatWith('mal', other).declineGroupInvite(id));
    });
    const verified = (uid) => ({ email: `${uid}@example.test`, email_verified: true });
    await check('invitation acceptance is refused when the inviter is suspended or deleting, or the group was removed (declining stays possible)', async () => {
      for (const [who, setup, label] of [['sus3', () => adminSet('accountSuspensions/sus3', { suspendedBy: 'mod', reason: 'x', createdAt: sdk.Timestamp.now() }), 'suspended'],
        ['del3', () => adminSet('accountDeletions/del3', { uid: 'del3', status: 'in_progress' }), 'deleting']]) {
        await adminSet(`users/${who}`, { termsAcceptedVersion: TERMS, name: who });
        await adminSet(`groups/g-${who}`, { name: `G ${who}`, createdBy: who, members: [who], memberInfo: { [who]: person(who) }, unreadCounts: { [who]: 0 }, lastMessage: null });
        const inviteId = `g-${who}_ina@example.test`;
        await adminSet(`groupInvites/${inviteId}`, { groupId: `g-${who}`, groupName: `G ${who}`, inviterUid: who, inviterName: who, inviteeEmail: 'ina@example.test', status: 'pending', createdAt: sdk.Timestamp.now(), updatedAt: sdk.Timestamp.now(), expiresAt: sdk.Timestamp.fromMillis(Date.now() + 3600000) });
        await setup();
        await assertFails(chatWith('ina', verified('ina')).acceptGroupInvite({ id: inviteId, groupId: `g-${who}` }, { uid: 'ina', info: person('ina') }));
        assert.ok(!(await adminGet(`groups/g-${who}`)).members.includes('ina'), `inviter ${label}`);
        await chatWith('ina', verified('ina')).declineGroupInvite(inviteId);
      }
      await adminSet('groups/g-gone', { name: 'Removed', createdBy: 'ivy', members: ['ivy'], memberInfo: {}, unreadCounts: {}, lastMessage: null });
      await adminSet('groupInvites/g-gone_ina@example.test', { groupId: 'g-gone', groupName: 'Removed', inviterUid: 'ivy', inviterName: 'Ivy', inviteeEmail: 'ina@example.test', status: 'pending', createdAt: sdk.Timestamp.now(), updatedAt: sdk.Timestamp.now(), expiresAt: sdk.Timestamp.fromMillis(Date.now() + 3600000) });
      await env.withSecurityRulesDisabled((ctx) => sdk.deleteDoc(sdk.doc(ctx.firestore(), 'groups/g-gone')));
      await assertFails(chatWith('ina', verified('ina')).acceptGroupInvite({ id: 'g-gone_ina@example.test', groupId: 'g-gone' }, { uid: 'ina', info: person('ina') }));
      assert.equal((await adminGet('groupInvites/g-gone_ina@example.test')).status, 'pending', 'the invitation is not marked accepted for a removed group');
    });
    console.log(`${checks} release rule checks passed`);
  } finally { await env.cleanup(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
