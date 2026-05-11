import { useEffect, useState } from 'react';
import {
  subscribeToNotifications,
  markNotificationRead,
} from '@solotravelsoul/firebase';
import type { AppNotification } from '@solotravelsoul/shared';
import { useAuthStore } from '@/stores/authStore';

export function useNotifications() {
  const uid = useAuthStore((s) => s.user?.uid);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  useEffect(() => {
    if (!uid) return;
    const unsub = subscribeToNotifications(uid, setNotifications);
    return unsub;
  }, [uid]);

  const markRead = async (id: string) => {
    await markNotificationRead(id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return { notifications, unreadCount, markRead };
}
