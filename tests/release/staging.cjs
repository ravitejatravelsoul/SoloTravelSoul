// Staging isolation: shared rules, the app's runtime guard and the pre-deploy checker.
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'node_modules/typescript'));

const transpile = (src) => ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function load(file, deps = {}, source) {
  const m = { exports: {} };
  vm.runInNewContext(source ?? transpile(fs.readFileSync(path.join(root, file), 'utf8')), {
    module: m, exports: m.exports, URL, console: { error() {}, log() {} }, process: { env: {} },
    require: (n) => { if (n in deps) return deps[n]; throw Error('Unexpected ' + n); },
  });
  return m.exports;
}

const env = load('packages/shared/src/environment.ts');
const problems = (t) => [...env.stagingIsolationProblems(t)]; // copy out of the VM realm
const STAGING = { firebaseProjectId: 'sts-staging', storageBucket: 'sts-staging.firebasestorage.app', authDomain: 'sts-staging.firebaseapp.com',
  apiKey: 'AIza-staging-test-key', messagingSenderId: '123456789', appId: '1:123456789:web:abc123' };
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('isolation rules: production targets are rejected only for staging builds', () => {
  const prod = { firebaseProjectId: env.PRODUCTION_FIREBASE_PROJECT_ID, storageBucket: env.PRODUCTION_STORAGE_BUCKET, workerUrl: 'https://solotravelsoul-r2-upload.example.workers.dev' };
  assert.equal(env.stagingIsolationProblems({ appEnv: 'production', ...prod }).length, 0);
  const prodProblems = problems({ appEnv: 'staging', ...prod });
  for (const m of ['staging build points at the production Firebase project', 'staging build points at the production Storage bucket', 'staging build points at the production Worker']) {
    assert.ok(prodProblems.includes(m), m);
  }
  const good = { appEnv: 'staging', ...STAGING, workerUrl: 'https://solotravelsoul-r2-upload-staging.example.workers.dev' };
  assert.deepEqual(problems(good), []);
  assert.ok(problems({ appEnv: 'staging', firebaseProjectId: 'REPLACE_WITH_STAGING_PROJECT_ID' }).includes('staging Firebase project is not set'));
  // Every required value, and one project only.
  for (const key of ['apiKey', 'authDomain', 'storageBucket', 'messagingSenderId', 'appId']) {
    assert.ok(problems({ ...good, [key]: '' }).includes(`staging Firebase ${key} is not set`), key);
  }
  assert.ok(problems({ ...good, authDomain: `${env.PRODUCTION_FIREBASE_PROJECT_ID}.firebaseapp.com` }).includes('staging build points at the production Auth domain'));
  assert.ok(problems({ ...good, authDomain: 'other-project.firebaseapp.com' }).includes('staging Auth domain does not belong to the staging project'));
  assert.ok(problems({ ...good, storageBucket: 'other-project.firebasestorage.app' }).includes('staging Storage bucket does not belong to the staging project'));
  assert.ok(problems({ ...good, messagingSenderId: env.PRODUCTION_FIREBASE_PROJECT_NUMBER }).includes('staging build uses the production sender ID'));
  assert.ok(problems({ ...good, appId: `1:${env.PRODUCTION_FIREBASE_PROJECT_NUMBER}:web:abc123` }).includes('staging build uses a production app ID'));
  assert.ok(problems({ ...good, appId: '1:999:web:abc123' }).includes('staging app ID and sender ID belong to different projects'));
  assert.ok(problems({ ...good, appId: 'not-an-app-id' }).includes('staging Firebase appId is malformed'));
  assert.ok(!JSON.stringify(problems({ ...good, apiKey: '', authDomain: 'x.firebaseapp.com' })).includes('x.firebaseapp'), 'messages name fields, not values');
});

function configWith(vars) {
  const babel = require(path.join(root, 'node_modules/@babel/core'));
  const plugin = require(path.join(root, 'node_modules/babel-preset-expo/build/inline-env-vars')).expoInlineEnvVars;
  const saved = { ...process.env };
  Object.assign(process.env, vars);
  try {
    const compiled = transpile(fs.readFileSync(path.join(root, 'packages/firebase/src/config.ts'), 'utf8'));
    const code = babel.transformSync(compiled, { configFile: false, babelrc: false, plugins: [plugin], caller: { name: 'metro', isDev: false }, filename: path.join(root, 'packages/firebase/src/config.ts') }).code;
    let initialized;
    const config = load('packages/firebase/src/config.ts', {
      'firebase/app': { getApps: () => [], getApp: () => ({}), initializeApp: (c) => { initialized = c; return {}; } },
      '@solotravelsoul/shared': env,
    }, code);
    return { configured: config.isFirebaseConfigured, initialized };
  } finally {
    for (const k of Object.keys(vars)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
}
const firebaseVars = (project, number = project === env.PRODUCTION_FIREBASE_PROJECT_ID ? env.PRODUCTION_FIREBASE_PROJECT_NUMBER : '123456789') => ({
  EXPO_PUBLIC_FIREBASE_API_KEY: 'AIza-test-key', EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: `${project}.firebaseapp.com`, EXPO_PUBLIC_FIREBASE_PROJECT_ID: project,
  EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: `${project}.firebasestorage.app`, EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: number, EXPO_PUBLIC_FIREBASE_APP_ID: `1:${number}:web:abc123`,
});
const easLines = (vars) => Object.entries(vars).map(([k, v]) => `${k}=${v}`).join(String.fromCharCode(10));
const stagingEas = () => ({ ...firebaseVars('sts-staging'), EXPO_PUBLIC_R2_UPLOAD_WORKER_URL: 'https://solotravelsoul-r2-upload-staging.x.workers.dev' });
const metadataFor = (vars, projectId = vars.EXPO_PUBLIC_FIREBASE_PROJECT_ID) => ({ result: { sdkConfig: {
  projectId, apiKey: vars.EXPO_PUBLIC_FIREBASE_API_KEY, authDomain: vars.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN, storageBucket: vars.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: vars.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID, appId: vars.EXPO_PUBLIC_FIREBASE_APP_ID } } });

test('app guard: a staging build pointed at production cannot connect', () => {
  const bad = configWith({ ...firebaseVars(env.PRODUCTION_FIREBASE_PROJECT_ID), EXPO_PUBLIC_APP_ENV: 'staging' });
  assert.equal(bad.configured, false);
  assert.ok(Object.values(bad.initialized).every((v) => v === ''), 'Firebase initialised with a blank config');
  const good = configWith({ ...firebaseVars('sts-staging'), EXPO_PUBLIC_APP_ENV: 'staging', EXPO_PUBLIC_R2_UPLOAD_WORKER_URL: 'https://solotravelsoul-r2-upload-staging.x.workers.dev' });
  assert.deepEqual([good.configured, good.initialized.projectId], [true, 'sts-staging']);
  const prod = configWith({ ...firebaseVars(env.PRODUCTION_FIREBASE_PROJECT_ID), EXPO_PUBLIC_APP_ENV: 'production' });
  assert.equal(prod.configured, true, 'production builds unaffected');
});

test('app guard: staging project with a production Auth domain is rejected (mixed project)', () => {
  const mixed = configWith({ ...firebaseVars('sts-staging'), EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: `${env.PRODUCTION_FIREBASE_PROJECT_ID}.firebaseapp.com`, EXPO_PUBLIC_APP_ENV: 'staging' });
  assert.equal(mixed.configured, false);
});

test('checker: --eas-env with missing API key, Auth domain, app ID and sender ID fails', () => {
  const dir = fixture();
  const easFile = path.join(dir, 'partial.env');
  fs.writeFileSync(easFile, ['EXPO_PUBLIC_FIREBASE_PROJECT_ID=sts-staging', 'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=sts-staging.firebasestorage.app',
    'EXPO_PUBLIC_R2_UPLOAD_WORKER_URL=https://solotravelsoul-r2-upload-staging.x.workers.dev', 'EXPO_PUBLIC_STORAGE_PROVIDER=r2'].join(String.fromCharCode(10)));
  const r = runChecker(dir, ['--eas-env', easFile]);
  assert.notEqual(r.code, 0, r.out);
});

function fixture({ project = 'sts-staging', workerVarsProject = project, stagingBucket = null, previewEnv = 'staging',
  kvId = 'staging-kv-namespace-id', d1Id = 'staging-d1-database-id', mediaOrigin = 'https://solotravelsoul-r2-upload-staging.x.workers.dev', migrations = true,
  legacyMode = 'none', prodLegacyMode = null } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sts-staging-'));
  fs.mkdirSync(path.join(dir, 'workers/r2-upload-worker'), { recursive: true });
  if (migrations) fs.mkdirSync(path.join(dir, 'workers/r2-upload-worker/migrations'));
  fs.mkdirSync(path.join(dir, 'apps/mobile'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.firebaserc'), JSON.stringify({ projects: { default: env.PRODUCTION_FIREBASE_PROJECT_ID, staging: project } }));
  fs.writeFileSync(path.join(dir, 'workers/r2-upload-worker/wrangler.toml'), [
    'name = "solotravelsoul-r2-upload"', '[[r2_buckets]]', 'binding = "R2_BUCKET"', 'bucket_name = "solotravelsoul-images"',
    ...(prodLegacyMode ? ['[vars]', `LEGACY_MEDIA_MODE = "${prodLegacyMode}"`] : []),
    '[env.staging]', 'name = "solotravelsoul-r2-upload-staging"',
    ...(stagingBucket ? ['[[env.staging.r2_buckets]]', 'binding = "R2_BUCKET"', `bucket_name = "${stagingBucket}"`] : []),
    '[[env.staging.kv_namespaces]]', 'binding = "MEDIA_KV"', `id = "${kvId}"`,
    '[[env.staging.d1_databases]]', 'binding = "MEDIA_DB"', 'database_name = "solotravelsoul-media-staging"', `database_id = "${d1Id}"`, 'migrations_dir = "migrations"',
    '[env.staging.vars]', `FIREBASE_PROJECT_ID = "${workerVarsProject}"`, `FIREBASE_STORAGE_BUCKET = "${workerVarsProject}.firebasestorage.app"`, `MEDIA_PUBLIC_ORIGIN = "${mediaOrigin}"`,
    ...(legacyMode !== null ? [`LEGACY_MEDIA_MODE = "${legacyMode}"`] : []),
    '[env.staging.triggers]', 'crons = ["17 * * * *"]',
  ].join('\n'));
  fs.writeFileSync(path.join(dir, 'apps/mobile/eas.json'), JSON.stringify({ build: { preview: { environment: 'preview', env: { EXPO_PUBLIC_APP_ENV: previewEnv } } } }));
  return dir;
}
function runChecker(dir, extra = []) {
  const r = spawnSync(process.execPath, [path.join(root, 'scripts/checkStagingIsolation.cjs'), '--root', dir, ...extra], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout };
}

test('checker: isolated staging config passes; any production target fails; values never printed', () => {
  const ok = runChecker(fixture());
  assert.equal(ok.code, 0, ok.out);
  // A separate (non-production) staging bucket with legacy cleanup stays allowed.
  const withBucket = runChecker(fixture({ stagingBucket: 'solotravelsoul-images-staging', legacyMode: null }));
  assert.equal(withBucket.code, 0, withBucket.out);
  for (const [label, opts] of [
    ['production project as staging', { project: env.PRODUCTION_FIREBASE_PROJECT_ID }],
    ['Worker vars on production project', { workerVarsProject: env.PRODUCTION_FIREBASE_PROJECT_ID }],
    ['production R2 bucket', { stagingBucket: env.PRODUCTION_R2_BUCKET }],
    ['no R2 bucket and legacy media required', { legacyMode: null }],
    ['unknown legacy mode', { legacyMode: 'skip' }],
    ['production config sets no-legacy mode', { prodLegacyMode: 'none' }],
    ['placeholder project', { project: 'REPLACE_WITH_STAGING_PROJECT_ID', workerVarsProject: 'REPLACE_WITH_STAGING_PROJECT_ID' }],
    ['preview not marked staging', { previewEnv: 'production' }],
    ['media KV placeholder', { kvId: 'REPLACE_WITH_STAGING_KV_NAMESPACE_ID' }],
    ['media D1 placeholder', { d1Id: 'REPLACE_WITH_STAGING_D1_DATABASE_ID' }],
    ['media migrations missing', { migrations: false }],
    ['media origin is the production Worker', { mediaOrigin: `https://${env.PRODUCTION_WORKER_NAME}.x.workers.dev` }],
    ['media origin not https', { mediaOrigin: 'http://solotravelsoul-r2-upload-staging.x.workers.dev' }],
    ['media origin placeholder', { mediaOrigin: 'REPLACE_WITH_STAGING_WORKER_ORIGIN' }],
  ]) {
    const r = runChecker(fixture(opts));
    assert.equal(r.code, 1, label);
  }
  // EAS preview env pulled to a file.
  const dir = fixture();
  const easFile = path.join(dir, 'preview.env');
  const metaFile = path.join(dir, 'metadata.json');
  const vars = stagingEas();
  fs.writeFileSync(easFile, easLines(vars));
  // Complete, single-project config but no trusted metadata: BLOCKED, not verified.
  const blocked = runChecker(dir, ['--eas-env', easFile]);
  assert.equal(blocked.code, 2, blocked.out);
  assert.match(blocked.out, /BLOCKED Firebase resource ownership not verified/);
  assert.match(blocked.out, /NOT verified/);
  // Verified against the staging project's Firebase metadata.
  fs.writeFileSync(metaFile, JSON.stringify(metadataFor(vars)));
  const verified = runChecker(dir, ['--eas-env', easFile, '--firebase-metadata', metaFile]);
  assert.equal(verified.code, 0, verified.out);
  for (const secret of [vars.EXPO_PUBLIC_FIREBASE_API_KEY, vars.EXPO_PUBLIC_FIREBASE_APP_ID, 'sts-staging.firebasestorage']) {
    assert.ok(!verified.out.includes(secret) && !blocked.out.includes(secret), 'no values printed');
  }
  // Worker URL that differs from MEDIA_PUBLIC_ORIGIN (tokens would not attach to stored media URLs): FAIL.
  fs.writeFileSync(easFile, easLines({ ...vars, EXPO_PUBLIC_R2_UPLOAD_WORKER_URL: 'https://solotravelsoul-r2-upload-staging.other.workers.dev' }));
  assert.equal(runChecker(dir, ['--eas-env', easFile, '--firebase-metadata', metaFile]).code, 1, 'media origin mismatch');
  // Native Google service files in the preview environment: FAIL.
  fs.writeFileSync(easFile, easLines({ ...vars, GOOGLE_SERVICES_JSON: '/tmp/google-services.json' }));
  assert.equal(runChecker(dir, ['--eas-env', easFile, '--firebase-metadata', metaFile]).code, 1, 'native Google files in preview');
  fs.writeFileSync(easFile, easLines(vars));
  // API key from another project (metadata disagrees) or metadata for another project: FAIL.
  fs.writeFileSync(metaFile, JSON.stringify(metadataFor({ ...vars, EXPO_PUBLIC_FIREBASE_API_KEY: 'AIza-other' })));
  assert.equal(runChecker(dir, ['--eas-env', easFile, '--firebase-metadata', metaFile]).code, 1);
  fs.writeFileSync(metaFile, JSON.stringify(metadataFor(vars, 'some-other-project')));
  assert.equal(runChecker(dir, ['--eas-env', easFile, '--firebase-metadata', metaFile]).code, 1);
  // Production project / Worker in the preview env: FAIL even before ownership.
  fs.writeFileSync(easFile, easLines({ ...firebaseVars(env.PRODUCTION_FIREBASE_PROJECT_ID), EXPO_PUBLIC_R2_UPLOAD_WORKER_URL: 'https://solotravelsoul-r2-upload.x.workers.dev', EXPO_PUBLIC_STORAGE_PROVIDER: 'r2' }));
  assert.equal(runChecker(dir, ['--eas-env', easFile]).code, 1);
});

test('repo staging config names only staging resources (project ID still to be filled in)', () => {
  const r = runChecker(root);
  for (const line of ['PASS staging Worker name differs from production', 'PASS staging binds no production R2 bucket',
    'PASS staging without an R2 bucket runs in no-legacy mode (LEGACY_MEDIA_MODE = "none")', 'PASS production config does not set LEGACY_MEDIA_MODE',
    'PASS staging Worker has its own cron trigger', 'PASS EAS preview profile sets EXPO_PUBLIC_APP_ENV=staging',
    'PASS staging MEDIA_DB has the media migrations']) {
    assert.ok(r.out.includes(line), line);
  }
  // Staging media resources exist (created in the authorized staging rollout).
  for (const line of ['PASS staging MEDIA_KV namespace is set and not production', 'PASS staging MEDIA_DB database is set and not production',
    'PASS staging MEDIA_PUBLIC_ORIGIN is an https origin that is not the production Worker']) {
    assert.ok(r.out.includes(line), line);
  }
  assert.equal(r.code, 0, 'repo staging configuration passes every check');
  // Production Worker config gains no media bindings in this change.
  const toml = fs.readFileSync(path.join(root, 'workers/r2-upload-worker/wrangler.toml'), 'utf8');
  const prodPart = toml.split('[env.staging]')[0].split(/\r?\n/).filter((l) => !l.trim().startsWith('#')).join('\n'); // settings only
  assert.ok(!/MEDIA_KV|MEDIA_DB|MEDIA_PUBLIC_ORIGIN|LEGACY_MEDIA_MODE/.test(prodPart), 'production section unchanged');
  assert.ok(/\[\[r2_buckets\]\][\s\S]*bucket_name\s*=\s*"solotravelsoul-images"/.test(prodPart), 'production legacy R2 cleanup binding kept');
  assert.ok(!/env\.staging\.r2_buckets/.test(toml), 'free-only staging binds no R2 bucket');
});

let passed = 0;
for (const t of tests) {
  try { t.fn(); passed++; console.log(`PASS ${t.name}`); }
  catch (e) { console.error(`FAIL ${t.name}\n`, e); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} staging isolation checks passed`);
