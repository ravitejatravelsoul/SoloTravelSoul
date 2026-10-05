#!/usr/bin/env node
// Verifies the staging configuration cannot reach production before any
// staging deploy or build. Never prints configuration values.
//
//   npm run check:staging                         # repo config (.firebaserc + wrangler.toml)
//   npm run check:staging -- --eas-env <file>     # plus an `eas env:pull --environment preview` file
//   npm run check:staging -- --eas-env <file> --firebase-metadata <file>
//        # plus resource ownership: the metadata is the staging web app's SDK
//        # config fetched from Firebase for the staging project, e.g.
//        # `firebase apps:sdkconfig WEB <appId> --project staging --json`
//
// Exit codes: 0 = verified, 1 = a check failed, 2 = configuration checks passed
// but resource ownership could not be verified (BLOCKED — not isolated yet).
//   node scripts/checkStagingIsolation.cjs --root <dir>   # used by tests with fixture configs
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const args = process.argv.slice(2);
const argValue = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
const root = path.resolve(argValue('--root') ?? path.join(__dirname, '..'));
const repo = path.join(__dirname, '..');

function loadShared() {
  const m = { exports: {} };
  const src = fs.readFileSync(path.join(repo, 'packages/shared/src/environment.ts'), 'utf8');
  new Function('module', 'exports', ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(m, m.exports);
  return m.exports;
}
const env = loadShared();

/** Minimal TOML reader: section/array-of-table headers and `key = "string"` / `key = [...]` lines. */
function readToml(file) {
  const sections = {};
  let current = '';
  sections[current] = {};
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, '').trim();
    if (!line || line.startsWith('#')) continue;
    const header = line.match(/^\[\[?([^\]]+)\]\]?$/);
    if (header) { current = header[1].trim(); sections[current] = sections[current] ?? {}; continue; }
    const kv = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.+)$/);
    if (kv) sections[current][kv[1]] = kv[2].trim().replace(/^"(.*)"$/, '$1');
  }
  return sections;
}

function readDotenv(file) {
  const out = {};
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = raw.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["'](.*)["']$/, '$1');
  }
  return out;
}

const results = [];
const check = (ok, label) => results.push({ ok: !!ok, label });
const blocked = [];

// ── Firebase project alias ────────────────────────────────────────────────
const firebaserc = JSON.parse(fs.readFileSync(path.join(root, '.firebaserc'), 'utf8'));
const stagingProject = firebaserc.projects?.staging ?? '';
check(stagingProject && !stagingProject.startsWith('REPLACE_'), '.firebaserc has a real "staging" project alias');
check(stagingProject !== env.PRODUCTION_FIREBASE_PROJECT_ID, 'staging Firebase project differs from production');

// ── Worker / R2 / cron ────────────────────────────────────────────────────
const toml = readToml(path.join(root, 'workers/r2-upload-worker/wrangler.toml'));
const prodName = toml['']?.name;
const prodBucket = toml['r2_buckets']?.bucket_name;
const staging = toml['env.staging'] ?? {};
const stagingBucket = toml['env.staging.r2_buckets']?.bucket_name;
const stagingVars = toml['env.staging.vars'] ?? {};
check(staging.name && staging.name !== prodName && staging.name !== env.PRODUCTION_WORKER_NAME, 'staging Worker name differs from production');
// Free-only staging binds no R2 bucket; if one is ever bound it must not be production's.
check(!stagingBucket || (stagingBucket !== prodBucket && stagingBucket !== env.PRODUCTION_R2_BUCKET), 'staging binds no production R2 bucket');
const stagingLegacyMode = stagingVars.LEGACY_MEDIA_MODE ?? '';
check(stagingBucket || stagingLegacyMode === 'none', 'staging without an R2 bucket runs in no-legacy mode (LEGACY_MEDIA_MODE = "none")');
check(['', 'required', 'none'].includes(stagingLegacyMode), 'staging LEGACY_MEDIA_MODE is a known value');
check(!(toml['vars'] ?? {}).LEGACY_MEDIA_MODE, 'production config does not set LEGACY_MEDIA_MODE');
check(stagingVars.FIREBASE_PROJECT_ID === stagingProject && !String(stagingVars.FIREBASE_PROJECT_ID).startsWith('REPLACE_'),
  'staging Worker FIREBASE_PROJECT_ID matches the staging alias');
check(String(stagingVars.FIREBASE_STORAGE_BUCKET ?? '').startsWith(`${stagingProject}.`) && stagingVars.FIREBASE_STORAGE_BUCKET !== env.PRODUCTION_STORAGE_BUCKET,
  'staging Worker FIREBASE_STORAGE_BUCKET belongs to the staging project');
check(toml['env.staging.triggers']?.crons, 'staging Worker has its own cron trigger');
// Media storage (Workers Free: KV bytes + D1 index) — staging-only resources.
const kvId = toml['env.staging.kv_namespaces']?.id ?? '';
const d1 = toml['env.staging.d1_databases'] ?? {};
const mediaOrigin = String(stagingVars.MEDIA_PUBLIC_ORIGIN ?? '');
check(kvId && !kvId.startsWith('REPLACE_') && kvId !== (toml['kv_namespaces']?.id ?? ''), 'staging MEDIA_KV namespace is set and not production');
check(d1.database_id && !String(d1.database_id).startsWith('REPLACE_') && d1.database_id !== (toml['d1_databases']?.database_id ?? ''),
  'staging MEDIA_DB database is set and not production');
check(d1.migrations_dir === 'migrations' && fs.existsSync(path.join(root, 'workers/r2-upload-worker/migrations')), 'staging MEDIA_DB has the media migrations');
const originHost = (() => { try { return new URL(mediaOrigin).protocol === 'https:' ? new URL(mediaOrigin).hostname : ''; } catch { return ''; } })();
check(originHost && !originHost.startsWith(`${env.PRODUCTION_WORKER_NAME}.`), 'staging MEDIA_PUBLIC_ORIGIN is an https origin that is not the production Worker');

// ── EAS profile: preview builds are staging builds ────────────────────────
const easJson = path.join(root, 'apps/mobile/eas.json');
if (fs.existsSync(easJson)) {
  const eas = JSON.parse(fs.readFileSync(easJson, 'utf8'));
  check(eas.build?.preview?.env?.EXPO_PUBLIC_APP_ENV === 'staging', 'EAS preview profile sets EXPO_PUBLIC_APP_ENV=staging');
  check(eas.build?.preview?.environment === 'preview', 'EAS preview profile reads the "preview" EAS environment');
}

// ── EAS preview environment (optional) ────────────────────────────────────
const easFile = argValue('--eas-env');
if (easFile) {
  const e = readDotenv(path.resolve(easFile));
  const problems = env.stagingIsolationProblems({
    appEnv: 'staging',
    firebaseProjectId: e.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: e.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
    workerUrl: e.EXPO_PUBLIC_R2_UPLOAD_WORKER_URL,
    apiKey: e.EXPO_PUBLIC_FIREBASE_API_KEY,
    authDomain: e.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    messagingSenderId: e.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: e.EXPO_PUBLIC_FIREBASE_APP_ID,
  });
  check(problems.length === 0, `EAS preview Firebase config complete and single-project${problems.length ? ` (${problems.join('; ')})` : ''}`);
  check(e.EXPO_PUBLIC_FIREBASE_PROJECT_ID === stagingProject, 'EAS preview EXPO_PUBLIC_FIREBASE_PROJECT_ID matches the staging alias');
  const host = (() => { try { return new URL(e.EXPO_PUBLIC_R2_UPLOAD_WORKER_URL ?? '').hostname; } catch { return ''; } })();
  check(host.startsWith(`${staging.name}.`), 'EAS preview EXPO_PUBLIC_R2_UPLOAD_WORKER_URL is the staging Worker');

  // ── Resource ownership: only trusted Firebase metadata can prove the API
  // key and app belong to the staging project; non-empty values do not.
  const metaFile = argValue('--firebase-metadata');
  if (!metaFile) {
    blocked.push('Firebase resource ownership not verified (pass --firebase-metadata with the staging web app SDK config)');
  } else {
    let meta = {};
    try {
      const raw = JSON.parse(fs.readFileSync(path.resolve(metaFile), 'utf8'));
      meta = raw?.result?.sdkConfig ?? raw?.sdkConfig ?? raw?.result ?? raw ?? {};
    } catch {
      check(false, 'Firebase metadata file is readable JSON');
    }
    check(meta.projectId && meta.projectId === stagingProject, 'Firebase metadata belongs to the staging project');
    for (const [key, name] of [['apiKey', 'API_KEY'], ['authDomain', 'AUTH_DOMAIN'], ['projectId', 'PROJECT_ID'],
      ['storageBucket', 'STORAGE_BUCKET'], ['messagingSenderId', 'MESSAGING_SENDER_ID'], ['appId', 'APP_ID']]) {
      const value = e[`EXPO_PUBLIC_FIREBASE_${name}`];
      check(meta[key] && value === meta[key], `EXPO_PUBLIC_FIREBASE_${name} matches the staging project's Firebase metadata`);
    }
  }
}

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.label}`);
for (const b of blocked) console.log(`BLOCKED ${b}`);
const failed = results.filter((r) => !r.ok).length;
if (failed) console.log(`${failed} staging isolation check(s) failed`);
else if (blocked.length) console.log('configuration checks passed; staging isolation NOT verified (blocked)');
else console.log(easFile ? 'staging isolation checks passed (configuration and resource ownership)' : 'staging configuration checks passed');
process.exitCode = failed ? 1 : blocked.length ? 2 : 0;
