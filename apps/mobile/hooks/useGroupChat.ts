import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  subscribeToGroupMessages,
  markGroupRead,
} from '@solotravelsoul/firebase';
import { sendChatOp, getQueuedChatOps, onChatOpsRejected } from '@/utils/chatQueue';
import { nextRestore, takeUndelivered, type DraftRestore } from '@/utils/draftRestore';
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
  // A send the server refused outright: its text goes back to the composer so nothing the person wrote is lost.
  const [restored, setRestored] = useState<DraftRestore | null>(null);

  // Queued sends the server refused later (offline, then suspended) are dropped by the queue and never delivered
  // afterwards; their bubbles go away and their text returns to the composer (now, or when the chat is opened).
  const recoverUndelivered = useCallback(() => {
    if (!uid || !groupId) return;
    const texts = takeUndelivered(uid, groupId);
    if (texts.length === 0) return;
    setRestored(nextRestore(texts.join('\n')));
    useUIStore.getState().addToast('A message you sent while offline could not be delivered. It is back in the message box.', 'error');
  }, [uid, groupId]);

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

  useEffect(() => {
    setConfirmed([]);
    setPending([]);
    if (!groupId || !uid) return;

    // Sends saved on the device but not delivered yet are shown as pending, so they never look lost.
    let live = true;
    getQueuedChatOps(uid, groupId).then((queued) => {
      if (!live || useAuthStore.getState().user?.uid !== uid) return;
      setPending((prev) => {
        const have = new Set(prev.map((m) => m.clientId));
        const add = queued.filter((q) => q.op.type === 'group.send' && !have.has(q.op.clientId)).map((q) => ({ id: q.op.clientId, senderId: uid, senderName: myName, text: q.op.text, type: 'user' as const, sentAt: new Date(q.createdAt), clientId: q.op.clientId, status: 'pending' as const }));
        return add.length ? [...prev, ...add] : prev;
      });
    }).catch(() => {});

    markGroupRead(groupId, uid).catch(() => {});

    const unsub = subscribeToGroupMessages(groupId, (msgs) => {
      if (useAuthStore.getState().user?.uid !== uid) return;
      setConfirmed(msgs);
      const confirmedIds = new Set(msgs.map((m) => m.clientId));
      setPending((prev) => prev.filter((m) => !confirmedIds.has(m.clientId)));
    });

    return () => {
      live = false;
      unsub();
      setPending([]);
    };
  }, [groupId, uid]);

  const messages = useMemo<TravelGroupMessage[]>(() => {
    const confirmedIds = new Set(confirmed.map((m) => m.clientId));
    return [...confirmed, ...pending.filter((m) => !confirmedIds.has(m.clientId))].sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime());
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

      // The message is saved on the device before anything is sent (see sendChatOp), so it cannot vanish if the
      // connection drops mid-send or the app is closed; it stays visible as pending until the server has it.
      const result = await sendChatOp(uid, {
          type: 'group.send',
          groupId,
          senderId: uid,
          senderName: myName,
          text: text.trim(),
          clientId,
        }, isConnected);
      if (result === 'rejected') {
        // Refused by the rules (e.g. suspended account): retrying cannot succeed.
        setPending((prev) => prev.filter((m) => m.clientId !== clientId));
        setRestored(nextRestore(text.trim()));
        useUIStore.getState().addToast('Message not sent. You cannot send to this chat right now (your account or the conversation is restricted). Your text is still in the message box.', 'error');
        return;
      }
      if (result === 'failed') {
        // Could be neither saved nor delivered: the text goes back to the message box instead of disappearing.
        setPending((prev) => prev.filter((m) => m.clientId !== clientId));
        setRestored(nextRestore(text.trim()));
        useUIStore.getState().addToast('Message not sent. Check your connection and try again. Your text is still in the message box.', 'error');
        return;
      }
      notifyEnqueued();
    },
    [uid, groupId, myName, isConnected, notifyEnqueued],
  );

  return { messages, sendMessage, restored };
}
