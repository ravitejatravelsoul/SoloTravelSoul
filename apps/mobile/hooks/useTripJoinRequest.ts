import { useState, useEffect, useRef, useCallback } from 'react';
import {
  subscribeMyJoinRequests,
  subscribeTripJoinRequestsForOwner,
  cancelTripJoinRequest,
  approveTripJoinRequest,
  rejectTripJoinRequest,
} from '@solotravelsoul/firebase';
import type { TripJoinRequest } from '@solotravelsoul/shared';
import * as Notifications from 'expo-notifications';

export function useMyJoinRequests(requestorUid: string) {
  const [sent, setSent] = useState<TripJoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const prevSentRef = useRef<TripJoinRequest[]>([]);

  useEffect(() => {
    const unsub = subscribeMyJoinRequests(requestorUid, (reqs) => {
      setSent(reqs);
      setLoading(false);

      // Notify on status change
      const prev = prevSentRef.current;
      for (const req of reqs) {
        const old = prev.find((r) => r.requestId === req.requestId);
        if (old && old.status === 'pending') {
          if (req.status === 'approved') {
            Notifications.scheduleNotificationAsync({
              content: { title: 'Request approved!', body: `You've been approved for ${req.tripTitle}` },
              trigger: null,
            }).catch(() => {});
          } else if (req.status === 'rejected') {
            Notifications.scheduleNotificationAsync({
              content: { title: 'Request update', body: `Your request for ${req.tripTitle} was not approved.` },
              trigger: null,
            }).catch(() => {});
          }
        }
      }
      prevSentRef.current = reqs;
    });
    return unsub;
  }, [requestorUid]);

  const cancel = useCallback(async (requestId: string, requestorUid: string) => {
    await cancelTripJoinRequest(requestId, requestorUid);
  }, []);

  return { sent, loading, cancel };
}

export function useOwnerJoinRequests(ownerUid: string) {
  const [received, setReceived] = useState<TripJoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const prevReceivedRef = useRef<TripJoinRequest[]>([]);

  useEffect(() => {
    const unsub = subscribeTripJoinRequestsForOwner(ownerUid, (reqs) => {
      // Notify owner of new requests
      const prev = prevReceivedRef.current;
      const newReqs = reqs.filter((r) => !prev.some((p) => p.requestId === r.requestId));
      if (newReqs.length > 0 && prev.length > 0) {
        Notifications.scheduleNotificationAsync({
          content: {
            title: 'New join request',
            body: `${newReqs[0].requestorName} wants to join ${newReqs[0].tripTitle}`,
          },
          trigger: null,
        }).catch(() => {});
      }
      prevReceivedRef.current = reqs;
      setReceived(reqs);
      setLoading(false);
    });
    return unsub;
  }, [ownerUid]);

  const approve = useCallback(async (request: TripJoinRequest) => {
    await approveTripJoinRequest(
      request.requestId,
      request.tripId,
      request.ownerUid,
      {
        requestorUid: request.requestorUid,
        requestorName: request.requestorName,
        requestorPhotoURL: request.requestorPhotoURL,
      }
    );
  }, []);

  const reject = useCallback(async (requestId: string, ownerUid: string) => {
    await rejectTripJoinRequest(requestId, ownerUid);
  }, []);

  return { received, loading, approve, reject };
}
