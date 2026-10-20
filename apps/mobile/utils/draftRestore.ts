/** Text handed back to a message composer after a send was refused. `key` changes on every restore. */
export interface DraftRestore {
  key: number;
  text: string;
}

let counter = 0;

export function nextRestore(text: string): DraftRestore {
  counter += 1;
  return { key: counter, text };
}

/** Puts a restored draft back without discarding anything typed since (the new text follows the old). */
export function mergeDraft(current: string, restored: string): string {
  return current.trim() ? `${restored}\n${current}` : restored;
}

// Texts of queued sends the server refused after the fact (e.g. sent offline, account suspended meanwhile). They are
// never delivered; they wait here so the conversation can hand them back to the composer, whenever it is opened.
const undelivered = new Map<string, string[]>();
const undeliveredKey = (uid: string, target: string) => `${uid}:${target}`;

export function stashUndelivered(uid: string, target: string, text: string): void {
  const key = undeliveredKey(uid, target);
  undelivered.set(key, [...(undelivered.get(key) ?? []), text]);
}

export function takeUndelivered(uid: string, target: string): string[] {
  const key = undeliveredKey(uid, target);
  const texts = undelivered.get(key) ?? [];
  undelivered.delete(key);
  return texts;
}
