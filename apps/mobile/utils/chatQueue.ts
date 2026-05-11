import AsyncStorage from '@react-native-async-storage/async-storage';
import { sendDirectMessage, sendGroupMessage } from '@solotravelsoul/firebase';

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

export type ChatSyncResult = { succeeded: number; failed: number };

const MAX_RETRIES = 3;
const queueKey = (uid: string) => `@sts:chatqueue:${uid}`;

// ── Storage ───────────────────────────────────────────────────────────

async function load(uid: string): Promise<ChatQueueEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(queueKey(uid));
    return raw ? (JSON.parse(raw) as ChatQueueEntry[]) : [];
  } catch {
    return [];
  }
}

async function save(uid: string, queue: ChatQueueEntry[]): Promise<void> {
  try {
    await AsyncStorage.setItem(queueKey(uid), JSON.stringify(queue));
  } catch {
    // silently skip — op will be retried on next launch
  }
}

// ── Public API ────────────────────────────────────────────────────────

export async function getChatQueueSize(uid: string): Promise<number> {
  return (await load(uid)).length;
}

export async function enqueueChatOp(uid: string, op: ChatQueuedOp): Promise<void> {
  const queue = await load(uid);
  queue.push({ op, createdAt: Date.now(), retries: 0 });
  await save(uid, queue);
}

export async function processChatQueue(uid: string): Promise<ChatSyncResult> {
  const queue = await load(uid);
  if (queue.length === 0) return { succeeded: 0, failed: 0 };

  const remaining: ChatQueueEntry[] = [];
  let succeeded = 0;
  let failed = 0;

  for (const entry of queue) {
    try {
      await applyChatOp(entry.op);
      succeeded++;
    } catch (err) {
      if (isNetworkError(err)) {
        remaining.push(entry, ...queue.slice(queue.indexOf(entry) + 1));
        break;
      }
      if (entry.retries >= MAX_RETRIES) {
        failed++;
      } else {
        remaining.push({ ...entry, retries: entry.retries + 1 });
        failed++;
      }
    }
  }

  await save(uid, remaining);
  return { succeeded, failed };
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
