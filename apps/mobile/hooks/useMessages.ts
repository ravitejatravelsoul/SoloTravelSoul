import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  subscribeToDirectMessages,
  sendDirectMessage as fbSendDM,
  markDirectChatRead,
} from '@solotravelsoul/firebase';
import { enqueueChatOp, isPermanentRejection, onChatOpsRejected } from '@/utils/chatQueue';
import { nextRestore, takeUndelivered, type DraftRestore } from '@/utils/draftRestore';
import { useAuthStore } from '@/stores/authStore';
import { useNetworkState } from '@/hooks/useNetworkState';
import { useUIStore } from '@/stores/uiStore';
import { useSyncEngine } from '@/hooks/useSyncEngine';
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
  const { notifyEnqueued } = useSyncEngine(uid);

  const [confirmed, setConfirmed] = useState<DirectMessage[]>([]);
  const [pending, setPending] = useState<DirectMessage[]>([]);
  // A send the server refused outright: its text goes back to the composer so nothing the person wrote is lost.
  const [restored, setRestored] = useState<DraftRestore | null>(null);

  // Queued sends the server refused later (offline, then suspended) are dropped by the queue and never delivered
  // afterwards; their bubbles go away and their text returns to the composer (now, or when the chat is opened).
  const recoverUndelivered = useCallback(() => {
    if (!uid || !chatId) return;
    const texts = takeUndelivered(uid, chatId);
    if (texts.length === 0) return;
    setRestored(nextRestore(texts.join('\n')));
    useUIStore.getState().addToast('A message you sent while offline could not be delivered. It is back in the message box.', 'error');
  }, [uid, chatId]);

  useEffect(() => {
    if (!uid) return;
    recoverUndelivered();
    return onChatOpsRejected((owner, ops) => {
      if (owner !== uid) return;
      const ids = new Set(ops.map((o) => o.clientId));
      setPending((prev) => prev.filter((m) => !ids.has(m.clientId)));
      recoverUndelivered();
    });
  }, [uid, recoverUndelivered]);

  // Subscribe to Firestore snapshot
  useEffect(() => {
    setConfirmed([]);
    setPending([]);
    if (!chatId || !uid) return;

    markDirectChatRead(chatId, uid).catch(() => {});

    const unsub = subscribeToDirectMessages(chatId, (msgs) => {
      if (useAuthStore.getState().user?.uid !== uid) return;
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
        notifyEnqueued();
        return;
      }

      try {
        await fbSendDM(chatId, uid, text.trim(), clientId, otherUids);
      } catch (e) {
        // Refused by the rules (e.g. suspended account): retrying cannot succeed.
        if (isPermanentRejection(e)) {
          setPending((prev) => prev.filter((m) => m.clientId !== clientId));
          setRestored(nextRestore(text.trim()));
          useUIStore.getState().addToast('Message not sent. You cannot send to this chat right now (your account or the conversation is restricted). Your text is still in the message box.', 'error');
          return;
        }
        // Snapshot didn't arrive in time or send failed — queue for retry
        await enqueueChatOp(uid, {
          type: 'dm.send',
          chatId,
          senderId: uid,
          text: text.trim(),
          clientId,
          otherUids,
        });
        notifyEnqueued();
      }
    },
    [uid, chatId, isConnected, otherUids, notifyEnqueued],
  );

  return { messages, sendMessage, restored };
}
