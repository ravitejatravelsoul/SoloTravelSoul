import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

let cached = false;
let loadPromise: Promise<boolean> | null = null;
const listeners = new Set<(v: boolean) => void>();

function ensureLoaded(): Promise<boolean> {
  if (!loadPromise) {
    loadPromise = AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => { cached = v; listeners.forEach((l) => l(v)); return v; })
      .catch(() => false);
    AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => { cached = v; listeners.forEach((l) => l(v)); });
  }
  return loadPromise;
}

// Ask the system as soon as the app starts, so the answer is known long before the first animation.
void ensureLoaded();

/** Resolves with the system setting once it has been read (the first read is asynchronous; the launch overlay waits for it). */
export function reducedMotionKnown(): Promise<boolean> {
  return ensureLoaded();
}

/** Current reduced-motion state without subscribing (for one-off animations). */
export function isReducedMotion(): boolean {
  ensureLoaded();
  return cached;
}

/**
 * True when the person asked the system to reduce motion (Android "Remove animations", iOS "Reduce Motion").
 * Animated helpers in the app skip springs, slides and celebrations when this is true; state changes still happen at once.
 */
export function useReducedMotion(): boolean {
  ensureLoaded();
  const [value, setValue] = useState(cached);
  useEffect(() => {
    listeners.add(setValue);
    setValue(cached);
    return () => { listeners.delete(setValue); };
  }, []);
  return value;
}
