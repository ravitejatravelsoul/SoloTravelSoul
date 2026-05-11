import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
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
): Promise<void> {
  await setDoc(doc(db, 'userLookup', uid), { uid, displayName, email: email.toLowerCase(), initials });
}

export async function searchUserByEmail(email: string): Promise<UserLookup | null> {
  const snap = await getDocs(
    query(collection(db, 'userLookup'), where('email', '==', email.toLowerCase().trim())),
  );
  if (snap.empty) return null;
  return snap.docs[0].data() as UserLookup;
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
    (snap) => callback(snap.docs.map((d) => docToDirectChat(d.id, d.data()))),
    (err) => { if (err.code !== 'cancelled') callback([]); },
  );
}

/** Returns the chatId. Creates the document only if it doesn't already exist. */
export async function getOrCreateDirectChat(
  uid1: string,
  info1: ChatParticipantInfo,
  uid2: string,
  info2: ChatParticipantInfo,
): Promise<string> {
  const chatId = directChatId(uid1, uid2);
  const ref = doc(db, 'direct_chats', chatId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const sorted = [uid1, uid2].sort();
    await setDoc(ref, {
      participants: sorted,
      participantInfo: { [uid1]: info1, [uid2]: info2 },
      lastMessage: null,
      updatedAt: serverTimestamp(),
      unreadCounts: { [uid1]: 0, [uid2]: 0 },
    });
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
      orderBy('sentAt', 'asc'),
      limit(msgLimit),
    ),
    (snap) => callback(snap.docs.map((d) => docToDirectMessage(d.id, d.data()))),
  );
}

/**
 * clientId doubles as the Firestore document ID — setDoc is idempotent,
 * so retrying after a network failure will not create duplicate messages.
 */
export async function sendDirectMessage(
  chatId: string,
  senderId: string,
  text: string,
  clientId: string,
  otherUids: string[],
): Promise<void> {
  await setDoc(doc(db, 'direct_chats', chatId, 'messages', clientId), {
    senderId,
    text: text.trim(),
    sentAt: serverTimestamp(),
    clientId,
  });

  const unreadIncrements: Record<string, ReturnType<typeof increment>> = {};
  otherUids.forEach((uid) => {
    unreadIncrements[`unreadCounts.${uid}`] = increment(1);
  });

  await updateDoc(doc(db, 'direct_chats', chatId), {
    lastMessage: { text: text.trim(), senderId, sentAt: Timestamp.now() },
    updatedAt: serverTimestamp(),
    ...unreadIncrements,
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
    (snap) => callback(snap.docs.map((d) => docToTravelGroup(d.id, d.data()))),
    (err) => { if (err.code !== 'cancelled') callback([]); },
  );
}

export async function createGroup(
  createdBy: string,
  name: string,
  members: string[],
  memberInfo: Record<string, ChatParticipantInfo>,
  tripId?: string,
): Promise<string> {
  const groupRef = doc(collection(db, 'groups'));
  await setDoc(groupRef, {
    name: name.trim(),
    createdBy,
    members,
    memberInfo,
    tripId: tripId ?? null,
    lastMessage: null,
    updatedAt: serverTimestamp(),
    unreadCounts: Object.fromEntries(members.map((m) => [m, 0])),
    createdAt: serverTimestamp(),
  });
  return groupRef.id;
}

export function subscribeToGroupMessages(
  groupId: string,
  callback: (messages: TravelGroupMessage[]) => void,
  msgLimit = 60,
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, 'groups', groupId, 'messages'),
      orderBy('sentAt', 'asc'),
      limit(msgLimit),
    ),
    (snap) => callback(snap.docs.map((d) => docToGroupMessage(d.id, d.data()))),
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
  await setDoc(doc(db, 'groups', groupId, 'messages', clientId), {
    senderId,
    senderName,
    text: text.trim(),
    type,
    sentAt: serverTimestamp(),
    clientId,
  });

  const unreadIncrements: Record<string, ReturnType<typeof increment>> = {};
  const groupSnap = await getDoc(doc(db, 'groups', groupId));
  if (groupSnap.exists()) {
    const members: string[] = groupSnap.data().members ?? [];
    members
      .filter((m) => m !== senderId)
      .forEach((uid) => {
        unreadIncrements[`unreadCounts.${uid}`] = increment(1);
      });
  }

  await updateDoc(doc(db, 'groups', groupId), {
    lastMessage: { text: text.trim(), senderId, senderName, sentAt: Timestamp.now() },
    updatedAt: serverTimestamp(),
    ...unreadIncrements,
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
