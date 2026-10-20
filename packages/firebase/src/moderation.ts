// Moderator workflow: review the report queue and act on content and users.
// Every operation here is enforced by firestore.rules (isModerator()); the
// moderators/{uid} role document is granted only by the project owner via the
// Firebase console or Admin SDK.

import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  deleteDoc,
  updateDoc,
  where,
  limit,
  Timestamp,
  writeBatch,
} from 'firebase/firestore';
import type { ReportTargetType } from '@solotravelsoul/shared';
import { db } from './firestore';

export type ItemModerationStatus = 'visible' | 'hidden' | 'removed';

export type ReportStatus = 'pending' | 'reviewing' | 'actioned' | 'dismissed';

export interface ModerationReport {
  id: string;
  reporterUid: string;
  targetType: ReportTargetType;
  targetId: string;
  reason: string;
  details: string;
  status: ReportStatus;
  createdAt: Date;
}

export interface ReportTargetPreview {
  exists: boolean;
  authorUid: string | null;
  text: string;
  images: string[];
  visibility: string | null;
  /** Trips and community groups: visible, hidden or removed by a moderator. */
  moderationStatus: ItemModerationStatus | null;
}

export async function isModerator(uid: string): Promise<boolean> {
  try {
    return (await getDoc(doc(db, 'moderators', uid))).exists();
  } catch {
    return false;
  }
}

/** Oldest open reports first, so response times can be tracked against targets. */
export function subscribeOpenReports(callback: (reports: ModerationReport[]) => void, max = 100): () => void {
  return onSnapshot(
    query(collection(db, 'reports'), where('status', '==', 'pending'), orderBy('createdAt', 'asc'), limit(max)),
    (snap) =>
      callback(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            reporterUid: data.reporterUid,
            targetType: data.targetType,
            targetId: data.targetId,
            reason: data.reason ?? 'other',
            details: data.details ?? '',
            status: data.status,
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(),
          } as ModerationReport;
        })
      ),
    () => callback([])
  );
}

const TARGET_COLLECTION: Partial<Record<ReportTargetType, string>> = {
  post: 'travelPosts',
  journal: 'travelJournals',
  comment: 'postComments',
  user: 'publicProfiles',
  trip: 'publicTrips',
  group: 'travelGroups',
};

/** What the reported item says/shows, and who owns it (for suspension). */
export async function getReportTarget(report: Pick<ModerationReport, 'targetType' | 'targetId'>): Promise<ReportTargetPreview> {
  const coll = TARGET_COLLECTION[report.targetType];
  // Direct messages stay private: moderators act on the reported user, not the conversation.
  if (!coll) return { exists: false, authorUid: null, text: '', images: [], visibility: null, moderationStatus: null };
  const snap = await getDoc(doc(db, coll, report.targetId));
  if (!snap.exists()) return { exists: false, authorUid: report.targetType === 'user' ? report.targetId : null, text: '', images: [], visibility: null, moderationStatus: null };
  const d = snap.data();
  const authorUid = (d.authorId ?? d.ownerUid ?? d.uid ?? (report.targetType === 'user' ? report.targetId : null)) as string | null;
  const text = [d.caption, d.title, d.subtitle, d.body, d.text, d.displayName, d.bio, d.name, d.description]
    .filter((v) => typeof v === 'string' && v)
    .join('\n');
  const images = [...((d.images as string[] | undefined) ?? []), ...(d.coverImageURL ? [d.coverImageURL as string] : [])];
  return { exists: true, authorUid, text, images, visibility: (d.visibility as string | undefined) ?? null,
    moderationStatus: report.targetType === 'trip' || report.targetType === 'group' ? ((d.moderationStatus as ItemModerationStatus | undefined) ?? 'visible') : null };
}

export async function reviewReport(reportId: string, moderatorUid: string, status: Exclude<ReportStatus, 'pending'>, resolution: string): Promise<void> {
  await updateDoc(doc(db, 'reports', reportId), {
    status,
    resolution: resolution.slice(0, 500),
    reviewedBy: moderatorUid,
    reviewedAt: serverTimestamp(),
  });
}

/** Hide ('under_review'), remove ('removed') or restore ('public', resetting the report count) a post or journal. */
export async function setContentVisibility(
  targetType: 'post' | 'journal',
  targetId: string,
  moderatorUid: string,
  visibility: 'public' | 'under_review' | 'removed'
): Promise<void> {
  await updateDoc(doc(db, targetType === 'post' ? 'travelPosts' : 'travelJournals', targetId), {
    visibility,
    ...(visibility === 'public' ? { reportCount: 0 } : {}),
    moderatedBy: moderatorUid,
    moderatedAt: serverTimestamp(),
  });
}

export async function removeComment(commentId: string, moderatorUid: string): Promise<void> {
  await updateDoc(doc(db, 'postComments', commentId), {
    text: '',
    moderationRemoved: true,
    moderatedBy: moderatorUid,
    moderatedAt: serverTimestamp(),
  });
}

/**
 * Suspended accounts can no longer write or upload anything (same barrier as deletion).
 * The suspension also removes the account from traveler discovery; the suspended
 * account cannot add itself back (rules refuse its writes).
 */
export async function suspendUser(uid: string, moderatorUid: string, reason: string): Promise<void> {
  const batch = writeBatch(db);
  batch.set(doc(db, 'accountSuspensions', uid), {
    suspendedBy: moderatorUid,
    reason: reason.slice(0, 500),
    createdAt: serverTimestamp(),
  });
  batch.delete(doc(db, 'nearbyTravelers', uid));
  await batch.commit();
}

export async function unsuspendUser(uid: string): Promise<void> {
  await deleteDoc(doc(db, 'accountSuspensions', uid));
}

/**
 * Hide ('hidden'), remove ('removed') or restore ('visible') a public trip or a community group. While it is not visible
 * the app leaves it out of discovery and matching, the rules refuse new requests and approvals, and its owner can neither
 * edit, delete nor restore it; members can still leave and anyone can still report it.
 */
export async function setItemModeration(
  targetType: 'trip' | 'group',
  targetId: string,
  moderatorUid: string,
  status: ItemModerationStatus,
): Promise<void> {
  await updateDoc(doc(db, targetType === 'trip' ? 'publicTrips' : 'travelGroups', targetId), {
    moderationStatus: status,
    moderatedBy: moderatorUid,
    moderatedAt: serverTimestamp(),
  });
}

export interface AccountSuspension {
  uid: string;
  reason: string;
  suspendedBy: string;
  createdAt: Date;
}

/** Every account currently suspended (moderators only). */
export function subscribeSuspensions(callback: (suspensions: AccountSuspension[]) => void): () => void {
  return onSnapshot(
    collection(db, 'accountSuspensions'),
    (snap) => callback(snap.docs.map((d) => ({
      uid: d.id,
      reason: (d.data().reason as string | undefined) ?? '',
      suspendedBy: (d.data().suspendedBy as string | undefined) ?? '',
      createdAt: d.data().createdAt instanceof Timestamp ? d.data().createdAt.toDate() : new Date(),
    })).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())),
    () => callback([]),
  );
}

export interface ModeratedItem {
  type: 'trip' | 'group';
  id: string;
  title: string;
  ownerUid: string;
  status: Exclude<ItemModerationStatus, 'visible'>;
  moderatedAt: Date | null;
}

/** Public trips and community groups a moderator has hidden or removed, so they can be reviewed and restored later. */
export function subscribeModeratedItems(callback: (items: ModeratedItem[]) => void): () => void {
  let trips: ModeratedItem[] = [];
  let groups: ModeratedItem[] = [];
  const publish = () => callback([...trips, ...groups].sort((a, b) => (b.moderatedAt?.getTime() ?? 0) - (a.moderatedAt?.getTime() ?? 0)));
  const map = (type: 'trip' | 'group') => (snap: import('firebase/firestore').QuerySnapshot): ModeratedItem[] => snap.docs.map((d) => ({
    type,
    id: d.id,
    title: ((d.data().title ?? d.data().name) as string | undefined) ?? '(untitled)',
    ownerUid: (d.data().ownerUid as string | undefined) ?? '',
    status: d.data().moderationStatus as ModeratedItem['status'],
    moderatedAt: d.data().moderatedAt instanceof Timestamp ? d.data().moderatedAt.toDate() : null,
  }));
  const filter = where('moderationStatus', 'in', ['hidden', 'removed']);
  const unsubTrips = onSnapshot(query(collection(db, 'publicTrips'), filter), (snap) => { trips = map('trip')(snap); publish(); }, () => { trips = []; publish(); });
  const unsubGroups = onSnapshot(query(collection(db, 'travelGroups'), filter), (snap) => { groups = map('group')(snap); publish(); }, () => { groups = []; publish(); });
  return () => { unsubTrips(); unsubGroups(); };
}
