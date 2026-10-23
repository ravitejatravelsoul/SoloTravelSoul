import AsyncStorage from '@react-native-async-storage/async-storage';
import { sendDirectMessage, sendGroupMessage } from '@solotravelsoul/firebase';
import { withQueueLock } from './queueLock';
import { stashUndelivered } from './draftRestore';

// ── Types ─────────────────────────────────────────────────────────────

export type ChatQueuedOp =
  | {
      type: 'dm.send';
      chatId: string;
      senderId: string;
      text: string;
      clientId: string;
      otherUids: string[];
    }
  | {
      type: 'group.send';
      groupId: string;
      senderId: string;
      senderName: string;
      text: string;
      clientId: string;
    };

interface ChatQueueEntry {
  op: ChatQueuedOp;
  createdAt: number;
  retries: number;
}

/** A queued send the server refused outright; it has been dropped, not kept for retry. */
export type RejectedChatOp = { type: ChatQueuedOp['type']; clientId: string };
export type ChatSyncResult = { succeeded: number; failed: number; rejected: RejectedChatOp[] };

type RejectionListener = (uid: string, ops: RejectedChatOp[]) => void;
const rejectionListeners = new Set<RejectionListener>();

/** Notified after a drain drops sends the server refused (e.g. to clear their pending bubbles). */
export function onChatOpsRejected(listener: RejectionListener): () => void {
  rejectionListeners.add(listener);
  return () => { rejectionListeners.delete(listener); };
}

/**
 * The rules refused the write (e.g. suspended account). Retrying cannot succeed,
 * and replaying it later (after unsuspension) would deliver a message the
 * server rejected, so such sends are dropped and reported instead.
 */
export function isPermanentRejection(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === 'permission-denied';
}

const drains = new Map<string, Promise<ChatSyncResult>>();
/** Sends the live path is attempting right now; a drain leaves these alone so one send is never handled twice. */
const inflight = new Set<string>();

/**
 * How long one send may stay unanswered. While the connection is flapping a Firestore transaction can wait a long
 * time; past this limit the send counts as "not delivered yet" (it stays queued and is retried), never as lost.
 */
export const SEND_TIMEOUT_MS = 20000;

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(Object.assign(new Error('send timed out'), { code: 'unavailable' })), ms);
    work.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}
const queueKey = (uid: string) => `@sts:chatqueue:${uid}`;
const entryKey = (op: ChatQueuedOp) => `${op.type}:${op.type === 'dm.send' ? op.chatId : op.groupId}:${op.clientId}`;

// ── Storage ───────────────────────────────────────────────────────────

async function load(uid: string): Promise<ChatQueueEntry[]> {
  const raw = await AsyncStorage.getItem(queueKey(uid));
  const queue = raw ? JSON.parse(raw) : [];
  if (!Array.isArray(queue)) throw new Error('Invalid chat queue');
  return queue as ChatQueueEntry[];
}

async function save(uid: string, queue: ChatQueueEntry[]): Promise<void> {
  await AsyncStorage.setItem(queueKey(uid), JSON.stringify(queue));
}

// ── Public API ────────────────────────────────────────────────────────

export async function getChatQueueSize(uid: string): Promise<number> {
  return (await load(uid)).length;
}

export async function enqueueChatOp(uid: string, op: ChatQueuedOp): Promise<void> {
  await withQueueLock(queueKey(uid), async () => {
    const queue = await load(uid);
    if (queue.some((e) => entryKey(e.op) === entryKey(op))) return;
    queue.push({ op, createdAt: Date.now(), retries: 0 });
    await save(uid, queue);
  });
}

export async function removeChatOp(uid: string, op: ChatQueuedOp): Promise<void> {
  await withQueueLock(queueKey(uid), async () => {
    const current = await load(uid);
    await save(uid, current.filter((e) => entryKey(e.op) !== entryKey(op)));
  });
}

/** Queued sends for one conversation, oldest first, so a reopened chat shows them as pending instead of hiding them. */
export async function getQueuedChatOps(uid: string, targetId: string): Promise<{ op: ChatQueuedOp; createdAt: number }[]> {
  const queue = await load(uid).catch(() => [] as ChatQueueEntry[]);
  return queue
    .filter((e) => (e.op.type === 'dm.send' ? e.op.chatId : e.op.groupId) === targetId)
    .map((e) => ({ op: e.op, createdAt: e.createdAt }));
}

export type ChatSendResult =
  /** Delivered to the server. */
  | 'sent'
  /** Saved on the device, not yet delivered; the drain delivers it (reconnect, foreground, retry timer). */
  | 'queued'
  /** The server refused it for good (rules): not kept, the caller gives the text back. */
  | 'rejected'
  /** Could neither be saved nor delivered: the caller gives the text back. */
  | 'failed';

/**
 * Send with the message on disk first. The send is written to the queue before anything leaves the device, so closing
 * the app, losing the connection mid-send or a send that never answers cannot make it disappear: it stays queued until
 * the server has it. Delivery is idempotent (the message id is the client id), so a retry after a send that actually
 * reached the server adds nothing twice.
 */
export async function sendChatOp(uid: string, op: ChatQueuedOp, tryNow: boolean): Promise<ChatSendResult> {
  let saved = true;
  try { await enqueueChatOp(uid, op); } catch { saved = false; }
  if (!tryNow && saved) return 'queued';
  const key = entryKey(op);
  inflight.add(key);
  try {
    await withTimeout(applyChatOp(op), SEND_TIMEOUT_MS);
    if (saved) await removeChatOp(uid, op).catch(() => {});
    return 'sent';
  } catch (err) {
    if (isPermanentRejection(err)) {
      if (saved) await removeChatOp(uid, op).catch(() => {});
      return 'rejected';
    }
    return saved ? 'queued' : 'failed';
  } finally {
    inflight.delete(key);
  }
}

export async function processChatQueue(uid: string): Promise<ChatSyncResult> {
  const existing = drains.get(uid);
  if (existing) return existing;
  const drain = drainQueue(uid);
  drains.set(uid, drain);
  try { return await drain; }
  finally { if (drains.get(uid) === drain) drains.delete(uid); }
}

async function drainQueue(uid: string): Promise<ChatSyncResult> {
  const queue = await withQueueLock(queueKey(uid), () => load(uid));
  if (queue.length === 0) return { succeeded: 0, failed: 0, rejected: [] };

  let succeeded = 0;
  let failed = 0;
  const rejected: RejectedChatOp[] = [];
  const remove = (entry: ChatQueueEntry) => withQueueLock(queueKey(uid), async () => {
    const current = await load(uid);
    await save(uid, current.filter((e) => entryKey(e.op) !== entryKey(entry.op)));
  });

  for (const entry of queue) {
    if (inflight.has(entryKey(entry.op))) continue; // the live send is still being attempted
    try {
      await withTimeout(applyChatOp(entry.op), SEND_TIMEOUT_MS);
      await remove(entry);
      succeeded++;
    } catch (err) {
      if (isNetworkError(err)) {
        break;
      }
      if (isPermanentRejection(err)) {
        await remove(entry);
        rejected.push({ type: entry.op.type, clientId: entry.op.clientId });
        stashUndelivered(uid, entry.op.type === 'dm.send' ? entry.op.chatId : entry.op.groupId, entry.op.text);
        failed++;
        continue;
      }
      await withQueueLock(queueKey(uid), async () => {
        const current = await load(uid);
        await save(uid, current.map((e) => entryKey(e.op) === entryKey(entry.op) ? { ...e, retries: e.retries + 1 } : e));
      });
      failed++;
    }
  }

  if (rejected.length > 0) {
    for (const listener of rejectionListeners) {
      try { listener(uid, rejected); } catch { /* a listener must not break the drain */ }
    }
  }
  return { succeeded, failed, rejected };
}

// ── Op executor ───────────────────────────────────────────────────────

async function applyChatOp(op: ChatQueuedOp): Promise<void> {
  switch (op.type) {
    case 'dm.send':
      await sendDirectMessage(op.chatId, op.senderId, op.text, op.clientId, op.otherUids);
      break;
    case 'group.send':
      await sendGroupMessage(op.groupId, op.senderId, op.senderName, op.text, op.clientId);
      break;
  }
}

function isNetworkError(err: unknown): boolean {
  const code = (err as { code?: string }).code;
  return code === 'unavailable' || code === 'failed-precondition';
}
