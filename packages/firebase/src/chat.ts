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
  GroupInvite,
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
    deletedParticipants: Array.isArray(d.deletedParticipants) ? d.deletedParticipants : [],
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
        createdBy: uid1,
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
      callback(snap.docs.map((d) => docToTravelGroup(d.id, d.data())));
    },
    (err) => { if (err.code !== 'cancelled') callback([]); },
  );
}

/**
 * Creates a group chat with only its creator in it. Nobody is added by someone else: other people join by
 * accepting an invitation (inviteToGroup / respondToGroupInvite).
 */
export async function createGroup(
  createdBy: string,
  name: string,
  creatorInfo: ChatParticipantInfo,
  tripId?: string,
): Promise<string> {
  const groupRef = doc(collection(db, 'groups'));
  await setDoc(groupRef, {
    name: name.trim(),
    createdBy,
    members: [createdBy],
    memberInfo: { [createdBy]: creatorInfo },
    tripId: tripId ?? null,
    lastMessage: null,
    updatedAt: serverTimestamp(),
    unreadCounts: { [createdBy]: 0 },
    createdAt: serverTimestamp(),
  });
  return groupRef.id;
}

// ── Group invitations ─────────────────────────────────────────────────
// An invitation is addressed to an e-mail address, so the inviter learns nothing about whether an account exists
// and nobody's profile is looked up. The person it names sees it in their Chats, can accept or decline, and
// joins only by accepting.

/** Invitations expire after a week (the rules allow up to two, which leaves room for device clock error). */
export const GROUP_INVITE_DAYS = 7;

function docToGroupInvite(id: string, d: DocumentData): GroupInvite {
  return {
    id,
    groupId: d.groupId ?? '',
    groupName: d.groupName ?? '',
    inviterUid: d.inviterUid ?? '',
    inviterName: d.inviterName ?? '',
    inviteeEmail: d.inviteeEmail ?? '',
    status: d.status ?? 'pending',
    createdAt: tsToDate(d.createdAt),
    expiresAt: tsToDate(d.expiresAt),
  };
}

export function groupInviteId(groupId: string, email: string): string {
  return `${groupId}_${emailLookupId(email)}`;
}

/** Sends (or re-sends after a decline, cancellation or expiry) an invitation. Never reveals whether the address has an account. */
export async function inviteToGroup(
  group: { id: string; name: string },
  inviter: { uid: string; name: string },
  email: string,
): Promise<void> {
  const inviteeEmail = email.trim().toLowerCase();
  const ref = doc(db, 'groupInvites', groupInviteId(group.id, inviteeEmail));
  const expiresAt = Timestamp.fromMillis(Date.now() + GROUP_INVITE_DAYS * 24 * 60 * 60 * 1000);
  const data = {
    groupId: group.id,
    groupName: group.name,
    inviterUid: inviter.uid,
    inviterName: inviter.name,
    inviteeEmail,
    status: 'pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    expiresAt,
  };
  // A declined or accepted invitation is final (the rules refuse to overwrite it); a cancelled or expired one can be re-sent.
  await setDoc(ref, data);
}

/** The invitations addressed to the signed-in person's e-mail that they can still act on. */
export function subscribeToMyGroupInvites(
  email: string,
  callback: (invites: GroupInvite[]) => void,
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, 'groupInvites'),
      where('inviteeEmail', '==', email.trim().toLowerCase()),
      where('status', '==', 'pending'),
    ),
    (snap) => {
      const now = Date.now();
      callback(snap.docs.map((d) => docToGroupInvite(d.id, d.data())).filter((i) => i.expiresAt.getTime() > now));
    },
    (err) => { if (err.code !== 'cancelled') callback([]); },
  );
}

/** The invitations this person sent for one group (creator view): pending ones can be withdrawn. */
export function subscribeToGroupInvitesSent(
  groupId: string,
  inviterUid: string,
  callback: (invites: GroupInvite[]) => void,
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, 'groupInvites'),
      where('inviterUid', '==', inviterUid),
      where('groupId', '==', groupId),
    ),
    (snap) => callback(snap.docs.map((d) => docToGroupInvite(d.id, d.data()))),
    (err) => { if (err.code !== 'cancelled') callback([]); },
  );
}

export async function cancelGroupInvite(inviteId: string): Promise<void> {
  await updateDoc(doc(db, 'groupInvites', inviteId), { status: 'cancelled', updatedAt: serverTimestamp() });
}

export async function declineGroupInvite(inviteId: string): Promise<void> {
  await updateDoc(doc(db, 'groupInvites', inviteId), { status: 'declined', updatedAt: serverTimestamp() });
}

/**
 * Accepting joins the group and marks the invitation accepted in one atomic batch. The rules check that the
 * invitation is addressed to the signed-in e-mail, still pending and not expired, and that nothing else about the
 * group changes.
 */
export async function acceptGroupInvite(invite: GroupInvite, me: { uid: string; info: ChatParticipantInfo }): Promise<void> {
  const batch = writeBatch(db);
  const inviteRef = doc(db, 'groupInvites', invite.id);
  const groupRef = doc(db, 'groups', invite.groupId);
  batch.update(inviteRef, { status: 'accepted', updatedAt: serverTimestamp() });
  batch.update(
    groupRef,
    new FieldPath('members'), arrayUnion(me.uid),
    new FieldPath('memberInfo', me.uid), me.info,
    new FieldPath('unreadCounts', me.uid), 0,
    new FieldPath('updatedAt'), serverTimestamp(),
  );
  await batch.commit();
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

/**
 * A member (not the creator) leaves a group chat. A short system message is posted first (only members may
 * post); if that fails the member still leaves. The rules accept exactly this change from a non-creator:
 * only `members`, minus the member themselves.
 */
export async function leaveChatGroup(groupId: string, uid: string, displayName: string): Promise<void> {
  await sendGroupMessage(groupId, uid, displayName, `${displayName} left the group`, `left-${uid}-${Date.now()}`, 'system').catch(() => {});
  await updateDoc(doc(db, 'groups', groupId), { members: arrayRemove(uid) });
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
