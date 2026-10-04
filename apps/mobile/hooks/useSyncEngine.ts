import { useEffect, useRef, useCallback } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { useNetworkState } from './useNetworkState';
import { useTripStore } from '@/stores/tripStore';
import { processQueue, getQueueSize } from '@/utils/syncQueue';
import { processChatQueue, getChatQueueSize } from '@/utils/chatQueue';
import { useAuthStore } from '@/stores/authStore';
import { getLatestSyncTime, setLastSync } from '@/utils/offlineCache';

export interface SyncEngineState {
  pendingCount: number;
  lastSyncedAt: Date | null;
  syncing: boolean;
  hasFailed: boolean;
}

// Module-level so multiple mounted instances (app layout + trip detail) never
// process the queue concurrently — that would double-send queued DMs.
const syncingUsers = new Set<string>();
const pendingCount = async (uid: string) => {
  const counts = await Promise.all([getQueueSize(uid), getChatQueueSize(uid)]);
  return counts[0] + counts[1];
};

export function useSyncEngine(uid: string | undefined): SyncEngineState & {
  sync: () => Promise<void>;
  notifyEnqueued: () => void;
} {
  const { isConnected } = useNetworkState();
  const { pendingOpsCount, syncStatus, setSyncStatus, setPendingOpsCount } = useTripStore(
    useShallow((s) => ({
      pendingOpsCount: s.pendingOpsCount,
      syncStatus: s.syncStatus,
      setSyncStatus: s.setSyncStatus,
      setPendingOpsCount: s.setPendingOpsCount,
    }))
  );

  const prevConnected = useRef(false);

  const refreshPending = useCallback(async () => {
    if (!uid) return;
    const count = await pendingCount(uid);
    if (useAuthStore.getState().user?.uid !== uid) return;
    setPendingOpsCount(count);
    const lastSyncedAt = await getLatestSyncTime(uid);
    if (useAuthStore.getState().user?.uid !== uid) return;
    setSyncStatus({ lastSyncedAt });
  }, [uid, setPendingOpsCount, setSyncStatus]);

  /** Called by hooks immediately after they enqueue an op — updates the badge without AsyncStorage round-trip delay. */
  const notifyEnqueued = useCallback(() => {
    if (!uid) return;
    pendingCount(uid).then((n) => {
      if (useAuthStore.getState().user?.uid === uid) setPendingOpsCount(n);
    });
  }, [uid, setPendingOpsCount]);

  const sync = useCallback(async () => {
    if (!uid || useAuthStore.getState().user?.uid !== uid || !isConnected || syncingUsers.has(uid)) return;
    syncingUsers.add(uid);
    setSyncStatus({ syncing: true, hasFailed: false });
    try {
      const [result, chatResult] = await Promise.all([
        processQueue(uid),
        processChatQueue(uid),
      ]);
      if (result.succeeded > 0 || chatResult.succeeded > 0) {
        await setLastSync(uid, 'queue');
      }
      const count = await pendingCount(uid);
      const lastSyncedAt = await getLatestSyncTime(uid);
      if (useAuthStore.getState().user?.uid !== uid) return;
      setPendingOpsCount(count);
      setSyncStatus({
        syncing: false,
        hasFailed: result.failed > 0 || chatResult.failed > 0,
        lastSyncedAt,
      });
    } catch {
      if (useAuthStore.getState().user?.uid === uid) setSyncStatus({ syncing: false, hasFailed: true });
    } finally {
      syncingUsers.delete(uid);
    }
  }, [uid, isConnected, setSyncStatus, setPendingOpsCount]);

  // Trigger sync when network reconnects
  useEffect(() => {
    if (isConnected && !prevConnected.current && uid) {
      sync();
    }
    prevConnected.current = isConnected;
  }, [isConnected, uid, sync]);

  // Sync when app returns to foreground and has pending ops
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (status: AppStateStatus) => {
      if (status !== 'active' || !uid || !isConnected) return;
      const count = await pendingCount(uid);
      if (count > 0) sync();
    });
    return () => sub.remove();
  }, [uid, isConnected, sync]);

  // Initialise pending count from AsyncStorage on mount
  useEffect(() => {
    refreshPending();
  }, [refreshPending]);

  return {
    pendingCount: pendingOpsCount,
    lastSyncedAt: syncStatus.lastSyncedAt,
    syncing: syncStatus.syncing,
    hasFailed: syncStatus.hasFailed,
    sync,
    notifyEnqueued,
  };
}
