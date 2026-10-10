/* global __dirname */
// Emulator tests for scripts/cleanupCommunityDemo.ts (run inside `firebase emulators:exec`, see npm run test:rules).
// Proves: dry run by default, project/approval guards, no deletion of unmarked messages, parents with
// non-demo or nested children are skipped (no orphans), the protected (shared) account and its data
// survive, and any change after planning aborts the apply with nothing deleted.
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');

const PROJECT = 'demo-sts-release-review';
const ROOT = path.resolve(__dirname, '../..');
const HOST = process.env.FIRESTORE_EMULATOR_HOST;
if (!HOST) { console.error('FIRESTORE_EMULATOR_HOST is not set (run via npm run test:rules)'); process.exit(1); }

const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
initializeApp({ projectId: PROJECT });
const db = getFirestore();

const SHARED = 'sharedAccountUid000000000001'; // the account used by both apps
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sts-demo-cleanup-'));
const protectFile = path.join(tmp, 'protect.json');
fs.writeFileSync(protectFile, JSON.stringify({ uids: [SHARED] }));

function cli(args) {
  const r = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['tsx', 'scripts/cleanupCommunityDemo.ts', ...args], {
    cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32', env: { ...process.env, FIRESTORE_EMULATOR_HOST: HOST },
  });
  return { status: r.status, out: r.stdout + r.stderr };
}
const exists = async (p) => (await db.doc(p).get()).exists;
const sha = (f) => require('crypto').createHash('sha256').update(fs.readFileSync(f)).digest('hex');

async function seed() {
  await fetch(`http://${HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  const w = (p, d) => db.doc(p).set(d);
  // Deletable: demo roots whose children are all demo.
  await w('publicProfiles/demoA', { demo: true, uid: 'demoA' });
  await w('direct_chats/dcDemo', { demo: true, participants: ['demoA', 'demoB'] });
  await w('direct_chats/dcDemo/messages/m1', { demo: true, text: 'hi' });
  await w('direct_chats/dcDemo/messages/m2', { demo: true, text: 'yo' });
  await w('travelGroups/tgDemo', { demo: true, ownerUid: 'demoA', memberCount: 40 });
  await w('travelGroups/tgDemo/members/demoA', { demo: true });
  // Must survive: demo root with an unmarked (real) message -> whole root skipped, nothing orphaned.
  await w('direct_chats/dcMixed', { demo: true, participants: ['demoA', 'demoC'] });
  await w('direct_chats/dcMixed/messages/demoMsg', { demo: true, text: 'seed' });
  await w('direct_chats/dcMixed/messages/realMsg', { text: 'real message without demo flag' });
  // Must survive: demo root with only unmarked messages (the old script deleted these as a fallback).
  await w('groups/gUnmarked', { demo: true, members: ['demoA'] });
  await w('groups/gUnmarked/messages/u1', { text: 'unmarked' });
  // Must survive: demo docs that reference the shared account (array, map key, plain field).
  await w('groups/gShared', { demo: true, members: [SHARED, 'demoA'], memberInfo: { [SHARED]: { name: 'x' } } });
  await w('groups/gShared/messages/s1', { demo: true, text: 'seed' });
  await w('groupJoinRequests/jrShared', { demo: true, ownerUid: SHARED });
  await w('direct_chats/dcSharedChild', { demo: true, participants: ['demoA', 'demoD'] });
  await w('direct_chats/dcSharedChild/messages/sx', { demo: true, senderId: SHARED });
  // Must survive: nested subcollection under a demo child.
  await w('groups/gNested', { demo: true, members: ['demoA'] });
  await w('groups/gNested/messages/n1', { demo: true });
  await w('groups/gNested/messages/n1/reactions/r1', { demo: true });
  // Must survive: the shared account's own data and other non-demo data.
  await w(`users/${SHARED}`, { name: 'Shared' });
  await w(`users/${SHARED}/trips/t1`, { destination: 'Lisbon' });
  await w(`publicProfiles/${SHARED}`, { uid: SHARED });
  await w('activityFeed/real1', { actorUid: SHARED });
}

const SURVIVORS = ['direct_chats/dcMixed', 'direct_chats/dcMixed/messages/demoMsg', 'direct_chats/dcMixed/messages/realMsg',
  'groups/gUnmarked', 'groups/gUnmarked/messages/u1', 'groups/gShared', 'groups/gShared/messages/s1', 'groupJoinRequests/jrShared',
  'direct_chats/dcSharedChild', 'direct_chats/dcSharedChild/messages/sx', 'groups/gNested', 'groups/gNested/messages/n1',
  'groups/gNested/messages/n1/reactions/r1', `users/${SHARED}`, `users/${SHARED}/trips/t1`, `publicProfiles/${SHARED}`, 'activityFeed/real1'];
const DELETABLE = ['publicProfiles/demoA', 'direct_chats/dcDemo', 'direct_chats/dcDemo/messages/m1', 'direct_chats/dcDemo/messages/m2',
  'travelGroups/tgDemo', 'travelGroups/tgDemo/members/demoA'];

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('dry run is the default: writes a manifest, deletes nothing, reports distinct root/subcollection counts and skip reasons', async () => {
  await seed();
  const mf = path.join(tmp, 'm1.json');
  const r = cli(['--project', PROJECT, '--plan', mf, '--protect', protectFile]);
  assert.equal(r.status, 0, r.out);
  const report = JSON.parse(r.out.trim().split('\n').pop());
  assert.equal(report.mode, 'dry-run (nothing deleted)');
  assert.deepEqual(report.wouldDelete.roots, { publicProfiles: 1, travelGroups: 1, direct_chats: 1 });
  assert.deepEqual(report.wouldDelete.subcollections, { 'direct_chats/*/messages': 2, 'travelGroups/*/members': 1 });
  assert.equal(report.wouldDelete.total, 6);
  assert.deepEqual(report.skippedRoots, { 'non-demo child in messages': 2, 'references a protected account': 3, 'nested subcollection under messages': 1 });
  for (const p of [...DELETABLE, ...SURVIVORS]) assert.ok(await exists(p), `dry run must not delete ${p}`);
  assert.ok(!r.out.includes(SHARED), 'protected uid is not printed');
});

test('apply refuses without approval, with a wrong hash, and for another project', async () => {
  await seed();
  const mf = path.join(tmp, 'm2.json');
  assert.equal(cli(['--project', PROJECT, '--plan', mf, '--protect', protectFile]).status, 0);
  assert.notEqual(cli(['--project', PROJECT, '--apply', '--manifest', mf]).status, 0);
  assert.notEqual(cli(['--project', PROJECT, '--apply', '--manifest', mf, '--approve', '0'.repeat(64)]).status, 0);
  assert.notEqual(cli(['--project', 'other-project', '--apply', '--manifest', mf, '--approve', sha(mf)]).status, 0);
  assert.notEqual(cli(['--apply', '--manifest', mf, '--approve', sha(mf)]).status, 0, 'no --project');
  for (const p of DELETABLE) assert.ok(await exists(p), `refused apply must not delete ${p}`);
});

test('a changed item after planning aborts the apply with nothing deleted', async () => {
  await seed();
  const mf = path.join(tmp, 'm3.json');
  assert.equal(cli(['--project', PROJECT, '--plan', mf, '--protect', protectFile]).status, 0);
  await db.doc('publicProfiles/demoA').update({ touched: true });
  const r = cli(['--project', PROJECT, '--apply', '--manifest', mf, '--approve', sha(mf)]);
  assert.notEqual(r.status, 0);
  assert.match(r.out, /nothing deleted/);
  for (const p of DELETABLE) assert.ok(await exists(p), `aborted apply must not delete ${p}`);
});

test('a new child under a planned parent aborts the apply with nothing deleted', async () => {
  await seed();
  const mf = path.join(tmp, 'm4.json');
  assert.equal(cli(['--project', PROJECT, '--plan', mf, '--protect', protectFile]).status, 0);
  await db.doc('direct_chats/dcDemo/messages/late').set({ text: 'real reply after planning' });
  const r = cli(['--project', PROJECT, '--apply', '--manifest', mf, '--approve', sha(mf)]);
  assert.notEqual(r.status, 0);
  for (const p of [...DELETABLE, 'direct_chats/dcDemo/messages/late']) assert.ok(await exists(p), `aborted apply must not delete ${p}`);
});

test('approved apply deletes exactly the manifest; unmarked messages and shared-account data survive', async () => {
  await seed();
  const mf = path.join(tmp, 'm5.json');
  assert.equal(cli(['--project', PROJECT, '--plan', mf, '--protect', protectFile]).status, 0);
  const r = cli(['--project', PROJECT, '--apply', '--manifest', mf, '--approve', sha(mf)]);
  assert.equal(r.status, 0, r.out);
  assert.equal(JSON.parse(r.out.trim().split('\n').pop()).deleted, 6);
  for (const p of DELETABLE) assert.ok(!(await exists(p)), `${p} should be deleted`);
  for (const p of SURVIVORS) assert.ok(await exists(p), `${p} must survive`);
});

(async () => {
  let passed = 0;
  for (const t of tests) {
    try { await t.fn(); passed++; console.log(`PASS ${t.name}`); } catch (e) { console.error(`FAIL ${t.name}\n`, e); process.exitCode = 1; }
  }
  console.log(`${passed}/${tests.length} demo cleanup checks passed`);
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(process.exitCode || 0);
})();
