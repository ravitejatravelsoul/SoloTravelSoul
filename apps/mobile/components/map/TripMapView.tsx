import React, { useCallback, useMemo, useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui';
import { WebLeafletMap } from './WebLeafletMap';
import type { MapPin } from './WebLeafletMap';
import { canUseMapbox, getMapboxGL } from '@/services/mapboxService';
import {
  Colors,
  Spacing,
  Radius,
  FontSize,
  FontWeight,
  Shadow,
} from '@/constants/theme';
import type { BundledAttraction, ItineraryDay } from '@solotravelsoul/shared';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const allAttractions: BundledAttraction[] = require('@/assets/attractions.json');

interface MappablePlace {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  dayIndex: number;
}

interface Props {
  itinerary: ItineraryDay[];
}

export function TripMapView({ itinerary }: Props) {
  const mappablePlaces = useMemo((): MappablePlace[] => {
    const lookup = new Map<string, BundledAttraction>(
      allAttractions.map((a) => [a.id, a])
    );
    const places: MappablePlace[] = [];
    itinerary.forEach((day, dayIndex) => {
      day.places.forEach((entry) => {
        if (typeof entry.latitude === 'number' && typeof entry.longitude === 'number') {
          places.push({
            id: entry.id,
            name: entry.name,
            latitude: entry.latitude,
            longitude: entry.longitude,
            dayIndex,
          });
          return;
        }
        if (!entry.attractionId) return;
        const attraction = lookup.get(entry.attractionId);
        if (!attraction) return;
        places.push({
          id: entry.id,
          name: entry.name,
          latitude: attraction.latitude,
          longitude: attraction.longitude,
          dayIndex,
        });
      });
    });
    return places;
  }, [itinerary]);

  if (mappablePlaces.length === 0) {
    return <TripMapEmpty />;
  }

  if (canUseMapbox) {
    return <TripMapNative places={mappablePlaces} />;
  }

  return <TripWebMap places={mappablePlaces} />;
}

// ── WebLeaflet map (Expo Go) ──────────────────────────────────────────

function TripWebMap({ places }: { places: MappablePlace[] }) {
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [mapErrored, setMapErrored] = useState(false);
  const { bottom } = useSafeAreaInsets();

  const { pins, placeLookup } = useMemo(() => {
    const lookup = new Map<string, string>(); // pin id → place name
    const all: MapPin[] = places.map((p) => {
      const id = `trip_${p.id}`;
      lookup.set(id, p.name);
      return {
        id,
        name: p.name,
        category: '',
        latitude: p.latitude,
        longitude: p.longitude,
        color: Colors.primary,
        label: String(p.dayIndex + 1),
      };
    });
    return { pins: all, placeLookup: lookup };
  }, [places]);

  const handlePinTap = useCallback(
    (pin: MapPin) => {
      const name = placeLookup.get(pin.id);
      if (name) setSelectedName(name);
    },
    [placeLookup]
  );

  if (mapErrored) {
    return <TripMapEmpty />;
  }

  return (
    <View style={styles.container}>
      <WebLeafletMap
        pins={pins}
        onPinTap={handlePinTap}
        onError={() => setMapErrored(true)}
      />
      {selectedName && (
        <View style={[styles.nameToast, { bottom: Spacing['2xl'] + bottom }]}>
          <Text style={styles.nameToastText} numberOfLines={1}>{selectedName}</Text>
          <TouchableOpacity
            onPress={() => setSelectedName(null)}
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          >
            <Ionicons name="close" size={16} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ── Native Mapbox map (EAS dev / production builds only) ──────────────

function TripMapNative({ places }: { places: MappablePlace[] }) {
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const { bottom } = useSafeAreaInsets();

  const center = useMemo<[number, number]>(() => {
    const lon = places.reduce((s, p) => s + p.longitude, 0) / places.length;
    const lat = places.reduce((s, p) => s + p.latitude, 0) / places.length;
    return [lon, lat];
  }, [places]);

  const mapbox = getMapboxGL();
  if (!mapbox) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const MapView = mapbox.MapView as React.ComponentType<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Camera = mapbox.Camera as React.ComponentType<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const PointAnnotation = mapbox.PointAnnotation as React.ComponentType<any>;

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        styleURL="mapbox://styles/mapbox/streets-v12"
        onPress={() => setSelectedName(null)}
      >
        <Camera
          centerCoordinate={center}
          zoomLevel={5}
          animationMode="none"
        />

        {places.map((p) => (
          <PointAnnotation
            key={p.id}
            id={p.id}
            coordinate={[p.longitude, p.latitude]}
            onSelected={() => setSelectedName(p.name)}
          >
            <View style={styles.tripPin}>
              <Text style={styles.tripPinDay}>{p.dayIndex + 1}</Text>
            </View>
          </PointAnnotation>
        ))}
      </MapView>

      {selectedName && (
        <View style={[styles.nameToast, { bottom: Spacing['2xl'] + bottom }]}>
          <Text style={styles.nameToastText} numberOfLines={1}>{selectedName}</Text>
          <TouchableOpacity
            onPress={() => setSelectedName(null)}
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          >
            <Ionicons name="close" size={16} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ── Empty state (no mappable coordinates) ────────────────────────────

function TripMapEmpty() {
  return (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconWrap}>
        <Ionicons name="map-outline" size={40} color={Colors.placeholder} />
      </View>
      <Text style={styles.emptyTitle}>No mappable places</Text>
      <Text style={styles.emptySub}>
        Add places to your itinerary to see them on the map.
      </Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },

  tripPin: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.white,
    ...Shadow.sm,
  },
  tripPinDay: {
    fontSize: 11,
    fontWeight: FontWeight.bold,
    color: Colors.white,
    lineHeight: 14,
  },

  nameToast: {
    position: 'absolute',
    left: Spacing.lg,
    right: Spacing.lg,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    ...Shadow.md,
  },
  nameToastText: {
    flex: 1,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },

  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing['2xl'],
    gap: Spacing.md,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.chipBackground,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  emptyTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  emptySub: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});
