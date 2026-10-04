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
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('isolation rules: production targets are rejected only for staging builds', () => {
  const prod = { firebaseProjectId: env.PRODUCTION_FIREBASE_PROJECT_ID, storageBucket: env.PRODUCTION_STORAGE_BUCKET, workerUrl: 'https://solotravelsoul-r2-upload.example.workers.dev' };
  assert.equal(env.stagingIsolationProblems({ appEnv: 'production', ...prod }).length, 0);
  assert.equal(env.stagingIsolationProblems({ appEnv: 'staging', ...prod }).length, 3);
  assert.deepEqual(problems({ appEnv: 'staging', firebaseProjectId: 'sts-staging', storageBucket: 'sts-staging.firebasestorage.app',
    workerUrl: 'https://solotravelsoul-r2-upload-staging.example.workers.dev' }), []);
  assert.deepEqual(problems({ appEnv: 'staging', firebaseProjectId: 'REPLACE_WITH_STAGING_PROJECT_ID' }), ['staging Firebase project is not set']);
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
const firebaseVars = (project) => ({
  EXPO_PUBLIC_FIREBASE_API_KEY: 'k', EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: `${project}.firebaseapp.com`, EXPO_PUBLIC_FIREBASE_PROJECT_ID: project,
  EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: `${project}.firebasestorage.app`, EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '1', EXPO_PUBLIC_FIREBASE_APP_ID: 'a',
});

test('app guard: a staging build pointed at production cannot connect', () => {
  const bad = configWith({ ...firebaseVars(env.PRODUCTION_FIREBASE_PROJECT_ID), EXPO_PUBLIC_APP_ENV: 'staging' });
  assert.equal(bad.configured, false);
  assert.ok(Object.values(bad.initialized).every((v) => v === ''), 'Firebase initialised with a blank config');
  const good = configWith({ ...firebaseVars('sts-staging'), EXPO_PUBLIC_APP_ENV: 'staging', EXPO_PUBLIC_R2_UPLOAD_WORKER_URL: 'https://solotravelsoul-r2-upload-staging.x.workers.dev' });
  assert.deepEqual([good.configured, good.initialized.projectId], [true, 'sts-staging']);
  const prod = configWith({ ...firebaseVars(env.PRODUCTION_FIREBASE_PROJECT_ID), EXPO_PUBLIC_APP_ENV: 'production' });
  assert.equal(prod.configured, true, 'production builds unaffected');
});

function fixture({ project = 'sts-staging', workerVarsProject = project, stagingBucket = 'solotravelsoul-images-staging', previewEnv = 'staging' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sts-staging-'));
  fs.mkdirSync(path.join(dir, 'workers/r2-upload-worker'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'apps/mobile'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.firebaserc'), JSON.stringify({ projects: { default: env.PRODUCTION_FIREBASE_PROJECT_ID, staging: project } }));
  fs.writeFileSync(path.join(dir, 'workers/r2-upload-worker/wrangler.toml'), [
    'name = "solotravelsoul-r2-upload"', '[[r2_buckets]]', 'binding = "R2_BUCKET"', 'bucket_name = "solotravelsoul-images"',
    '[env.staging]', 'name = "solotravelsoul-r2-upload-staging"',
    '[[env.staging.r2_buckets]]', 'binding = "R2_BUCKET"', `bucket_name = "${stagingBucket}"`,
    '[env.staging.vars]', `FIREBASE_PROJECT_ID = "${workerVarsProject}"`, `FIREBASE_STORAGE_BUCKET = "${workerVarsProject}.firebasestorage.app"`,
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
  for (const [label, opts] of [
    ['production project as staging', { project: env.PRODUCTION_FIREBASE_PROJECT_ID }],
    ['Worker vars on production project', { workerVarsProject: env.PRODUCTION_FIREBASE_PROJECT_ID }],
    ['production R2 bucket', { stagingBucket: env.PRODUCTION_R2_BUCKET }],
    ['placeholder project', { project: 'REPLACE_WITH_STAGING_PROJECT_ID', workerVarsProject: 'REPLACE_WITH_STAGING_PROJECT_ID' }],
    ['preview not marked staging', { previewEnv: 'production' }],
  ]) {
    const r = runChecker(fixture(opts));
    assert.equal(r.code, 1, label);
  }
  // EAS preview env pulled to a file: production Worker / project are rejected.
  const dir = fixture();
  const easFile = path.join(dir, 'preview.env');
  fs.writeFileSync(easFile, ['EXPO_PUBLIC_FIREBASE_PROJECT_ID=sts-staging', 'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=sts-staging.firebasestorage.app',
    'EXPO_PUBLIC_R2_UPLOAD_WORKER_URL=https://solotravelsoul-r2-upload-staging.x.workers.dev', 'EXPO_PUBLIC_STORAGE_PROVIDER=r2', 'EXPO_PUBLIC_FIREBASE_API_KEY=SECRET-SHOULD-NOT-PRINT'].join('\n'));
  const good = runChecker(dir, ['--eas-env', easFile]);
  assert.equal(good.code, 0, good.out);
  assert.ok(!good.out.includes('SECRET-SHOULD-NOT-PRINT') && !good.out.includes('sts-staging.firebasestorage'), 'no values printed');
  fs.writeFileSync(easFile, ['EXPO_PUBLIC_FIREBASE_PROJECT_ID=' + env.PRODUCTION_FIREBASE_PROJECT_ID,
    'EXPO_PUBLIC_R2_UPLOAD_WORKER_URL=https://solotravelsoul-r2-upload.x.workers.dev', 'EXPO_PUBLIC_STORAGE_PROVIDER=r2'].join('\n'));
  assert.equal(runChecker(dir, ['--eas-env', easFile]).code, 1);
});

test('repo staging config names only staging resources (project ID still to be filled in)', () => {
  const r = runChecker(root);
  for (const line of ['PASS staging Worker name differs from production', 'PASS staging R2 bucket differs from production',
    'PASS staging Worker has its own cron trigger', 'PASS EAS preview profile sets EXPO_PUBLIC_APP_ENV=staging']) {
    assert.ok(r.out.includes(line), line);
  }
});

let passed = 0;
for (const t of tests) {
  try { t.fn(); passed++; console.log(`PASS ${t.name}`); }
  catch (e) { console.error(`FAIL ${t.name}\n`, e); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} staging isolation checks passed`);
