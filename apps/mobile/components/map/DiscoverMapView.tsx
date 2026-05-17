import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui';
import { MapPlaceholder } from './MapPlaceholder';
import { WebLeafletMap } from './WebLeafletMap';
import type { MapPin, UserLocation } from './WebLeafletMap';
import { canUseMapbox, getMapboxGL } from '@/services/mapboxService';
import {
  Colors,
  Spacing,
  Radius,
  FontSize,
  FontWeight,
  Shadow,
} from '@/constants/theme';
import type { BundledAttraction, DiscoverItem } from '@solotravelsoul/shared';

// ── Public props ──────────────────────────────────────────────────────

interface Props {
  attractions: BundledAttraction[];
  liveResults: DiscoverItem[];
  totalCount: number;
  isSaved: (localId: string) => boolean;
  isSavedFsq: (fsqId: string) => boolean;
  onSaveToggle: (attraction: BundledAttraction) => void;
  onLiveSaveToggle: (item: DiscoverItem) => void;
  onAddToTrip: (attraction: BundledAttraction) => void;
  onLiveAddToTrip: (item: DiscoverItem) => void;
  userLocation: UserLocation | null;
  locationLoading: boolean;
  onRequestLocation: () => void;
}

// ── Shared pin-tap card type ──────────────────────────────────────────

type SelectedPin =
  | { type: 'attraction'; data: BundledAttraction }
  | { type: 'live'; data: DiscoverItem };

// ── Entry point ───────────────────────────────────────────────────────

export function DiscoverMapView(props: Props) {
  const {
    userLocation,
    locationLoading,
    onRequestLocation,
    totalCount,
    ...mapProps
  } = props;

  const mapContent = canUseMapbox ? (
    <DiscoverMapNative {...mapProps} userLocation={userLocation} />
  ) : (
    <DiscoverWebMap
      {...mapProps}
      totalCount={totalCount}
      userLocation={userLocation}
    />
  );

  return (
    <View style={styles.container}>
      {mapContent}
      <LocationButton
        userLocation={userLocation}
        loading={locationLoading}
        onPress={onRequestLocation}
      />
    </View>
  );
}

// ── Floating location button ──────────────────────────────────────────

function LocationButton({
  userLocation,
  loading,
  onPress,
}: {
  userLocation: UserLocation | null;
  loading: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.locateBtn, userLocation && styles.locateBtnActive]}
      onPress={onPress}
      activeOpacity={0.8}
      hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
    >
      {loading ? (
        <ActivityIndicator size="small" color={Colors.primary} />
      ) : (
        <Ionicons
          name={userLocation ? 'locate' : 'locate-outline'}
          size={20}
          color={userLocation ? Colors.primary : Colors.textSecondary}
        />
      )}
    </TouchableOpacity>
  );
}

// ── WebLeaflet map (Expo Go) ──────────────────────────────────────────

function DiscoverWebMap({
  attractions,
  liveResults,
  totalCount,
  isSaved,
  isSavedFsq,
  onSaveToggle,
  onLiveSaveToggle,
  onAddToTrip,
  onLiveAddToTrip,
  userLocation,
}: Omit<Props, 'locationLoading' | 'onRequestLocation'>) {
  const [selected, setSelected] = useState<SelectedPin | null>(null);
  const [mapErrored, setMapErrored] = useState(false);

  const { pins, pinLookup } = useMemo(() => {
    const lookup = new Map<string, SelectedPin>();
    const all: MapPin[] = [];

    attractions.forEach((a) => {
      const id = `att_${a.id}`;
      all.push({
        id,
        name: a.name,
        category: a.type,
        latitude: a.latitude,
        longitude: a.longitude,
        color: Colors.primary,
      });
      lookup.set(id, { type: 'attraction', data: a });
    });

    liveResults
      .filter((r) => typeof r.latitude === 'number' && typeof r.longitude === 'number')
      .forEach((r) => {
        const id = `live_${r.id}`;
        all.push({
          id,
          name: r.name,
          category: r.category,
          latitude: r.latitude as number,
          longitude: r.longitude as number,
          color: Colors.accent,
        });
        lookup.set(id, { type: 'live', data: r });
      });

    return { pins: all, pinLookup: lookup };
  }, [attractions, liveResults]);

  const handlePinTap = useCallback(
    (pin: MapPin) => {
      const found = pinLookup.get(pin.id);
      if (found) setSelected(found);
    },
    [pinLookup]
  );

  if (mapErrored) {
    return <MapPlaceholder attractions={attractions} totalCount={totalCount} />;
  }

  return (
    <View style={styles.mapFill}>
      <WebLeafletMap
        pins={pins}
        userLocation={userLocation}
        onPinTap={handlePinTap}
        onError={() => setMapErrored(true)}
      />
      {selected && (
        <PinInfoCard
          selected={selected}
          isSaved={isSaved}
          isSavedFsq={isSavedFsq}
          onSaveToggle={onSaveToggle}
          onLiveSaveToggle={onLiveSaveToggle}
          onAddToTrip={onAddToTrip}
          onLiveAddToTrip={onLiveAddToTrip}
          onDismiss={() => setSelected(null)}
        />
      )}
    </View>
  );
}

// ── Native Mapbox map (EAS dev / production builds only) ──────────────

function DiscoverMapNative({
  attractions,
  liveResults,
  isSaved,
  isSavedFsq,
  onSaveToggle,
  onLiveSaveToggle,
  onAddToTrip,
  onLiveAddToTrip,
  userLocation,
}: Omit<Props, 'totalCount' | 'locationLoading' | 'onRequestLocation'>) {
  const [selected, setSelected] = useState<SelectedPin | null>(null);

  // Camera center + zoom — updated imperatively when user location arrives
  const [cameraCenter, setCameraCenter] = useState<[number, number]>(() => {
    if (userLocation) return [userLocation.longitude, userLocation.latitude];
    if (attractions.length === 0) return [-98.5795, 39.8283];
    const lon = attractions.reduce((s, a) => s + a.longitude, 0) / attractions.length;
    const lat = attractions.reduce((s, a) => s + a.latitude, 0) / attractions.length;
    return [lon, lat];
  });
  const [cameraZoom, setCameraZoom] = useState(
    userLocation ? 12 : attractions.length > 0 ? 5 : 3
  );

  useEffect(() => {
    if (!userLocation) return;
    setCameraCenter([userLocation.longitude, userLocation.latitude]);
    setCameraZoom(12);
  }, [userLocation]);

  const mappableLive = useMemo(
    () =>
      liveResults.filter(
        (r) => typeof r.latitude === 'number' && typeof r.longitude === 'number'
      ),
    [liveResults]
  );

  const mapbox = getMapboxGL();
  if (!mapbox) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const MapView = mapbox.MapView as React.ComponentType<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Camera = mapbox.Camera as React.ComponentType<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const PointAnnotation = mapbox.PointAnnotation as React.ComponentType<any>;

  return (
    <View style={styles.mapFill}>
      <MapView style={styles.map} styleURL="mapbox://styles/mapbox/streets-v12">
        <Camera
          centerCoordinate={cameraCenter}
          zoomLevel={cameraZoom}
          animationMode="flyTo"
          animationDuration={800}
        />

        {attractions.map((a) => (
          <PointAnnotation
            key={`att-${a.id}`}
            id={`att-${a.id}`}
            coordinate={[a.longitude, a.latitude]}
            onSelected={() => setSelected({ type: 'attraction', data: a })}
          >
            <View style={styles.pinMarker}>
              <Ionicons name="location" size={22} color={Colors.primary} />
            </View>
          </PointAnnotation>
        ))}

        {mappableLive.map((r) => (
          <PointAnnotation
            key={`live-${r.id}`}
            id={`live-${r.id}`}
            coordinate={[r.longitude as number, r.latitude as number]}
            onSelected={() => setSelected({ type: 'live', data: r })}
          >
            <View style={styles.livePinMarker}>
              <Ionicons name="location" size={22} color={Colors.accent} />
            </View>
          </PointAnnotation>
        ))}

        {userLocation && (
          <PointAnnotation
            key="user-location"
            id="user-location"
            coordinate={[userLocation.longitude, userLocation.latitude]}
          >
            <View style={styles.userDot} />
          </PointAnnotation>
        )}
      </MapView>

      {selected && (
        <PinInfoCard
          selected={selected}
          isSaved={isSaved}
          isSavedFsq={isSavedFsq}
          onSaveToggle={onSaveToggle}
          onLiveSaveToggle={onLiveSaveToggle}
          onAddToTrip={onAddToTrip}
          onLiveAddToTrip={onLiveAddToTrip}
          onDismiss={() => setSelected(null)}
        />
      )}
    </View>
  );
}

// ── Shared pin info card ──────────────────────────────────────────────

function PinInfoCard({
  selected,
  isSaved,
  isSavedFsq,
  onSaveToggle,
  onLiveSaveToggle,
  onAddToTrip,
  onLiveAddToTrip,
  onDismiss,
}: {
  selected: SelectedPin;
  isSaved: (localId: string) => boolean;
  isSavedFsq: (fsqId: string) => boolean;
  onSaveToggle: (attraction: BundledAttraction) => void;
  onLiveSaveToggle: (item: DiscoverItem) => void;
  onAddToTrip: (attraction: BundledAttraction) => void;
  onLiveAddToTrip: (item: DiscoverItem) => void;
  onDismiss: () => void;
}) {
  const { bottom } = useSafeAreaInsets();
  const isAttr = selected.type === 'attraction';
  const attrData = isAttr ? (selected.data as BundledAttraction) : null;
  const liveData = !isAttr ? (selected.data as DiscoverItem) : null;

  const name = attrData?.name ?? liveData?.name ?? '';
  const loc = attrData
    ? [attrData.city, attrData.state].filter(Boolean).join(', ')
    : [liveData?.city, liveData?.region].filter(Boolean).join(', ');
  const cat = attrData?.type ?? liveData?.category ?? '';
  const rating = liveData?.rating;
  const savedAttr = attrData ? isSaved(attrData.id) : false;
  const savedLive = liveData?.fsqId ? isSavedFsq(liveData.fsqId) : false;
  const isSavedPin = isAttr ? savedAttr : savedLive;
  const isLive = selected.type === 'live';

  return (
    <View
      style={[
        styles.pinCard,
        { paddingBottom: Math.max(Spacing['2xl'], bottom + Spacing.md) },
      ]}
    >
      <View style={styles.handleBar} />

      <View style={styles.pinCardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.pinCardName} numberOfLines={2}>
            {name}
          </Text>
          {!!loc && (
            <Text style={styles.pinCardLoc} numberOfLines={1}>
              {loc}
            </Text>
          )}
        </View>
        <TouchableOpacity
          onPress={onDismiss}
          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
        >
          <Ionicons name="close" size={20} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={styles.pinCardMeta}>
        {!!cat && (
          <View style={styles.catChip}>
            <Text style={styles.catChipText}>{cat}</Text>
          </View>
        )}
        {isLive && (
          <View style={styles.sourceBadge}>
            <Text style={styles.sourceBadgeText}>Foursquare</Text>
          </View>
        )}
        {rating !== undefined && (
          <View style={styles.ratingChip}>
            <Ionicons name="star" size={11} color={Colors.warning} />
            <Text style={styles.ratingText}>{rating.toFixed(1)}</Text>
          </View>
        )}
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          style={styles.saveBtn}
          onPress={() => {
            if (attrData) onSaveToggle(attrData);
            else if (liveData) onLiveSaveToggle(liveData);
          }}
          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
        >
          <Ionicons
            name={isSavedPin ? 'heart' : 'heart-outline'}
            size={22}
            color={isSavedPin ? Colors.error : Colors.placeholder}
          />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => {
            if (attrData) onAddToTrip(attrData);
            else if (liveData) onLiveAddToTrip(liveData);
          }}
        >
          <Ionicons name="add-circle-outline" size={13} color={Colors.primary} />
          <Text style={styles.addBtnText}>Add to trip</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  mapFill: { flex: 1 },
  map: { flex: 1 },
  pinMarker: { alignItems: 'center', justifyContent: 'center' },
  livePinMarker: { alignItems: 'center', justifyContent: 'center' },

  // User "You are here" dot (Mapbox native only; WebLeaflet uses injected HTML)
  userDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.primary,
    borderWidth: 3,
    borderColor: Colors.white,
    ...Shadow.sm,
  },

  // Floating location button
  locateBtn: {
    position: 'absolute',
    top: Spacing.lg,
    right: Spacing.lg,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.md,
  },
  locateBtnActive: {
    borderColor: Colors.primary + '50',
    backgroundColor: Colors.primary + '0A',
  },

  // Pin info card (bottom sheet)
  pinCard: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: Colors.border,
    paddingTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
    ...Shadow.lg,
  },
  handleBar: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    marginBottom: Spacing.xs,
  },
  pinCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  pinCardName: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    lineHeight: 22,
  },
  pinCardLoc: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  pinCardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  catChip: {
    backgroundColor: Colors.chipBackground,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  catChipText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  sourceBadge: {
    backgroundColor: Colors.accent + '20',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  sourceBadgeText: {
    fontSize: FontSize.xs,
    color: Colors.accent,
    fontWeight: FontWeight.semibold,
  },
  ratingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.warning + '18',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  ratingText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.warning,
  },
  saveBtn: { padding: Spacing.xs },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary + '14',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  addBtnText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.primary,
  },
});
