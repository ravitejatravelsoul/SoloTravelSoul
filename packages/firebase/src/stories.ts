/**
 * Story architecture — feature-flagged.
 * All exports are no-ops when EXPO_PUBLIC_STORIES_ENABLED != 'true'.
 * Import nothing from here in production screens unless checking the flag first.
 */

import {
  collection,
  doc,
  setDoc,
  getDocs,
  updateDoc,
  arrayUnion,
  serverTimestamp,
  query,
  where,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firestore';
import type { TravelStory } from '@solotravelsoul/shared';

const STORIES_ENABLED = false; // Server-side guard — always off until feature launches

function tsToDate(v: unknown): Date {
  if (v instanceof Timestamp) return v.toDate();
  return new Date();
}

export async function createStory(
  authorId: string,
  authorName: string,
  authorPhoto: string | null,
  images: string[]
): Promise<string | null> {
  if (!STORIES_ENABLED) return null;
  const ref = doc(collection(db, 'travelStories'));
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await setDoc(ref, {
    storyId: ref.id,
    authorId,
    authorName,
    authorPhoto,
    images,
    viewerIds: [],
    expiresAt: Timestamp.fromDate(expiresAt),
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getActiveStories(): Promise<TravelStory[]> {
  if (!STORIES_ENABLED) return [];
  try {
    const now = Timestamp.now();
    const snap = await getDocs(
      query(
        collection(db, 'travelStories'),
        where('expiresAt', '>', now),
        orderBy('expiresAt', 'asc')
      )
    );
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        storyId: d.id,
        authorId: data.authorId as string,
        authorName: data.authorName as string,
        authorPhoto: (data.authorPhoto as string | null) ?? null,
        images: (data.images as string[]) ?? [],
        viewerIds: (data.viewerIds as string[]) ?? [],
        expiresAt: tsToDate(data.expiresAt),
        createdAt: tsToDate(data.createdAt),
      };
    });
  } catch {
    return [];
  }
}

export async function markStoryViewed(storyId: string, viewerUid: string): Promise<void> {
  if (!STORIES_ENABLED) return;
  await updateDoc(doc(db, 'travelStories', storyId), {
    viewerIds: arrayUnion(viewerUid),
  });
}
