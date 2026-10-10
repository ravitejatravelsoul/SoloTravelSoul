// Read-only sizing for scripts/auditCounters.ts: COUNT() aggregation per collection the audit reads,
// via Firestore REST with the logged-in Firebase CLI account. Cost: about 1 read per 1,000 index
// entries per query (minimum 1). Prints counts only.
//   node scripts/countAuditCollections.cjs <firebase-project>
const path = require('path');
const project = process.argv[2];
const COLLECTIONS = ['travelPosts', 'travelJournals', 'postLikes', 'savedPosts', 'postComments', 'follows', 'publicProfiles', 'publicTrips', 'travelGroups'];
(async () => {
  const ft = path.join(process.env.APPDATA, 'npm/node_modules/firebase-tools/lib');
  const { configstore } = require(path.join(ft, 'configstore.js'));
  const tok = (await require(path.join(ft, 'auth.js')).getAccessToken(configstore.get('tokens').refresh_token, [])).access_token;
  const url = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents:runAggregationQuery`;
  const count = async (collectionId, allDescendants = false) => {
    const r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ structuredAggregationQuery: { structuredQuery: { from: [{ collectionId, allDescendants }] }, aggregations: [{ alias: 'n', count: {} }] } }) });
    const j = await r.json();
    if (!r.ok) throw new Error(`${collectionId}: HTTP ${r.status}`);
    return Number(j[0].result.aggregateFields.n.integerValue);
  };
  let total = 0, aggReads = 0;
  for (const c of COLLECTIONS) { const n = await count(c); total += n; aggReads += Math.max(1, Math.ceil(n / 1000)); console.log(c.padEnd(16), n); }
  const m = await count('members', true); total += m; aggReads += Math.max(1, Math.ceil(m / 1000)); console.log('members (group)'.padEnd(16), m);
  console.log(`total documents the audit would read: ${total}`);
  console.log(`approx. reads used by this count: ${aggReads}`);
})().catch((e) => { console.error(String(e.message).replace(/ya29\.[\w.-]+/g, '<token>')); process.exit(1); });
