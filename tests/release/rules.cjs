const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const assert = require('node:assert/strict');
const { initializeTestEnvironment, assertFails } = require('@firebase/rules-unit-testing');
const sdk = require('firebase/firestore');
const root = path.resolve(__dirname, '../..');
function client(file, db) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const dependencies = name => {
    if (name === 'firebase/firestore') return { ...sdk, initializeFirestore:()=>db, getFirestore:()=>db };
    if (name === './config') return { app:{} };
    if (name === '@solotravelsoul/shared') return { DEFAULT_USER_PROFILE:{} };
    if (name === './firestore') return { db };
    if (name === './auth') return { auth: { currentUser: { uid: 'actor' } } };
    throw Error(`Unexpected dependency: ${name}`);
  };
  new Function('module', 'exports', 'require', code)(module, module.exports, dependencies);
  return module.exports;
}
(async () => {
  const env = await initializeTestEnvironment({ projectId: 'demo-sts-release-review', firestore: { host: '127.0.0.1', port: 8188, rules: fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8') } });
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
    await env.withSecurityRulesDisabled(ctx => sdk.setDoc(sdk.doc(ctx.firestore(), 'blocks/owner/blocked/actor'), {}));
    await check('blocked sender cannot send', () => assertFails(chat.sendDirectMessage('chat', 'actor', 'Blocked', 'blocked', ['owner'])));
    console.log(`${checks} release rule checks passed`);
  } finally { await env.cleanup(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
