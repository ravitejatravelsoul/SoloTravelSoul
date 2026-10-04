import { useMemo } from 'react';
import { useBlockStore } from '@/stores/blockStore';

/** Hides content by users the viewer has blocked (App Store guideline 1.2). */
export function useWithoutBlocked<T extends { authorId: string }>(items: T[]): T[] {
  const blocked = useBlockStore((s) => s.blockedUids);
  return useMemo(
    () => (blocked.length ? items.filter((item) => !blocked.includes(item.authorId)) : items),
    [items, blocked]
  );
}
