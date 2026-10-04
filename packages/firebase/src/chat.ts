import {
  collection,
  doc,
  getDoc,
  setDoc,
  writeBatch,
  runTransaction,
  updateDoc,
  arrayUnion,
  arrayRemove,
  deleteField,
  FieldPath,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  increment,
  Timestamp,
  type DocumentData,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firestore';
import type {
  DirectChat,
  DirectMessage,
  TravelGroup,
  TravelGroupMessage,
  UserLookup,
  ChatParticipantInfo,
} from '@solotravelsoul/shared';

// ── Helpers ───────────────────────────────────────────────────────────

function tsToDate(value: unknown): Date {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return new Date();
}

function docToDirectChat(id: string, d: DocumentData): DirectChat {
  return {
    id,
    participants: d.participants ?? [],
    participantInfo: d.participantInfo ?? {},
    lastMessage: d.lastMessage
      ? {
          text: d.lastMessage.text ?? '',
          senderId: d.lastMessage.senderId ?? '',
          sentAt: tsToDate(d.lastMessage.sentAt),
        }
      : null,
    updatedAt: tsToDate(d.updatedAt),
    unreadCounts: d.unreadCounts ?? {},
  };
}

function docToDirectMessage(id: string, d: DocumentData): DirectMessage {
  return {
    id,
    senderId: d.senderId,
    text: d.text,
    sentAt: tsToDate(d.sentAt),
    clientId: d.clientId ?? id,
    status: 'sent',
  };
}

function docToTravelGroup(id: string, d: DocumentData): TravelGroup {
  return {
    id,
    name: d.name ?? '',
    createdBy: d.createdBy ?? '',
    members: d.members ?? [],
    memberInfo: d.memberInfo ?? {},
    tripId: d.tripId ?? undefined,
    lastMessage: d.lastMessage
      ? {
          text: d.lastMessage.text ?? '',
          senderId: d.lastMessage.senderId ?? '',
          senderName: d.lastMessage.senderName,
          sentAt: tsToDate(d.lastMessage.sentAt),
        }
      : null,
    updatedAt: tsToDate(d.updatedAt),
    unreadCounts: d.unreadCounts ?? {},
    createdAt: tsToDate(d.createdAt),
  };
}

function docToGroupMessage(id: string, d: DocumentData): TravelGroupMessage {
  return {
    id,
    senderId: d.senderId,
    senderName: d.senderName ?? '',
    text: d.text,
    type: d.type ?? 'user',
    sentAt: tsToDate(d.sentAt),
    clientId: d.clientId ?? id,
    status: 'sent',
  };
}

// ── Deterministic chat ID ─────────────────────────────────────────────

export function directChatId(uid1: string, uid2: string): string {
  return [uid1, uid2].sort().join('_');
}

// ── User lookup ───────────────────────────────────────────────────────

export async function upsertUserLookup(
  uid: string,
  displayName: string,
  email: string,
  initials: string,
  photoURL?: string | null,
): Promise<void> {
  const directoryRef = doc(db, 'userLookup', uid);
  const previous = await getDoc(directoryRef);
  const data = { uid, displayName, email: email.trim().toLowerCase(), initials,
    ...(photoURL !== undefined ? { photoURL: photoURL ?? null } : {}) };
  const batch = writeBatch(db);
  const oldEmail = previous.data()?.email as string | undefined;
  if (oldEmail && emailLookupId(oldEmail) !== emailLookupId(email)) {
    batch.delete(doc(db, 'userLookupByEmail', emailLookupId(oldEmail)));
  }
  batch.set(directoryRef, data);
  batch.set(doc(db, 'userLookupByEmail', emailLookupId(email)), data);
  await batch.commit();
}

export function emailLookupId(email: string): string {
  return email.trim().toLowerCase().replace(/%/g, '%25').replace(/\//g, '%2F');
}

export async function searchUserByEmail(email: string): Promise<UserLookup | null> {
  const snap = await getDoc(doc(db, 'userLookupByEmail', emailLookupId(email)));
  return snap.exists() ? snap.data() as UserLookup : null;
}

// ── Direct chats ──────────────────────────────────────────────────────

export function subscribeToDirectChats(
  uid: string,
  callback: (chats: DirectChat[]) => void,
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, 'direct_chats'),
      where('participants', 'array-contains', uid),
      orderBy('updatedAt', 'desc'),
    ),
    (snap) => {
      if (process.env.NODE_ENV !== 'production') console.log('[Chats] direct_chats:', snap.docs.length);
      callback(snap.docs.map((d) => docToDirectChat(d.id, d.data())));
    },
    (err) => { if (err.code !== 'cancelled') callback([]); },
  );
}

/**
 * Returns the chatId. Creates the document only if it doesn't already exist.
 *
 * NOTE: The Firestore read rule allows resource==null so that getDoc on a
 * not-yet-created chat does not throw PERMISSION_DENIED.
 */
export async function getOrCreateDirectChat(
  uid1: string,
  info1: ChatParticipantInfo,
  uid2: string,
  info2: ChatParticipantInfo,
): Promise<string> {
  const chatId = directChatId(uid1, uid2);
  const ref = doc(db, 'direct_chats', chatId);

  let snap;
  try {
    snap = await getDoc(ref);
  } catch (err) {
    const e = err as { code?: string; message?: string };
    console.error('[chat] getDoc failed', e.code, e.message);
    throw err;
  }

  if (!snap.exists()) {
    const sorted = [uid1, uid2].sort();
    try {
      await setDoc(ref, {
        participants: sorted,
        participantInfo: { [uid1]: info1, [uid2]: info2 },
        lastMessage: null,
        updatedAt: serverTimestamp(),
        unreadCounts: { [uid1]: 0, [uid2]: 0 },
      });
    } catch (err) {
      const e = err as { code?: string; message?: string };
      console.error('[chat] setDoc failed', e.code, e.message);
      throw err;
    }
  }

  return chatId;
}

export function subscribeToDirectMessages(
  chatId: string,
  callback: (messages: DirectMessage[]) => void,
  msgLimit = 60,
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, 'direct_chats', chatId, 'messages'),
      orderBy('sentAt', 'desc'),
      limit(msgLimit),
    ),
    (snap) => callback(snap.docs.map((d) => docToDirectMessage(d.id, d.data())).reverse()),
  );
}

/**
 * Message and preview/unread metadata commit together. Reusing clientId is a
 * no-op after a successful commit, compatible with immutable message rules.
 */
export async function sendDirectMessage(
  chatId: string,
  senderId: string,
  text: string,
  clientId: string,
  _otherUids: string[],
): Promise<void> {
  const messageRef = doc(db, 'direct_chats', chatId, 'messages', clientId);
  const chatRef = doc(db, 'direct_chats', chatId);
  await runTransaction(db, async (tx) => {
    const [message, chat] = await Promise.all([tx.get(messageRef), tx.get(chatRef)]);
    if (message.exists()) return; // A previous attempt committed both writes.
    if (!chat.exists()) throw new Error('Chat not found');
    const participants: string[] = chat.data().participants;
    const unread: Record<string, ReturnType<typeof increment>> = {};
    // Use persisted participants, never caller-supplied recipients.
    participants.filter((uid) => uid !== senderId).forEach((uid) => { unread[`unreadCounts.${uid}`] = increment(1); });
    tx.set(messageRef, { senderId, text: text.trim(), sentAt: serverTimestamp(), clientId });
    tx.update(chatRef, { lastMessage: { text: text.trim(), senderId, messageId: clientId, sentAt: serverTimestamp() }, updatedAt: serverTimestamp(), ...unread });
  });
}

export async function markDirectChatRead(chatId: string, uid: string): Promise<void> {
  await updateDoc(doc(db, 'direct_chats', chatId), {
    [`unreadCounts.${uid}`]: 0,
  });
}

// ── Groups ────────────────────────────────────────────────────────────

export function subscribeToGroups(
  uid: string,
  callback: (groups: TravelGroup[]) => void,
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, 'groups'),
      where('members', 'array-contains', uid),
      orderBy('updatedAt', 'desc'),
    ),
    (snap) => {
      if (process.env.NODE_ENV !== 'production') console.log('[Chats] group chats:', snap.docs.length);
      const ready = snap.docs.filter((d) => !((d.data().pendingMembers as string[] | undefined)?.length));
      // Creation interrupted between chunks (app killed, offline): the creator's
      // client finishes it — or rolls it back — whenever it sees the group again.
      snap.docs
        .filter((d) => d.data().createdBy === uid && (d.data().pendingMembers as string[] | undefined)?.length)
        .forEach((d) => resumeGroupCreation(d.id));
      callback(ready.map((d) => docToTravelGroup(d.id, d.data())));
    },
    (err) => { if (err.code !== 'cancelled') callback([]); },
  );
}

// Rules check each newly added member against the account-deletion barrier
// and accept at most this many additions per write.
const GROUP_MEMBERS_PER_WRITE = 8;

/**
 * Creates a group in resumable chunks. Members beyond the first chunk are held
 * in `pendingMembers`; a group with pending members is hidden from every
 * member's list until creation completes, so an interruption (between chunks
 * or while dropping a refused member) never exposes a half-built group. A
 * member the rules refuse (e.g. their account is being deleted) is dropped,
 * together with their name and unread entry; everyone else is kept.
 */
export async function createGroup(
  createdBy: string,
  name: string,
  members: string[],
  memberInfo: Record<string, ChatParticipantInfo>,
  tripId?: string,
): Promise<string> {
  const groupRef = doc(collection(db, 'groups'));
  const ordered = [createdBy, ...members.filter((m) => m !== createdBy)];
  await setDoc(groupRef, {
    name: name.trim(),
    createdBy,
    members: ordered.slice(0, GROUP_MEMBERS_PER_WRITE),
    pendingMembers: ordered.slice(GROUP_MEMBERS_PER_WRITE),
    memberInfo,
    tripId: tripId ?? null,
    lastMessage: null,
    updatedAt: serverTimestamp(),
    unreadCounts: Object.fromEntries(ordered.map((m) => [m, 0])),
    createdAt: serverTimestamp(),
  });
  await completeGroupCreation(groupRef.id);
  return groupRef.id;
}

const isDenied = (err: unknown) => (err as { code?: string }).code === 'permission-denied';

/** Moves pending members into the group chunk by chunk; idempotent and safe to repeat. */
export async function completeGroupCreation(groupId: string): Promise<void> {
  const ref = doc(db, 'groups', groupId);
  for (;;) {
    const snap = await getDoc(ref);
    const pending = (snap.exists() ? (snap.data().pendingMembers as string[] | undefined) : undefined) ?? [];
    if (pending.length === 0) return;
    const chunk = pending.slice(0, GROUP_MEMBERS_PER_WRITE);
    try {
      await updateDoc(ref, { members: arrayUnion(...chunk), pendingMembers: arrayRemove(...chunk) });
    } catch (err) {
      if (!isDenied(err)) throw err;
      // Find the refused member(s) one at a time and drop only them.
      for (const member of chunk) {
        try {
          await updateDoc(ref, { members: arrayUnion(member), pendingMembers: arrayRemove(member) });
        } catch (memberErr) {
          if (!isDenied(memberErr)) throw memberErr;
          await updateDoc(ref, new FieldPath('pendingMembers'), arrayRemove(member),
            new FieldPath('memberInfo', member), deleteField(),
            new FieldPath('unreadCounts', member), deleteField());
        }
      }
    }
  }
}

const resumingGroups = new Set<string>();
function resumeGroupCreation(groupId: string): void {
  if (resumingGroups.has(groupId)) return;
  resumingGroups.add(groupId);
  completeGroupCreation(groupId)
    .catch(() => {})
    .finally(() => resumingGroups.delete(groupId));
}

export function subscribeToGroupMessages(
  groupId: string,
  callback: (messages: TravelGroupMessage[]) => void,
  msgLimit = 60,
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, 'groups', groupId, 'messages'),
      orderBy('sentAt', 'desc'),
      limit(msgLimit),
    ),
    (snap) => callback(snap.docs.map((d) => docToGroupMessage(d.id, d.data())).reverse()),
  );
}

export async function sendGroupMessage(
  groupId: string,
  senderId: string,
  senderName: string,
  text: string,
  clientId: string,
  type: 'user' | 'system' = 'user',
): Promise<void> {
  const messageRef = doc(db, 'groups', groupId, 'messages', clientId);
  const groupRef = doc(db, 'groups', groupId);
  await runTransaction(db, async (tx) => {
    const [message, group] = await Promise.all([tx.get(messageRef), tx.get(groupRef)]);
    if (message.exists()) return;
    if (!group.exists()) throw new Error('Group not found');
    const unread: Record<string, ReturnType<typeof increment>> = {};
    const members: string[] = group.data().members;
    members.filter((uid) => uid !== senderId).forEach((uid) => { unread[`unreadCounts.${uid}`] = increment(1); });
    tx.set(messageRef, { senderId, senderName, text: text.trim(), type, sentAt: serverTimestamp(), clientId });
    tx.update(groupRef, { lastMessage: { text: text.trim(), senderId, senderName, sentAt: Timestamp.now() }, updatedAt: serverTimestamp(), ...unread });
  });
}

export async function markGroupRead(groupId: string, uid: string): Promise<void> {
  await updateDoc(doc(db, 'groups', groupId), {
    [`unreadCounts.${uid}`]: 0,
  });
}

export async function getGroup(groupId: string): Promise<TravelGroup | null> {
  const snap = await getDoc(doc(db, 'groups', groupId));
  if (!snap.exists()) return null;
  return docToTravelGroup(snap.id, snap.data());
}
