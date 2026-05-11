import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import {
  getForegroundPermissionStatus,
  requestForegroundPermission,
  getCurrentLocation,
  type Coordinates,
} from '@/services/locationService';

interface UseLocationResult {
  location: Coordinates | null;
  loading: boolean;
  requestLocation: () => Promise<void>;
  clearLocation: () => void;
}

export function useLocation(): UseLocationResult {
  const [location, setLocation] = useState<Coordinates | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchAndSet = useCallback(async () => {
    setLoading(true);
    try {
      const coords = await getCurrentLocation();
      setLocation(coords);
    } finally {
      setLoading(false);
    }
  }, []);

  const requestLocation = useCallback(async () => {
    const status = await getForegroundPermissionStatus();

    if (status === 'denied') {
      Alert.alert(
        'Location access denied',
        'To sort places by distance, go to Settings → Privacy & Security → Location Services and allow SoloTravelSoul.',
        [{ text: 'OK' }]
      );
      return;
    }

    if (status === 'granted') {
      await fetchAndSet();
      return;
    }

    // undetermined — show explanation before the system dialog
    Alert.alert(
      'Sort by distance?',
      'SoloTravelSoul will read your location once to sort nearby attractions by distance. We never track you in the background.',
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Allow',
          onPress: async () => {
            const result = await requestForegroundPermission();
            if (result === 'granted') await fetchAndSet();
          },
        },
      ]
    );
  }, [fetchAndSet]);

  const clearLocation = useCallback(() => setLocation(null), []);

  return { location, loading, requestLocation, clearLocation };
}
