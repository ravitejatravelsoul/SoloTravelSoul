// Read-only legacy media inventory: counts objects and bytes under a prefix in a Firebase Storage bucket
// (GCS JSON API, logged-in Firebase CLI account). Prints counts only; never names, URLs or tokens.
//   node scripts/countLegacyStorage.cjs <bucket> <prefix>
const path = require('path');
const [bucket, prefix] = process.argv.slice(2);
(async () => {
  const ft = path.join(process.env.APPDATA, 'npm/node_modules/firebase-tools/lib');
  const { configstore } = require(path.join(ft, 'configstore.js'));
  const tok = (await require(path.join(ft, 'auth.js')).getAccessToken(configstore.get('tokens').refresh_token, [])).access_token;
  let n = 0, bytes = 0, page = '';
  do {
    const r = await fetch(`https://storage.googleapis.com/storage/v1/b/${bucket}/o?prefix=${encodeURIComponent(prefix)}&fields=items(size),nextPageToken${page ? `&pageToken=${page}` : ''}`, { headers: { Authorization: `Bearer ${tok}` } });
    if (!r.ok) { console.log(`HTTP ${r.status}`); return; }
    const j = await r.json(); for (const i of j.items || []) { n++; bytes += Number(i.size); } page = j.nextPageToken || '';
  } while (page);
  console.log(`objects under ${prefix}: ${n}, bytes: ${bytes}`);
})();
