import { useState, useCallback, useRef } from 'react';

interface UseRetryOptions {
  maxAttempts?: number;
  delayMs?: number;
}

interface UseRetryReturn {
  attempt: number;
  retrying: boolean;
  failed: boolean;
  retry: () => Promise<void>;
  reset: () => void;
}

export function useRetry(
  fn: () => Promise<void>,
  options: UseRetryOptions = {}
): UseRetryReturn {
  const { maxAttempts = 3, delayMs = 1000 } = options;
  const [attempt, setAttempt] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const [failed, setFailed] = useState(false);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const retry = useCallback(async () => {
    if (retrying) return;
    const next = attempt + 1;
    setAttempt(next);
    setRetrying(true);
    setFailed(false);
    try {
      if (delayMs > 0 && next > 1) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
      await fnRef.current();
      setFailed(false);
    } catch {
      if (next >= maxAttempts) setFailed(true);
    } finally {
      setRetrying(false);
    }
  }, [attempt, retrying, maxAttempts, delayMs]);

  const reset = useCallback(() => {
    setAttempt(0);
    setRetrying(false);
    setFailed(false);
  }, []);

  return { attempt, retrying, failed, retry, reset };
}
