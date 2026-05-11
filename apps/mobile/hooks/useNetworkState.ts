import { useEffect, useState, useCallback } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Network from 'expo-network';

export interface NetworkState {
  isConnected: boolean;
  isInternetReachable: boolean;
  isChecking: boolean;
}

export function useNetworkState(): NetworkState & { recheck: () => Promise<void> } {
  const [state, setState] = useState<NetworkState>({
    isConnected: true,
    isInternetReachable: true,
    isChecking: false,
  });

  const check = useCallback(async () => {
    setState((s) => ({ ...s, isChecking: true }));
    try {
      const net = await Network.getNetworkStateAsync();
      setState({
        isConnected: net.isConnected ?? false,
        isInternetReachable: net.isInternetReachable ?? false,
        isChecking: false,
      });
    } catch {
      setState((s) => ({ ...s, isChecking: false }));
    }
  }, []);

  useEffect(() => {
    check();

    const sub = AppState.addEventListener('change', (status: AppStateStatus) => {
      if (status === 'active') check();
    });

    return () => sub.remove();
  }, [check]);

  return { ...state, recheck: check };
}
