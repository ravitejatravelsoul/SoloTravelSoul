import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  subscribeToDirectMessages,
  sendDirectMessage as fbSendDM,
  markDirectChatRead,
} from '@solotravelsoul/firebase';
import { enqueueChatOp } from '@/utils/chatQueue';
import { useAuthStore } from '@/stores/authStore';
import { useNetworkState } from '@/hooks/useNetworkState';
import type { DirectMessage } from '@solotravelsoul/shared';

function generateClientId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Manages messages for a single direct chat.
 * Optimistic sends: message appears immediately with status='pending',
 * then confirmed when Firestore snapshot includes it.
 * Offline sends are queued and replayed on reconnect.
 */
export function useMessages(chatId: string, otherUids: string[]) {
  const uid = useAuthStore((s) => s.user?.uid);
  const { isConnected } = useNetworkState();

  const [confirmed, setConfirmed] = useState<DirectMessage[]>([]);
  const [pending, setPending] = useState<DirectMessage[]>([]);

  // Subscribe to Firestore snapshot
  useEffect(() => {
    if (!chatId || !uid) return;

    markDirectChatRead(chatId, uid).catch(() => {});

    const unsub = subscribeToDirectMessages(chatId, (msgs) => {
      setConfirmed(msgs);
      // Drop any pending messages that now appear in the snapshot
      const confirmedIds = new Set(msgs.map((m) => m.clientId));
      setPending((prev) => prev.filter((m) => !confirmedIds.has(m.clientId)));
    });

    return () => {
      unsub();
      setPending([]);
    };
  }, [chatId, uid]);

  // Merged display list: confirmed + remaining pending, sorted by sentAt
  const messages = useMemo<DirectMessage[]>(() => {
    return [...confirmed, ...pending].sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime());
  }, [confirmed, pending]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!uid || !text.trim()) return;

      const clientId = generateClientId();
      const optimistic: DirectMessage = {
        id: clientId,
        senderId: uid,
        text: text.trim(),
        sentAt: new Date(),
        clientId,
        status: 'pending',
      };

      setPending((prev) => [...prev, optimistic]);

      if (!isConnected) {
        await enqueueChatOp(uid, {
          type: 'dm.send',
          chatId,
          senderId: uid,
          text: text.trim(),
          clientId,
          otherUids,
        });
        return;
      }

      try {
        await fbSendDM(chatId, uid, text.trim(), clientId, otherUids);
      } catch {
        // Snapshot didn't arrive in time or send failed — queue for retry
        await enqueueChatOp(uid, {
          type: 'dm.send',
          chatId,
          senderId: uid,
          text: text.trim(),
          clientId,
          otherUids,
        });
      }
    },
    [uid, chatId, isConnected, otherUids],
  );

  return { messages, sendMessage };
}
