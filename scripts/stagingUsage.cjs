#!/usr/bin/env node
// Read-only usage and health check for a Worker on the free plans (no paid
// alerting needed). Run daily by hand or from any scheduler you already have.
//
//   node scripts/stagingUsage.cjs [--script solotravelsoul-r2-upload-staging] [--hours 24]
//   STS_ADMIN_TOKEN=<admin token> node scripts/stagingUsage.cjs   # also checks stalled deletions
//
// Credentials: CLOUDFLARE_API_TOKEN (Account Analytics: Read) or the local
// Wrangler login. Never printed. Output: counts and percentages only.
// Exit code 1 when any Free daily limit is ≥ 80% used, any invocation errored,
// a 503 from the front was logged, or deletions are stalled.
const fs = require('fs');
const path = require('path');
const { parseArgs } = require('util');

const { values } = parseArgs({ options: { script: { type: 'string', default: 'solotravelsoul-r2-upload-staging' }, hours: { type: 'string', default: '24' },
  origin: { type: 'string', default: 'https://solotravelsoul-r2-upload-staging.ravitejatravelsoul.workers.dev' } } });

/** Free daily limits (Cloudflare documentation, 2026). */
const FREE = { workerRequests: 100_000, doRequests: 100_000, doGbSeconds: 13_000, d1RowsRead: 5_000_000, d1RowsWritten: 100_000, kvReads: 100_000, kvWrites: 1_000, kvDeletes: 1_000 };

function token() {
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN;
  const candidates = [path.join(process.env.APPDATA || '', 'xdg.config/.wrangler/config/default.toml'), path.join(process.env.HOME || '', '.wrangler/config/default.toml'), path.join(process.env.HOME || '', '.config/.wrangler/config/default.toml')];
  for (const f of candidates) {
    if (fs.existsSync(f)) { const m = fs.readFileSync(f, 'utf8').match(/oauth_token\s*=\s*"([^"]+)"/); if (m) return m[1]; }
  }
  throw new Error('Set CLOUDFLARE_API_TOKEN or run `wrangler login`.');
}

async function main() {
  const t = token();
  const api = async (p, init = {}) => (await fetch(`https://api.cloudflare.com/client/v4${p}`, { ...init, headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json', ...(init.headers || {}) } })).json();
  const account = (await api('/accounts')).result?.[0]?.id;
  if (!account) throw new Error('No Cloudflare account visible to these credentials.');
  const until = new Date();
  const since = new Date(until.getTime() - Number(values.hours) * 3600e3);
  const query = `query($a:String!,$s:Time!,$u:Time!,$n:String!){viewer{accounts(filter:{accountTag:$a}){
    w: workersInvocationsAdaptive(limit:1000, filter:{datetime_geq:$s, datetime_leq:$u, scriptName:$n}){ sum{ requests errors subrequests } quantiles{ cpuTimeP50 cpuTimeP99 } dimensions{ status } }
    dp: durableObjectsPeriodicGroups(limit:1000, filter:{datetime_geq:$s, datetime_leq:$u}){ sum{ activeTime cpuTime exceededCpuErrors exceededMemoryErrors } }
    di: durableObjectsInvocationsAdaptiveGroups(limit:1000, filter:{datetime_geq:$s, datetime_leq:$u}){ sum{ requests errors } }
    d1: d1AnalyticsAdaptiveGroups(limit:1000, filter:{datetime_geq:$s, datetime_leq:$u}){ sum{ rowsRead rowsWritten readQueries writeQueries } }
    kv: kvOperationsAdaptiveGroups(limit:1000, filter:{datetime_geq:$s, datetime_leq:$u}){ sum{ requests } dimensions{ actionType } }
  }}}`;
  const r = await api('/graphql', { method: 'POST', body: JSON.stringify({ query, variables: { a: account, s: since.toISOString(), u: until.toISOString(), n: values.script } }) });
  if (r.errors) throw new Error(`analytics: ${r.errors.map((e) => e.message).join('; ').slice(0, 300)}`);
  const a = r.data.viewer.accounts[0];
  const sum = (rows, f) => rows.reduce((x, row) => x + (row.sum[f] || 0), 0);
  const kvBy = (type) => a.kv.filter((x) => x.dimensions.actionType === type).reduce((x, row) => x + row.sum.requests, 0);
  const usage = {
    workerRequests: sum(a.w, 'requests'), workerErrors: sum(a.w, 'errors'),
    workerCpuP99Ms: Math.max(0, ...a.w.map((x) => x.quantiles.cpuTimeP99 / 1000)),
    doRequests: sum(a.di, 'requests'), doErrors: sum(a.di, 'errors'),
    doGbSeconds: (sum(a.dp, 'activeTime') / 1e6) * 0.128, doExceededCpu: sum(a.dp, 'exceededCpuErrors'), doExceededMemory: sum(a.dp, 'exceededMemoryErrors'),
    d1RowsRead: sum(a.d1, 'rowsRead'), d1RowsWritten: sum(a.d1, 'rowsWritten'),
    kvReads: kvBy('read'), kvWrites: kvBy('write'), kvDeletes: kvBy('delete'),
  };
  const scale = 24 / Number(values.hours);
  const problems = [];
  const lines = [];
  for (const [k, limit] of Object.entries(FREE)) {
    const perDay = usage[k] * scale;
    const pct = (perDay / limit) * 100;
    lines.push(`${k.padEnd(14)} ${Math.round(usage[k]).toString().padStart(9)} in ${values.hours} h  ≈ ${pct.toFixed(2)}% of the Free daily limit${scale === 1 ? '' : ' (projected to 24 h)'}`);
    if (pct >= 80) problems.push(`${k} at ${pct.toFixed(0)}% of the Free daily limit`);
  }
  console.log(`Worker ${values.script}, last ${values.hours} h (account-wide for Durable Objects, D1 and KV):`);
  for (const l of lines) console.log(`  ${l}`);
  console.log(`  worker errors ${usage.workerErrors}; worker CPU p99 ${usage.workerCpuP99Ms.toFixed(2)} ms (Free limit 10 ms); object errors ${usage.doErrors}; object exceeded-CPU ${usage.doExceededCpu}; exceeded-memory ${usage.doExceededMemory}`);
  if (usage.workerErrors || usage.doErrors || usage.doExceededCpu || usage.doExceededMemory) problems.push('invocation errors present');
  if (usage.workerCpuP99Ms >= 10) problems.push('front Worker CPU p99 ≥ 10 ms');

  // Stalled deletions and unresolved legacy media (optional; needs the admin token).
  if (process.env.STS_ADMIN_TOKEN) {
    const s = await fetch(`${values.origin}/admin/deletion-status`, { headers: { Authorization: `Bearer ${process.env.STS_ADMIN_TOKEN}` } });
    if (!s.ok) problems.push(`deletion-status answered ${s.status}`);
    else {
      const body = await s.json();
      console.log(`  stalled deletions ${body.count}; unresolved legacy media ${body.legacyMediaUnresolved.length}`);
      if (body.count) problems.push(`${body.count} stalled deletion(s)`);
    }
  } else {
    console.log('  stalled deletions: not checked (set STS_ADMIN_TOKEN)');
  }
  console.log('  Firestore (Spark: 50,000 reads, 20,000 writes, 20,000 deletes per day): see Firebase console → Usage; not available here.');
  console.log('  503 / maintenance / stalled events: Workers Logs (dashboard → Workers → Logs), query event = service_unavailable, maintenance_unavailable, account_deletion_stalled, deletion_sweep_failed.');
  if (problems.length) { console.log(`ATTENTION: ${problems.join('; ')}`); process.exitCode = 1; } else console.log('OK');
}

main().catch((e) => { console.error(String(e.message || e).replace(/Bearer \S+/g, 'Bearer <redacted>')); process.exitCode = 2; });
