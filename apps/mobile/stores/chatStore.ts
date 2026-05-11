import { create } from 'zustand';
import type { DirectChat, TravelGroup } from '@solotravelsoul/shared';

interface ChatState {
  directChats: DirectChat[];
  groups: TravelGroup[];
  loadingChats: boolean;

  setDirectChats: (chats: DirectChat[]) => void;
  setGroups: (groups: TravelGroup[]) => void;
  setLoadingChats: (v: boolean) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  directChats: [],
  groups: [],
  loadingChats: false,

  setDirectChats: (directChats) => set({ directChats }),
  setGroups: (groups) => set({ groups }),
  setLoadingChats: (loadingChats) => set({ loadingChats }),
}));

// ── Derived ───────────────────────────────────────────────────────────

export function totalChatUnread(
  uid: string,
  chats: DirectChat[],
  groups: TravelGroup[],
): number {
  const dm = chats.reduce((n, c) => n + (c.unreadCounts[uid] ?? 0), 0);
  const grp = groups.reduce((n, g) => n + (g.unreadCounts[uid] ?? 0), 0);
  return dm + grp;
}
