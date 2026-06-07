import { useState, useEffect, useCallback, useRef } from 'react';
import { subscribePublicTrips } from '@solotravelsoul/firebase';
import type { PublicTrip } from '@solotravelsoul/shared';
import type { QueryDocumentSnapshot } from 'firebase/firestore';

const PAGE_SIZE = 20;

interface Filters {
  destination: string;
  acceptingOnly: boolean;
}

export function usePublicTrips(filters: Filters) {
  const [trips, setTrips] = useState<PublicTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const lastDocRef = useRef<QueryDocumentSnapshot | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  const load = useCallback(() => {
    if (unsubRef.current) {
      unsubRef.current();
      unsubRef.current = null;
    }
    setLoading(true);
    setError(false);
    lastDocRef.current = null;

    try {
      const unsub = subscribePublicTrips(
        { destination: filters.destination || undefined, acceptingOnly: filters.acceptingOnly },
        PAGE_SIZE,
        null,
        (newTrips, last) => {
          if (__DEV__) console.log('[PublicTrips] docs:', newTrips.length);
          setTrips(newTrips);
          lastDocRef.current = last;
          setLoading(false);
        }
      );
      unsubRef.current = unsub;
    } catch {
      setError(true);
      setLoading(false);
    }
  }, [filters.destination, filters.acceptingOnly]);

  useEffect(() => {
    load();
    return () => { if (unsubRef.current) unsubRef.current(); };
  }, [load]);

  return { trips, loading, error, reload: load };
}
