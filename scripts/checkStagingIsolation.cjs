#!/usr/bin/env node
// Verifies the staging configuration cannot reach production before any
// staging deploy or build. Never prints configuration values.
//
//   npm run check:staging                         # repo config (.firebaserc + wrangler.toml)
//   npm run check:staging -- --eas-env <file>     # plus an `eas env:pull --environment preview` file
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
check(stagingBucket && stagingBucket !== prodBucket && stagingBucket !== env.PRODUCTION_R2_BUCKET, 'staging R2 bucket differs from production');
check(stagingVars.FIREBASE_PROJECT_ID === stagingProject && !String(stagingVars.FIREBASE_PROJECT_ID).startsWith('REPLACE_'),
  'staging Worker FIREBASE_PROJECT_ID matches the staging alias');
check(String(stagingVars.FIREBASE_STORAGE_BUCKET ?? '').startsWith(`${stagingProject}.`) && stagingVars.FIREBASE_STORAGE_BUCKET !== env.PRODUCTION_STORAGE_BUCKET,
  'staging Worker FIREBASE_STORAGE_BUCKET belongs to the staging project');
check(toml['env.staging.triggers']?.crons, 'staging Worker has its own cron trigger');

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
  });
  check(problems.length === 0, `EAS preview env isolated${problems.length ? ` (${problems.join('; ')})` : ''}`);
  check(e.EXPO_PUBLIC_FIREBASE_PROJECT_ID === stagingProject, 'EAS preview EXPO_PUBLIC_FIREBASE_PROJECT_ID matches the staging alias');
  const host = (() => { try { return new URL(e.EXPO_PUBLIC_R2_UPLOAD_WORKER_URL ?? '').hostname; } catch { return ''; } })();
  check(host.startsWith(`${staging.name}.`), 'EAS preview EXPO_PUBLIC_R2_UPLOAD_WORKER_URL is the staging Worker');
  check(e.EXPO_PUBLIC_STORAGE_PROVIDER === 'r2', 'EAS preview uses the R2 upload Worker');
}

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.label}`);
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `${failed} staging isolation check(s) failed` : 'staging isolation checks passed');
process.exitCode = failed ? 1 : 0;
