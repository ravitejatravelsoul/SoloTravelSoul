import { useState, useEffect, useRef, useCallback } from 'react';
import {
  subscribeMyGroupJoinRequests,
  subscribeGroupJoinRequestsForOwner,
  approveGroupJoinRequest,
  rejectGroupJoinRequest,
} from '@solotravelsoul/firebase';
import type { CommunityGroupJoinRequest } from '@solotravelsoul/shared';
import * as Notifications from 'expo-notifications';

export function useMyGroupJoinRequests(requestorUid: string) {
  const [sent, setSent] = useState<CommunityGroupJoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const prevRef = useRef<CommunityGroupJoinRequest[]>([]);

  useEffect(() => {
    if (!requestorUid) return;
    const unsub = subscribeMyGroupJoinRequests(requestorUid, (reqs) => {
      // Push notification when status changes
      const prev = prevRef.current;
      for (const req of reqs) {
        const old = prev.find((r) => r.requestId === req.requestId);
        if (old && old.status === 'pending') {
          if (req.status === 'approved') {
            Notifications.scheduleNotificationAsync({
              content: { title: 'Group request approved!', body: `You've been added to ${req.groupName}` },
              trigger: null,
            }).catch(() => {});
          } else if (req.status === 'rejected') {
            Notifications.scheduleNotificationAsync({
              content: { title: 'Group request update', body: `Your request to join ${req.groupName} was not approved.` },
              trigger: null,
            }).catch(() => {});
          }
        }
      }
      prevRef.current = reqs;
      setSent(reqs);
      setLoading(false);
    });
    return unsub;
  }, [requestorUid]);

  return { sent, loading };
}

export function useOwnerGroupJoinRequests(ownerUid: string) {
  const [received, setReceived] = useState<CommunityGroupJoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const prevRef = useRef<CommunityGroupJoinRequest[]>([]);

  useEffect(() => {
    if (!ownerUid) return;
    const unsub = subscribeGroupJoinRequestsForOwner(ownerUid, (reqs) => {
      // Push notification on new incoming requests
      const prev = prevRef.current;
      const newReqs = reqs.filter((r) => !prev.some((p) => p.requestId === r.requestId));
      if (newReqs.length > 0 && prev.length > 0) {
        Notifications.scheduleNotificationAsync({
          content: {
            title: 'New group request',
            body: `${newReqs[0].requestorName} wants to join ${newReqs[0].groupName}`,
          },
          trigger: null,
        }).catch(() => {});
      }
      prevRef.current = reqs;
      setReceived(reqs);
      setLoading(false);
    });
    return unsub;
  }, [ownerUid]);

  const approve = useCallback(async (req: CommunityGroupJoinRequest) => {
    await approveGroupJoinRequest(req.requestId, req.groupId, {
      requestorUid: req.requestorUid,
      requestorName: req.requestorName,
      requestorPhotoURL: req.requestorPhotoURL,
    });
  }, []);

  const reject = useCallback(async (requestId: string) => {
    await rejectGroupJoinRequest(requestId, ownerUid);
  }, [ownerUid]);

  return { received, loading, approve, reject };
}
