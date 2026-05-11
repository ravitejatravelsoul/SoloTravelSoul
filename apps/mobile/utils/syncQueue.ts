import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  upsertChecklistItem,
  deleteChecklistItem as fbDeleteChecklist,
  upsertItineraryDay,
} from '@solotravelsoul/firebase';
import type { ChecklistItem, ItineraryDay } from '@solotravelsoul/shared';

// ── Types ─────────────────────────────────────────────────────────────

export type QueuedOp =
  | { type: 'checklist.upsert'; tripId: string; item: ChecklistItem }
  | { type: 'checklist.delete'; tripId: string; itemId: string }
  /** Full day snapshot — coalesced (latest wins) per dayId */
  | { type: 'itinerary.day';   tripId: string; dayId: string; day: ItineraryDay };

export interface QueueEntry {
  id: string;
  op: QueuedOp;
  createdAt: number;
  retries: number;
}

export type SyncResult = { succeeded: number; failed: number };

const MAX_RETRIES = 3;

// ── Storage helpers ───────────────────────────────────────────────────

const queueKey = (uid: string) => `@sts:queue:${uid}`;

async function load(uid: string): Promise<QueueEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(queueKey(uid));
    return raw ? (JSON.parse(raw) as QueueEntry[]) : [];
  } catch {
    return [];
  }
}

async function save(uid: string, queue: QueueEntry[]): Promise<void> {
  try {
    await AsyncStorage.setItem(queueKey(uid), JSON.stringify(queue));
  } catch {
    // silently skip — worst case: op is retried on next launch
  }
}

// ── Public API ────────────────────────────────────────────────────────

export async function getQueueSize(uid: string): Promise<number> {
  return (await load(uid)).length;
}

export async function enqueueOp(uid: string, op: QueuedOp): Promise<void> {
  const queue = await load(uid);

  // Coalesce itinerary.day ops — replace any existing pending entry for the same dayId
  // so that only the latest full-day snapshot is kept.
  const filtered =
    op.type === 'itinerary.day'
      ? queue.filter(
          (e) =>
            !(e.op.type === 'itinerary.day' &&
              (e.op as { dayId: string }).dayId === op.dayId)
        )
      : queue;

  filtered.push({
    id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    op,
    createdAt: Date.now(),
    retries: 0,
  });

  await save(uid, filtered);
}

export async function processQueue(uid: string): Promise<SyncResult> {
  const queue = await load(uid);
  if (queue.length === 0) return { succeeded: 0, failed: 0 };

  const remaining: QueueEntry[] = [];
  let succeeded = 0;
  let failed = 0;

  for (const entry of queue) {
    try {
      await applyOp(uid, entry.op);
      succeeded++;
    } catch (err) {
      if (isNetworkError(err)) {
        // Still offline — stop processing and keep everything remaining
        remaining.push(entry, ...queue.slice(queue.indexOf(entry) + 1));
        break;
      }
      if (entry.retries >= MAX_RETRIES) {
        // Exceeded retries — drop and count as failed
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

async function applyOp(uid: string, op: QueuedOp): Promise<void> {
  switch (op.type) {
    case 'checklist.upsert':
      await upsertChecklistItem(uid, op.tripId, reviveChecklistItem(op.item));
      break;
    case 'checklist.delete':
      await fbDeleteChecklist(uid, op.tripId, op.itemId);
      break;
    case 'itinerary.day':
      await upsertItineraryDay(uid, op.tripId, reviveItineraryDay(op.day));
      break;
  }
}

// ── Date revival (JSON serialises Date as string) ─────────────────────

function reviveChecklistItem(item: ChecklistItem): ChecklistItem {
  return { ...item, createdAt: new Date(item.createdAt as unknown as string) };
}

function reviveItineraryDay(day: ItineraryDay): ItineraryDay {
  return {
    ...day,
    date: new Date(day.date as unknown as string),
    journalEntries: day.journalEntries.map((j) => ({
      ...j,
      createdAt: new Date(j.createdAt as unknown as string),
      updatedAt: j.updatedAt ? new Date(j.updatedAt as unknown as string) : undefined,
    })),
  };
}

function isNetworkError(err: unknown): boolean {
  const code = (err as { code?: string }).code;
  return code === 'unavailable' || code === 'failed-precondition';
}
