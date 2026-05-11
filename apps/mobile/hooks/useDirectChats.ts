import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { subscribeToDirectChats, subscribeToGroups } from '@solotravelsoul/firebase';
import { useAuthStore } from '@/stores/authStore';
import { useChatStore, totalChatUnread } from '@/stores/chatStore';

/**
 * Subscribes to both direct chats and groups for the current user.
 * Keeps chatStore in sync. Call once at the root of the chats tab.
 */
export function useDirectChats() {
  const uid = useAuthStore((s) => s.user?.uid);
  const { directChats, groups, loadingChats, setDirectChats, setGroups, setLoadingChats } =
    useChatStore(
      useShallow((s) => ({
        directChats: s.directChats,
        groups: s.groups,
        loadingChats: s.loadingChats,
        setDirectChats: s.setDirectChats,
        setGroups: s.setGroups,
        setLoadingChats: s.setLoadingChats,
      })),
    );

  useEffect(() => {
    if (!uid) return;

    setLoadingChats(true);

    const unsubDM = subscribeToDirectChats(uid, (chats) => {
      setDirectChats(chats);
      setLoadingChats(false);
    });

    const unsubGroups = subscribeToGroups(uid, (grps) => {
      setGroups(grps);
    });

    return () => {
      unsubDM();
      unsubGroups();
    };
  }, [uid, setDirectChats, setGroups, setLoadingChats]);

  const unreadCount = uid ? totalChatUnread(uid, directChats, groups) : 0;

  return { directChats, groups, loadingChats, unreadCount };
}
