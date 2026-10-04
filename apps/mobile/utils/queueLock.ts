// Serialize AsyncStorage read/modify/write operations per user/queue. Network
// requests run outside this lock so new edits can be persisted during a drain.
const locks = new Map<string, Promise<void>>();

export async function withQueueLock<T>(key: string, work: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  locks.set(key, current);
  await previous;
  try {
    return await work();
  } finally {
    release();
    if (locks.get(key) === current) locks.delete(key);
  }
}
