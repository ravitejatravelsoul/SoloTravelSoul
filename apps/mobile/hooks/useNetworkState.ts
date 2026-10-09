import { useEffect, useState, useCallback, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Network from 'expo-network';

export interface NetworkState {
  isConnected: boolean;
  isInternetReachable: boolean;
  isChecking: boolean;
}

/**
 * Connectivity from expo-network: a check on mount and on return to the
 * foreground, plus the live listener, so a disconnect while the app stays open
 * is seen at once (offline banner, chat queueing, sync on reconnect).
 *
 * Every check and event takes a sequence number; an async check that started
 * before a newer event (or check) is discarded instead of overwriting it.
 */
export function useNetworkState(): NetworkState & { recheck: () => Promise<void> } {
  const [state, setState] = useState<NetworkState>({
    isConnected: true,
    isInternetReachable: true,
    isChecking: false,
  });
  const latest = useRef(0);

  const check = useCallback(async () => {
    const id = ++latest.current;
    setState((s) => ({ ...s, isChecking: true }));
    try {
      const net = await Network.getNetworkStateAsync();
      if (id !== latest.current) return; // superseded by a newer event or check
      setState({
        isConnected: net.isConnected ?? false,
        isInternetReachable: net.isInternetReachable ?? false,
        isChecking: false,
      });
    } catch {
      if (id === latest.current) setState((s) => ({ ...s, isChecking: false }));
    }
  }, []);

  useEffect(() => {
    const seq = latest;
    check();

    const app = AppState.addEventListener('change', (status: AppStateStatus) => {
      if (status === 'active') check();
    });
    const live = Network.addNetworkStateListener((net) => {
      seq.current++; // discard any check still in flight
      setState({
        isConnected: net.isConnected ?? false,
        isInternetReachable: net.isInternetReachable ?? false,
        isChecking: false,
      });
    });

    return () => {
      seq.current++; // a check finishing after unmount must not set state
      app.remove();
      live.remove();
    };
  }, [check]);

  return { ...state, recheck: check };
}
