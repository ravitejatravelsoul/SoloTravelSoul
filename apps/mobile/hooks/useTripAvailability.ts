import { useEffect, useState } from 'react';
import { getTripAvailability, type TripAvailability } from '@solotravelsoul/firebase';

/**
 * Looks up, once per trip, whether each trip can still be acted on, so request lists can show a plain
 * "no longer available" state instead of an action that goes nowhere. Unchecked trips read as 'unknown'
 * (the card then behaves as before).
 */
export function useTripAvailability(tripIds: string[]): Record<string, TripAvailability> {
  const [state, setState] = useState<Record<string, TripAvailability>>({});
  const key = [...new Set(tripIds)].sort().join(',');

  useEffect(() => {
    let alive = true;
    const ids = key ? key.split(',') : [];
    ids.forEach((id) => {
      getTripAvailability(id).then((availability) => {
        if (alive) setState((prev) => (prev[id] === availability ? prev : { ...prev, [id]: availability }));
      });
    });
    return () => { alive = false; };
  }, [key]);

  return state;
}
