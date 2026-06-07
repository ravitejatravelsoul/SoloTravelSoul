/**
 * fixOwnerPhoto.ts
 *
 * One-time fix: copies the current photoURL from users/{uid} into
 * ownerPhotoURL on every travelGroups and publicTrips doc owned by that user.
 *
 * Needed when the profile photo was migrated (e.g. Firebase Storage → R2)
 * and the community docs still carry the old URL.
 *
 * Usage (PowerShell):
 *   $env:GOOGLE_APPLICATION_CREDENTIALS = "C:\path\to\serviceAccountKey.json"
 *   $env:FIX_UID = "YOUR_FIREBASE_UID"
 *   npx tsx scripts/fixOwnerPhoto.ts
 *
 * FIX_UID can also be set as DEMO_CURRENT_UID (checked as fallback).
 */

import * as admin from 'firebase-admin';

const uid = process.env.FIX_UID?.trim() || process.env.DEMO_CURRENT_UID?.trim();

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('\n[fix] ERROR: GOOGLE_APPLICATION_CREDENTIALS is not set.\n');
  process.exit(1);
}
if (!uid) {
  console.error('\n[fix] ERROR: Set FIX_UID (or DEMO_CURRENT_UID) to the Firebase UID to fix.\n');
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.applicationDefault() });
const db = admin.firestore();

async function fix() {
  console.log(`\n[fix] uid: ${uid}`);

  // Read current photoURL from users/{uid}
  const userSnap = await db.collection('users').doc(uid!).get();
  if (!userSnap.exists) {
    console.error(`[fix] users/${uid} not found in Firestore.`);
    process.exit(1);
  }
  const photoURL: string | null = (userSnap.data()?.photoURL as string | undefined) ?? null;
  console.log(`[fix] current photoURL: ${photoURL ? photoURL.slice(0, 80) + '...' : 'null'}\n`);

  // Query owned travelGroups and publicTrips in parallel
  const [groupsSnap, tripsSnap] = await Promise.all([
    db.collection('travelGroups').where('ownerUid', '==', uid).get(),
    db.collection('publicTrips').where('ownerUid', '==', uid).get(),
  ]);

  console.log(`[fix] travelGroups owned: ${groupsSnap.size}`);
  console.log(`[fix] publicTrips owned:  ${tripsSnap.size}`);

  if (groupsSnap.empty && tripsSnap.empty) {
    console.log('\n[fix] Nothing to update — no docs owned by this uid.\n');
    return;
  }

  const batch = db.batch();
  const ts = admin.firestore.FieldValue.serverTimestamp();

  for (const d of groupsSnap.docs) {
    const old = (d.data().ownerPhotoURL as string | null) ?? null;
    console.log(`  group ${d.id}: ${old ? old.slice(0, 60) + '...' : 'null'} → updated`);
    batch.update(d.ref, { ownerPhotoURL: photoURL, updatedAt: ts });
  }
  for (const d of tripsSnap.docs) {
    const old = (d.data().ownerPhotoURL as string | null) ?? null;
    console.log(`  trip  ${d.id}: ${old ? old.slice(0, 60) + '...' : 'null'} → updated`);
    batch.update(d.ref, { ownerPhotoURL: photoURL, updatedAt: ts });
  }

  await batch.commit();
  console.log(`\n[fix] ✅ Updated ${groupsSnap.size + tripsSnap.size} docs.\n`);
}

fix().catch((err) => {
  console.error('[fix] FAILED:', err);
  process.exit(1);
});
