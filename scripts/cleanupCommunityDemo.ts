/**
 * cleanupCommunityDemo.ts
 *
 * Firebase Admin SDK — deletes all Firestore documents where demo === true.
 * Also deletes subcollections (chat messages) for seeded demo chat/group docs.
 *
 * Usage:
 *   export GOOGLE_APPLICATION_CREDENTIALS=path/to/serviceAccountKey.json
 *   npx tsx scripts/cleanupCommunityDemo.ts
 */

import * as admin from 'firebase-admin';

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('\n[cleanup] ERROR: GOOGLE_APPLICATION_CREDENTIALS is not set.\n');
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.applicationDefault() });
const db = admin.firestore();

// Top-level collections where demo:true docs live
const TOP_LEVEL_COLLECTIONS = [
  'publicProfiles',
  'publicTrips',
  'travelGroups',
  'activityFeed',
  'nearbyTravelers',
  'tripJoinRequests',
  'groupJoinRequests',
];

// Collections that have subcollections to delete first
const CHAT_COLLECTIONS = [
  { parent: 'direct_chats', sub: 'messages' },
  { parent: 'groups', sub: 'messages' },
];

async function deleteDemoSubcollection(parentCol: string, parentId: string, subCol: string): Promise<number> {
  const snap = await db.collection(parentCol).doc(parentId).collection(subCol).where('demo', '==', true).get();
  if (snap.empty) {
    // Also try without demo field (messages use demo flag too, but old seeds might not)
    const allSnap = await db.collection(parentCol).doc(parentId).collection(subCol).get();
    if (allSnap.empty) return 0;
    const batch = db.batch();
    for (const doc of allSnap.docs) {
      batch.delete(doc.ref);
    }
    await batch.commit();
    return allSnap.docs.length;
  }
  const batch = db.batch();
  for (const doc of snap.docs) {
    batch.delete(doc.ref);
  }
  await batch.commit();
  return snap.docs.length;
}

async function deleteDemoTopLevel(collection: string): Promise<number> {
  const snap = await db.collection(collection).where('demo', '==', true).get();
  if (snap.empty) return 0;

  let deleted = 0;
  // Batch in chunks of 500
  for (let i = 0; i < snap.docs.length; i += 500) {
    const batch = db.batch();
    for (const docRef of snap.docs.slice(i, i + 500)) {
      batch.delete(docRef.ref);
    }
    await batch.commit();
    deleted += Math.min(500, snap.docs.length - i);
  }
  return deleted;
}

async function cleanup() {
  console.log('\n[cleanup] Deleting demo community data...\n');
  let total = 0;

  // Delete subcollections first (messages inside demo chats/groups)
  for (const { parent, sub } of CHAT_COLLECTIONS) {
    const parentSnap = await db.collection(parent).where('demo', '==', true).get();
    let subTotal = 0;
    for (const parentDoc of parentSnap.docs) {
      const count = await deleteDemoSubcollection(parent, parentDoc.id, sub);
      subTotal += count;
    }
    if (subTotal > 0) {
      console.log(`[cleanup] ${parent}/${sub}: deleted ${subTotal} demo messages`);
      total += subTotal;
    }
  }

  // Delete top-level demo docs
  for (const col of TOP_LEVEL_COLLECTIONS) {
    const count = await deleteDemoTopLevel(col);
    console.log(`[cleanup] ${col}: deleted ${count} demo docs`);
    total += count;
  }

  // Delete demo direct_chats and groups (after their subcollections)
  for (const { parent } of CHAT_COLLECTIONS) {
    const count = await deleteDemoTopLevel(parent);
    if (count > 0) {
      console.log(`[cleanup] ${parent}: deleted ${count} demo docs`);
      total += count;
    }
  }

  console.log(`\n[cleanup] ✅ Done. ${total} total demo documents deleted.\n`);
}

cleanup().catch((err) => {
  console.error('[cleanup] FAILED:', err);
  process.exit(1);
});
