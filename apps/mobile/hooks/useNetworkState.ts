import { useEffect, useState, useCallback, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Network from 'expo-network';

export interface NetworkState {
  /** A network is up (Wi-Fi, cellular, …). */
  isConnected: boolean;
  /**
   * The OS has a default route. expo-network does not probe the internet, so this is weaker
   * than "requests will succeed", but it is never true without a connection.
   */
  isInternetReachable: boolean;
  isChecking: boolean;
}

type Reading = Pick<NetworkState, 'isConnected' | 'isInternetReachable'>;

/**
 * Confirmation checks after each native event (or an unknown check result). Android calls
 * onLost before it moves the default network, so expo-network's event can still report the
 * lost network as connected (seen on an SM-S711U, Android 16), and onAvailable can race the
 * same way. Bounded and event-driven: nothing runs while the network is quiet.
 */
const CONFIRM_DELAYS_MS = [1000, 3000];

/** null = unknown: a transitional native state (type UNKNOWN or no flag). */
function read(net: Network.NetworkState): Reading | null {
  if (net.type === Network.NetworkStateType.UNKNOWN || typeof net.isConnected !== 'boolean') return null;
  return { isConnected: net.isConnected, isInternetReachable: net.isConnected && net.isInternetReachable === true };
}

const OFFLINE: Reading = { isConnected: false, isInternetReachable: false };

type Timers = Set<ReturnType<typeof setTimeout>>;

function clearConfirm(timers: Timers) {
  timers.forEach(clearTimeout);
  timers.clear();
}

/** Restart the confirmation checks; a newer event replaces the previous ones. */
function scheduleConfirm(timers: Timers, run: (attempt: number) => Promise<void>) {
  clearConfirm(timers);
  CONFIRM_DELAYS_MS.forEach((ms, i) => {
    const t = setTimeout(() => {
      timers.delete(t);
      run(i);
    }, ms);
    timers.add(t);
  });
}

/**
 * Connectivity from expo-network: a check on mount and on return to the
 * foreground, plus the live listener with short confirmation checks, so a
 * disconnect while the app stays open is seen within seconds (offline banner,
 * chat queueing, sync on reconnect).
 *
 * An unknown reading keeps the last known state until confirmed; if it is still
 * unknown after the last confirmation it counts as offline, so writes queue.
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
  const timers = useRef<Timers>(new Set());

  // attempt: -1 = direct check (mount, foreground, recheck); otherwise the confirmation index.
  const check = useCallback(async function run(attempt = -1): Promise<void> {
    const id = ++latest.current;
    setState((s) => ({ ...s, isChecking: true }));
    try {
      const reading = read(await Network.getNetworkStateAsync());
      if (id !== latest.current) return; // superseded by a newer event or check
      if (reading) setState({ ...reading, isChecking: false });
      else if (attempt === CONFIRM_DELAYS_MS.length - 1) setState({ ...OFFLINE, isChecking: false });
      else {
        setState((s) => ({ ...s, isChecking: false }));
        if (attempt === -1) scheduleConfirm(timers.current, run);
      }
    } catch {
      if (id === latest.current) setState((s) => ({ ...s, isChecking: false }));
    }
  }, []);

  const recheck = useCallback(() => check(), [check]);

  useEffect(() => {
    const seq = latest;
    const pending = timers.current;
    check();

    const app = AppState.addEventListener('change', (status: AppStateStatus) => {
      if (status === 'active') check();
    });
    const live = Network.addNetworkStateListener((net) => {
      seq.current++; // discard any check still in flight
      const reading = read(net);
      if (reading) setState({ ...reading, isChecking: false });
      scheduleConfirm(pending, check);
    });

    return () => {
      seq.current++; // a check finishing after unmount must not set state
      clearConfirm(pending);
      app.remove();
      live.remove();
    };
  }, [check]);

  return { ...state, recheck };
}
