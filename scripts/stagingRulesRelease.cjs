#!/usr/bin/env node
// STAGING ONLY. Shows the Firestore rules release of the staging project, or points it back at an earlier ruleset
// (rollback). Rulesets are immutable and stay available, so re-pointing the release restores the old rules at once.
//
//   node scripts/stagingRulesRelease.cjs                       # print the current release and ruleset
//   node scripts/stagingRulesRelease.cjs <rulesetId>           # point the staging release at that ruleset
//
// Uses the Firebase CLI login already on this machine (in memory only); never prints tokens. Refuses any project other
// than solotravelsoul-staging.
const path = require('path');
const PROJECT = 'solotravelsoul-staging';
const ft = path.join(process.env.APPDATA ?? '', 'npm/node_modules/firebase-tools/lib');
const auth = require(path.join(ft, 'auth.js'));
const { configstore } = require(path.join(ft, 'configstore.js'));

(async () => {
  const refresh = configstore.get('tokens')?.refresh_token;
  if (!refresh) throw new Error('no Firebase CLI credentials: run `firebase login`');
  const token = (await auth.getAccessToken(refresh, [])).access_token;
  const call = async (method, url, body) => {
    const r = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, json: await r.json().catch(() => ({})) };
  };
  const releaseUrl = `https://firebaserules.googleapis.com/v1/projects/${PROJECT}/releases/cloud.firestore`;
  const current = await call('GET', releaseUrl);
  console.log(`${PROJECT} release -> ${current.json.rulesetName} (updated ${current.json.updateTime})`);
  const target = process.argv[2];
  if (!target) return;
  if (!/^[0-9a-f-]{36}$/.test(target)) throw new Error('rulesetId must be a ruleset UUID');
  const rulesetName = `projects/${PROJECT}/rulesets/${target}`;
  const exists = await call('GET', `https://firebaserules.googleapis.com/v1/${rulesetName}`);
  if (exists.status !== 200) throw new Error(`ruleset not found in ${PROJECT}`);
  const done = await call('PATCH', releaseUrl, { release: { name: `projects/${PROJECT}/releases/cloud.firestore`, rulesetName } });
  console.log(done.status === 200 ? `release now -> ${done.json.rulesetName}` : `failed (${done.status})`);
  if (done.status !== 200) process.exitCode = 1;
})().catch((error) => { console.error(String(error.message).slice(0, 300)); process.exit(1); });
