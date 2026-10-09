import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  subscribeToGroupMessages,
  sendGroupMessage as fbSendGroup,
  markGroupRead,
} from '@solotravelsoul/firebase';
import { enqueueChatOp } from '@/utils/chatQueue';
import { useAuthStore } from '@/stores/authStore';
import { useNetworkState } from '@/hooks/useNetworkState';
import { useUIStore } from '@/stores/uiStore';
import { useSyncEngine } from '@/hooks/useSyncEngine';
import type { TravelGroupMessage } from '@solotravelsoul/shared';

function generateClientId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Manages messages for a single group chat.
 * Mirrors the useMessages hook but for group messages.
 */
export function useGroupChat(groupId: string, myName: string) {
  const uid = useAuthStore((s) => s.user?.uid);
  const { isConnected } = useNetworkState();
  const { notifyEnqueued } = useSyncEngine(uid);

  const [confirmed, setConfirmed] = useState<TravelGroupMessage[]>([]);
  const [pending, setPending] = useState<TravelGroupMessage[]>([]);

  useEffect(() => {
    setConfirmed([]);
    setPending([]);
    if (!groupId || !uid) return;

    markGroupRead(groupId, uid).catch(() => {});

    const unsub = subscribeToGroupMessages(groupId, (msgs) => {
      if (useAuthStore.getState().user?.uid !== uid) return;
      setConfirmed(msgs);
      const confirmedIds = new Set(msgs.map((m) => m.clientId));
      setPending((prev) => prev.filter((m) => !confirmedIds.has(m.clientId)));
    });

    return () => {
      unsub();
      setPending([]);
    };
  }, [groupId, uid]);

  const messages = useMemo<TravelGroupMessage[]>(() => {
    return [...confirmed, ...pending].sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime());
  }, [confirmed, pending]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!uid || !text.trim()) return;

      const clientId = generateClientId();
      const optimistic: TravelGroupMessage = {
        id: clientId,
        senderId: uid,
        senderName: myName,
        text: text.trim(),
        type: 'user',
        sentAt: new Date(),
        clientId,
        status: 'pending',
      };

      setPending((prev) => [...prev, optimistic]);

      if (!isConnected) {
        await enqueueChatOp(uid, {
          type: 'group.send',
          groupId,
          senderId: uid,
          senderName: myName,
          text: text.trim(),
          clientId,
        });
        notifyEnqueued();
        return;
      }

      try {
        await fbSendGroup(groupId, uid, myName, text.trim(), clientId);
      } catch (e) {
        // Refused by the rules (e.g. suspended account): retrying cannot succeed.
        if ((e as { code?: string }).code === 'permission-denied') {
          setPending((prev) => prev.filter((m) => m.clientId !== clientId));
          useUIStore.getState().addToast('Message not sent. This account cannot send messages.', 'error');
          return;
        }
        await enqueueChatOp(uid, {
          type: 'group.send',
          groupId,
          senderId: uid,
          senderName: myName,
          text: text.trim(),
          clientId,
        });
        notifyEnqueued();
      }
    },
    [uid, groupId, myName, isConnected, notifyEnqueued],
  );

  return { messages, sendMessage };
}
