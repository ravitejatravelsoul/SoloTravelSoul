import { useState, useMemo, useCallback, memo, useRef, useEffect } from 'react';
import {
  FlatList,
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@/components/ui';
import { CategoryGrid } from '@/components/discover/CategoryGrid';
import type { TravelCategory } from '@/components/discover/CategoryGrid';
import { DiscoverMapView } from '@/components/map/DiscoverMapView';
import { AddToTripSheet } from '@/components/trips/AddToTripSheet';
import { useSavedPlaces } from '@/hooks/useSavedPlaces';
import { useHaptics } from '@/hooks/useHaptics';
import { useLocation } from '@/hooks/useLocation';
import { useAuthStore } from '@/stores/authStore';
import { distanceBetweenKm, formatDistance } from '@/services/locationService';
import { searchPlaces, searchNearby, isFoursquareEnabled, isFoursquareConfigured } from '@/services/foursquareService';
import type { PlaceSearchResult } from '@/services/foursquareService';
import { Colors, Gradients, Spacing, Radius, Shadow, FontSize, FontWeight } from '@/constants/theme';
import type { BundledAttraction, PlaceEntry, PlaceCategory, DiscoverItem } from '@solotravelsoul/shared';

const MIN_LIVE_QUERY_LEN = 3;
const DEBOUNCE_MS = 600;

function generatePlaceId(): string {
  return `ip-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function attractionToPlace(attraction: BundledAttraction): PlaceEntry {
  const categoryMap: Record<string, PlaceCategory> = { Food: 'food' };
  return {
    id: generatePlaceId(),
    attractionId: attraction.id,
    name: attraction.name,
    category: categoryMap[attraction.type] ?? 'attraction',
    notes: [attraction.city, attraction.state].filter(Boolean).join(', '),
  };
}

function discoverItemToPlace(item: DiscoverItem): PlaceEntry {
  return {
    id: `fsq-${item.fsqId ?? item.id}-${Date.now()}`,
    attractionId: item.fsqId,
    name: item.name,
    category: 'attraction',
    notes: [item.city, item.region].filter(Boolean).join(', '),
    latitude: item.latitude,
    longitude: item.longitude,
  };
}

// ── Bundled data ──────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-var-requires
const attractions: BundledAttraction[] = require('@/assets/attractions.json');

// ── Category → bundled types mapping ─────────────────────────────────
function matchesCategory(attraction: BundledAttraction, category: TravelCategory): boolean {
  return category.types.includes(attraction.type);
}

const TYPE_GRADIENT: Record<string, readonly [string, string]> = {
  Beach: Gradients.beach,
  Hiking: Gradients.mountain,
  City: Gradients.city,
  Food: Gradients.food,
  Adventure: Gradients.adventure,
  Nightlife: Gradients.nightlife,
  'Hidden Gem': Gradients.hidden,
  Solo: Gradients.solo,
};

const TYPE_EMOJI: Record<string, string> = {
  Beach: '🏖️',
  Hiking: '⛰️',
  City: '🏙️',
  Food: '🍜',
  Adventure: '🧗',
  Nightlife: '🌙',
  'Hidden Gem': '💎',
  Solo: '🧳',
};

type ViewMode = 'list' | 'map';

export default function DiscoverScreen() {
  const isEnabled = isFoursquareEnabled();
  const isConfigured = isFoursquareConfigured();
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<TravelCategory | null>(null);
  const [addToTripPlace, setAddToTripPlace] = useState<PlaceEntry | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [liveResults, setLiveResults] = useState<DiscoverItem[]>([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveRateLimited, setLiveRateLimited] = useState(false);
  const [nearbyResults, setNearbyResults] = useState<DiscoverItem[]>([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [nearbySource, setNearbySource] = useState<PlaceSearchResult['source'] | null>(null);

  const uid = useAuthStore((s) => s.user?.uid ?? '');
  const {
    savedPlaces,
    savePlace,
    unsavePlace,
    isSaved,
    getSavedId,
    isSavedByFsqId,
    getSavedIdByFsqId,
  } = useSavedPlaces();
  const haptics = useHaptics();
  const { location, loading: locationLoading, requestLocation, clearLocation } = useLocation();

  const handleQueryChange = useCallback((text: string) => {
    setQuery(text);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => setDebouncedQuery(text), DEBOUNCE_MS);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = attractions.filter((a) => {
      const matchCat = !selectedCategory || matchesCategory(a, selectedCategory);
      const matchQuery =
        !q ||
        a.name.toLowerCase().includes(q) ||
        a.state.toLowerCase().includes(q) ||
        (a.city ?? '').toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q);
      return matchCat && matchQuery;
    });

    if (!location) return base;

    return [...base].sort(
      (a, b) =>
        distanceBetweenKm(location, { latitude: a.latitude, longitude: a.longitude }) -
        distanceBetweenKm(location, { latitude: b.latitude, longitude: b.longitude })
    );
  }, [query, selectedCategory, location]);

  const getDistance = useCallback(
    (a: BundledAttraction): number | null => {
      if (!location) return null;
      return distanceBetweenKm(location, { latitude: a.latitude, longitude: a.longitude });
    },
    [location]
  );

  const handleSaveToggle = useCallback(
    async (attraction: BundledAttraction) => {
      if (isSaved(attraction.id)) {
        haptics.light();
        const savedId = getSavedId(attraction.id);
        if (savedId) await unsavePlace(savedId);
      } else {
        haptics.success();
        await savePlace({
          name: attraction.name,
          category: attraction.type,
          localId: attraction.id,
          city: attraction.city,
          state: attraction.state,
          description: attraction.description,
        });
      }
    },
    [isSaved, getSavedId, savePlace, unsavePlace, haptics]
  );

  const handleAddToTrip = useCallback(
    (attraction: BundledAttraction) => {
      haptics.medium();
      setAddToTripPlace(attractionToPlace(attraction));
    },
    [haptics]
  );

  const handleLiveSaveToggle = useCallback(
    async (item: DiscoverItem) => {
      if (!item.fsqId) return;
      if (isSavedByFsqId(item.fsqId)) {
        haptics.light();
        const savedId = getSavedIdByFsqId(item.fsqId);
        if (savedId) await unsavePlace(savedId);
      } else {
        haptics.success();
        await savePlace({
          name: item.name,
          category: 'attraction',
          fsqId: item.fsqId,
          city: item.city,
          description: item.description,
        });
      }
    },
    [isSavedByFsqId, getSavedIdByFsqId, savePlace, unsavePlace, haptics]
  );

  const handleLiveAddToTrip = useCallback(
    (item: DiscoverItem) => {
      haptics.medium();
      setAddToTripPlace(discoverItemToPlace(item));
    },
    [haptics]
  );

  const renderAttraction = useCallback(
    ({ item }: { item: BundledAttraction }) => (
      <AttractionCard
        attraction={item}
        saved={isSaved(item.id)}
        onSaveToggle={() => handleSaveToggle(item)}
        onAddToTrip={() => handleAddToTrip(item)}
        distance={getDistance(item)}
      />
    ),
    [isSaved, handleSaveToggle, getDistance, handleAddToTrip]
  );

  const showLiveSection = debouncedQuery.length >= MIN_LIVE_QUERY_LEN;

  // Merge text-search and nearby results for the map, deduped by fsqId
  const mergedLiveResults = useMemo<DiscoverItem[]>(() => {
    if (!isEnabled) return [];
    const seen = new Set<string>();
    const merged: DiscoverItem[] = [];
    for (const item of [...liveResults, ...nearbyResults]) {
      const key = item.fsqId ?? item.id;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(item);
      }
    }
    return merged;
  }, [liveResults, nearbyResults, isEnabled]);

  // Status message overlaid on the map when live places have a notable state
  const liveMapStatus = useMemo<string | undefined>(() => {
    if (viewMode !== 'map') return undefined;
    if (!isEnabled) return undefined; // live search coming soon — map shows bundled pins only
    if (isEnabled && !isConfigured) return undefined;
    if (!location) return undefined; // waiting for user to tap locate
    if (nearbyLoading || locationLoading) return 'Searching nearby…';
    if (nearbySource === 'key_rejected') return 'Foursquare key rejected — check Service API Key permissions';
    if (nearbySource === 'rate_limited') return 'Daily search limit reached';
    if (nearbySource === 'disabled') return 'Foursquare API key missing';
    if (mergedLiveResults.length === 0) return 'No live places found nearby';
    const withCoords = mergedLiveResults.filter(
      (r) => typeof r.latitude === 'number' && typeof r.longitude === 'number'
    );
    if (withCoords.length === 0) return 'Live places found, but no map coordinates';
    return undefined; // pins are visible — no banner needed
  }, [viewMode, isEnabled, isConfigured, location, nearbyLoading, locationLoading, nearbySource, mergedLiveResults]);

  useEffect(() => {
    if (!showLiveSection || !isEnabled || !uid) {
      setLiveResults([]);
      setLiveRateLimited(false);
      setLiveLoading(false);
      return;
    }
    let cancelled = false;
    setLiveLoading(true);
    setLiveResults([]);
    setLiveRateLimited(false);
    searchPlaces(debouncedQuery, uid).then((r) => {
      if (cancelled) return;
      if (r.source === 'rate_limited') {
        setLiveRateLimited(true);
      } else {
        setLiveResults(r.results);
      }
      setLiveLoading(false);
    }).catch(() => {
      if (!cancelled) setLiveLoading(false);
    });
    return () => { cancelled = true; };
  }, [debouncedQuery, uid, isEnabled, showLiveSection]);

  // Nearby live search — fires once per location tap (one-shot, not continuous)
  useEffect(() => {
    if (!location || !isEnabled || !uid) {
      setNearbyResults([]);
      setNearbySource(null);
      setNearbyLoading(false);
      if (__DEV__) console.log('[Discover] searchNearby skipped — location:', !!location, 'isEnabled:', isEnabled, 'uid:', !!uid);
      return;
    }
    let cancelled = false;
    setNearbyLoading(true);
    if (__DEV__) console.log('[Discover] searchNearby starting at', location);
    searchNearby(location, uid, 20).then((r) => {
      if (cancelled) return;
      setNearbySource(r.source);
      if (r.source !== 'rate_limited' && r.source !== 'key_rejected') setNearbyResults(r.results);
      if (__DEV__) {
        const withCoords = r.results.filter((x) => typeof x.latitude === 'number' && typeof x.longitude === 'number');
        console.log(`[Discover] searchNearby → ${r.results.length} results, ${withCoords.length} with coords, source: ${r.source}`);
      }
      setNearbyLoading(false);
    }).catch((err) => {
      if (__DEV__) console.error('[Discover] searchNearby error:', err);
      if (!cancelled) setNearbyLoading(false);
    });
    return () => { cancelled = true; };
  }, [location, uid, isEnabled]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>

      {/* ── Fixed header ── */}
      <View style={styles.header}>
        <View>
          <Text variant="h2">Discover</Text>
          {viewMode === 'list' && (
            <Text variant="caption" style={styles.subtitle}>
              {filtered.length} place{filtered.length !== 1 ? 's' : ''} to explore
            </Text>
          )}
        </View>

        {/* List / Map toggle */}
        <View style={styles.toggle}>
          <ToggleBtn
            active={viewMode === 'list'}
            onPress={() => setViewMode('list')}
            icon="list-outline"
            label="List"
          />
          <ToggleBtn
            active={viewMode === 'map'}
            onPress={() => setViewMode('map')}
            icon="map-outline"
            label="Map"
          />
        </View>
      </View>

      {/* ── Map mode ── */}
      {viewMode === 'map' ? (
        <DiscoverMapView
          attractions={filtered}
          liveResults={mergedLiveResults}
          totalCount={attractions.length}
          isSaved={isSaved}
          isSavedFsq={isSavedByFsqId}
          onSaveToggle={handleSaveToggle}
          onLiveSaveToggle={handleLiveSaveToggle}
          onAddToTrip={handleAddToTrip}
          onLiveAddToTrip={handleLiveAddToTrip}
          userLocation={location}
          locationLoading={locationLoading || nearbyLoading}
          onRequestLocation={requestLocation}
          liveStatusMessage={liveMapStatus}
        />
      ) : (
        <>
          {/* ── Search ── */}
          <View style={styles.searchRow}>
            <View style={styles.searchContainer}>
              <Ionicons name="search-outline" size={16} color={Colors.placeholder} style={styles.searchIcon} />
              <TextInput
                value={query}
                onChangeText={handleQueryChange}
                placeholder="Search destinations, cities, states…"
                placeholderTextColor={Colors.placeholder}
                style={styles.searchInput}
                returnKeyType="search"
                autoCapitalize="none"
                autoCorrect={false}
              />
              {query.length > 0 && (
                <TouchableOpacity
                  onPress={() => { handleQueryChange(''); }}
                  style={styles.clearBtn}
                >
                  <Ionicons name="close-circle" size={16} color={Colors.placeholder} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          <FlatList
            data={filtered}
            keyExtractor={(a) => a.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            initialNumToRender={8}
            maxToRenderPerBatch={5}
            windowSize={10}
            removeClippedSubviews
            renderItem={renderAttraction}
            ListHeaderComponent={
              <View style={styles.listHeader}>

                {/* ── Category grid ── */}
                <Text variant="label" style={styles.sectionLabel}>Browse by category</Text>
                <CategoryGrid
                  selectedId={selectedCategory?.id ?? null}
                  onSelect={setSelectedCategory}
                  style={styles.categoryGrid}
                />

                {/* ── Near me + active filter row ── */}
                <View style={styles.filterRow}>
                  {/* Near me button */}
                  <TouchableOpacity
                    style={[styles.nearMeBtn, location && styles.nearMeBtnActive]}
                    onPress={location ? clearLocation : requestLocation}
                    activeOpacity={0.8}
                  >
                    {locationLoading ? (
                      <ActivityIndicator size="small" color={Colors.primary} />
                    ) : (
                      <Ionicons
                        name={location ? 'location' : 'location-outline'}
                        size={14}
                        color={location ? Colors.primary : Colors.textSecondary}
                      />
                    )}
                    <Text style={[styles.nearMeLabel, location && styles.nearMeLabelActive]}>
                      {locationLoading ? 'Locating…' : location ? 'Sorted by distance' : 'Near me'}
                    </Text>
                    {location && (
                      <Ionicons name="close" size={13} color={Colors.primary} />
                    )}
                  </TouchableOpacity>

                  {/* Active category filter chip */}
                  {selectedCategory && (
                    <TouchableOpacity
                      style={styles.activeFilter}
                      onPress={() => setSelectedCategory(null)}
                    >
                      <Text style={styles.activeFilterText}>
                        {selectedCategory.emoji} {selectedCategory.label}
                      </Text>
                      <Ionicons name="close" size={13} color={Colors.primary} />
                    </TouchableOpacity>
                  )}
                </View>

                {/* ── Saved places ── */}
                {savedPlaces.length > 0 && (
                  <View style={styles.savedSection}>
                    <View style={styles.sectionHeaderRow}>
                      <Ionicons name="heart" size={14} color={Colors.error} />
                      <Text variant="label" style={styles.sectionTitle}>Saved places</Text>
                      <View style={styles.countBadge}>
                        <Text style={styles.countText}>{savedPlaces.length}</Text>
                      </View>
                    </View>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.savedList}
                    >
                      {savedPlaces.map((p) => (
                        <SavedPill key={p.id} name={p.name} onRemove={() => unsavePlace(p.id)} />
                      ))}
                    </ScrollView>
                  </View>
                )}

                {/* ── Trending placeholder (Phase 2) ── */}
                <TrendingSection />

                {/* ── Local results header ── */}
                <View style={styles.sectionHeaderRow}>
                  <Ionicons name="location" size={14} color={Colors.primary} />
                  <Text variant="label" style={styles.sectionTitle}>
                    {selectedCategory ? selectedCategory.label : 'Local destinations'}
                  </Text>
                  <Text variant="caption" style={styles.resultCount}>
                    {filtered.length} result{filtered.length !== 1 ? 's' : ''}
                  </Text>
                </View>
              </View>
            }
            ListEmptyComponent={
              <View style={styles.noResults}>
                <Text style={styles.noResultsEmoji}>🔍</Text>
                <Text variant="h3" center>
                  {selectedCategory
                    ? `No ${selectedCategory.label.toLowerCase()} places yet`
                    : `No results for "${query}"`}
                </Text>
                <Text variant="caption" center style={styles.noResultsSub}>
                  {selectedCategory
                    ? 'More places coming in Phase 2 with live destination data.'
                    : 'Try a different search term or category.'}
                </Text>
                {selectedCategory && (
                  <TouchableOpacity onPress={() => setSelectedCategory(null)} style={styles.clearFilterBtn}>
                    <Text style={styles.clearFilterText}>Show all places</Text>
                  </TouchableOpacity>
                )}
              </View>
            }
            ListFooterComponent={
              showLiveSection ? (
                <LiveSearchSection
                  query={debouncedQuery}
                  isEnabled={isEnabled}
                  loading={liveLoading}
                  results={liveResults}
                  rateLimited={liveRateLimited}
                  onSaveToggle={handleLiveSaveToggle}
                  onAddToTrip={handleLiveAddToTrip}
                  isSavedFsq={isSavedByFsqId}
                />
              ) : null
            }
          />
        </>
      )}

      <AddToTripSheet
        visible={addToTripPlace !== null}
        place={addToTripPlace}
        onClose={() => setAddToTripPlace(null)}
      />
    </SafeAreaView>
  );
}

// ── Sub-components ────────────────────────────────────────────────────

function ToggleBtn({
  active,
  onPress,
  icon,
  label,
}: {
  active: boolean;
  onPress: () => void;
  icon: string;
  label: string;
}) {
  return (
    <TouchableOpacity
      style={[styles.toggleBtn, active && styles.toggleBtnActive]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Ionicons
        name={icon as never}
        size={14}
        color={active ? Colors.primary : Colors.textSecondary}
      />
      <Text style={[styles.toggleLabel, active && styles.toggleLabelActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const AttractionCard = memo(function AttractionCard({
  attraction,
  saved,
  onSaveToggle,
  onAddToTrip,
  distance,
}: {
  attraction: BundledAttraction;
  saved: boolean;
  onSaveToggle: () => void;
  onAddToTrip: () => void;
  distance: number | null;
}) {
  const gradient = TYPE_GRADIENT[attraction.type] ?? Gradients.primary;
  const typeEmoji = TYPE_EMOJI[attraction.type] ?? '📍';

  return (
    <View style={styles.card}>
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.cardAccent}
      >
        <Text style={styles.cardAccentEmoji}>{typeEmoji}</Text>
        {distance !== null && (
          <View style={styles.distanceBadge}>
            <Ionicons name="navigate-outline" size={10} color={Colors.white} />
            <Text style={styles.distanceText}>{formatDistance(distance)}</Text>
          </View>
        )}
      </LinearGradient>

      <View style={styles.cardBody}>
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <Text variant="h3" numberOfLines={1}>{attraction.name}</Text>
            <Text variant="caption" style={styles.cardLocation}>
              {[attraction.city, attraction.state].filter(Boolean).join(', ')}
            </Text>
          </View>
          <TouchableOpacity
            onPress={onSaveToggle}
            style={styles.saveBtn}
            hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
          >
            <Ionicons
              name={saved ? 'heart' : 'heart-outline'}
              size={22}
              color={saved ? Colors.error : Colors.placeholder}
            />
          </TouchableOpacity>
        </View>

        <Text variant="body" numberOfLines={3} style={styles.desc}>
          {attraction.description}
        </Text>

        <View style={styles.cardFooter}>
          <View style={styles.typeChip}>
            <Text style={styles.typeChipText}>{attraction.type}</Text>
          </View>
          <TouchableOpacity
            style={styles.addTripBtn}
            onPress={onAddToTrip}
            hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}
          >
            <Ionicons name="add-circle-outline" size={13} color={Colors.primary} />
            <Text style={styles.addTripBtnText}>Add to trip</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
});

const LivePlaceCard = memo(function LivePlaceCard({
  item,
  saved,
  onSaveToggle,
  onAddToTrip,
}: {
  item: DiscoverItem;
  saved: boolean;
  onSaveToggle: () => void;
  onAddToTrip: () => void;
}) {
  return (
    <View style={styles.liveCard}>
      <View style={styles.cardBody}>
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <Text variant="h3" numberOfLines={1}>{item.name}</Text>
            <Text variant="caption" style={styles.cardLocation}>
              {[item.city, item.region].filter(Boolean).join(', ')}
            </Text>
          </View>
          <TouchableOpacity
            onPress={onSaveToggle}
            style={styles.saveBtn}
            hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
          >
            <Ionicons
              name={saved ? 'heart' : 'heart-outline'}
              size={22}
              color={saved ? Colors.error : Colors.placeholder}
            />
          </TouchableOpacity>
        </View>

        <Text variant="body" numberOfLines={2} style={styles.desc}>
          {item.description}
        </Text>

        <View style={styles.cardFooter}>
          <View style={styles.typeChip}>
            <Text style={styles.typeChipText}>{item.category}</Text>
          </View>
          {item.rating !== undefined && (
            <View style={styles.ratingChip}>
              <Ionicons name="star" size={11} color={Colors.warning} />
              <Text style={styles.ratingText}>{item.rating.toFixed(1)}</Text>
            </View>
          )}
          <TouchableOpacity
            style={styles.addTripBtn}
            onPress={onAddToTrip}
            hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}
          >
            <Ionicons name="add-circle-outline" size={13} color={Colors.primary} />
            <Text style={styles.addTripBtnText}>Add to trip</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
});

const SavedPill = memo(function SavedPill({
  name,
  onRemove,
}: { name: string; onRemove: () => void }) {
  return (
    <View style={styles.savedPill}>
      <Ionicons name="heart" size={10} color={Colors.error} />
      <Text variant="caption" numberOfLines={1} style={styles.savedPillText}>{name}</Text>
      <TouchableOpacity onPress={onRemove} hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}>
        <Ionicons name="close-circle" size={14} color={Colors.placeholder} />
      </TouchableOpacity>
    </View>
  );
});

function TrendingSection() {
  return (
    <View style={styles.trendingCard}>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.trendingEmoji}>🔥</Text>
        <Text variant="label" style={styles.sectionTitle}>Trending destinations</Text>
        <View style={styles.phase2Badge}>
          <Text style={styles.phase2Text}>Phase 2</Text>
        </View>
      </View>
      <Text variant="caption" style={styles.trendingBody}>
        Live trending destinations powered by real traveler activity — coming soon.
        Connect Foursquare to unlock real-time popular places near any destination.
      </Text>
    </View>
  );
}

// ── Live search section (shown when query ≥ 3 chars) ─────────────────

function LiveSearchSection({
  query,
  isEnabled,
  loading,
  results,
  rateLimited,
  onSaveToggle,
  onAddToTrip,
  isSavedFsq,
}: {
  query: string;
  isEnabled: boolean;
  loading: boolean;
  results: DiscoverItem[];
  rateLimited: boolean;
  onSaveToggle: (item: DiscoverItem) => void;
  onAddToTrip: (item: DiscoverItem) => void;
  isSavedFsq: (fsqId: string) => boolean;
}) {

  return (
    <View style={styles.liveSection}>
      <View style={styles.sectionHeaderRow}>
        <Ionicons name="globe-outline" size={14} color={Colors.primary} />
        <Text variant="label" style={styles.sectionTitle}>Live destinations</Text>
        {isEnabled ? (
          <View style={styles.fsqBadge}>
            <Text style={styles.fsqBadgeText}>Foursquare</Text>
          </View>
        ) : (
          <View style={styles.phase2Badge}>
            <Text style={styles.phase2Text}>Coming soon</Text>
          </View>
        )}
      </View>

      {!isEnabled ? (
        <View style={styles.comingSoonCard}>
          <View style={styles.comingSoonIconRow}>
            <Text style={styles.comingSoonEmoji}>🌍</Text>
          </View>
          <Text variant="h3" style={styles.comingSoonTitle}>
            Search "{query}" worldwide
          </Text>
          <Text variant="caption" style={styles.comingSoonBody}>
            Live destination search powered by Foursquare — millions of real places coming in Phase 2.
            Local bundled results are shown above.
          </Text>
          <View style={styles.comingSoonFeatures}>
            {['Real-time place data', 'Photos & ratings', 'Address & map pin'].map((f) => (
              <View key={f} style={styles.featureRow}>
                <Ionicons name="checkmark-circle-outline" size={13} color={Colors.primary} />
                <Text style={styles.featureText}>{f}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : rateLimited ? (
        <View style={styles.rateLimitCard}>
          <Ionicons name="alert-circle-outline" size={18} color={Colors.warning} />
          <Text variant="caption" style={styles.rateLimitText}>
            Daily search limit reached. Live results will be available again tomorrow.
          </Text>
        </View>
      ) : loading ? (
        <LiveResultsSkeleton />
      ) : results.length === 0 ? (
        <View style={styles.noLiveResults}>
          <Text variant="caption" style={styles.noLiveText}>
            No live results found for "{query}"
          </Text>
        </View>
      ) : (
        <View style={styles.liveResultsList}>
          {results.map((item) => (
            <LivePlaceCard
              key={item.id}
              item={item}
              saved={item.fsqId ? isSavedFsq(item.fsqId) : false}
              onSaveToggle={() => onSaveToggle(item)}
              onAddToTrip={() => onAddToTrip(item)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function LiveResultsSkeleton() {
  return (
    <View style={styles.skeletonContainer}>
      {[1, 2, 3].map((i) => (
        <View key={i} style={styles.skeletonCard}>
          <View style={styles.skeletonBody}>
            <View style={[styles.skeletonLine, { width: '65%' }]} />
            <View style={[styles.skeletonLine, { width: '40%', marginTop: 6 }]} />
            <View style={[styles.skeletonLine, { width: '90%', marginTop: 10 }]} />
            <View style={[styles.skeletonLine, { width: '75%', marginTop: 4 }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xs,
  },
  subtitle: { color: Colors.textSecondary, marginTop: 2 },

  // List/Map toggle
  toggle: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: 3,
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm - 2,
    borderRadius: Radius.md,
  },
  toggleBtnActive: {
    backgroundColor: Colors.white,
    ...Shadow.sm,
  },
  toggleLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
  },
  toggleLabelActive: {
    color: Colors.primary,
  },

  // Search
  searchRow: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.searchBackground,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    minHeight: 46,
    gap: Spacing.xs,
  },
  searchIcon: { flexShrink: 0 },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: Colors.textPrimary,
    paddingVertical: Spacing.sm,
  },
  clearBtn: { padding: Spacing.xs },

  list: { paddingBottom: Spacing['4xl'] },
  listHeader: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm },

  sectionLabel: {
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
    textTransform: 'uppercase',
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.5,
  },
  categoryGrid: { marginBottom: Spacing.md },

  // Filter row (Near me + active category chip)
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
    alignItems: 'center',
  },
  nearMeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  nearMeBtnActive: {
    borderColor: Colors.primary + '40',
    backgroundColor: Colors.primary + '0A',
  },
  nearMeLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  nearMeLabelActive: {
    color: Colors.primary,
  },
  activeFilter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.primary + '14',
    borderWidth: 1,
    borderColor: Colors.primary + '40',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  activeFilterText: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: FontWeight.medium,
  },

  // Saved
  savedSection: { marginBottom: Spacing.lg },
  savedList: { gap: Spacing.sm, paddingVertical: Spacing.xs },
  savedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    maxWidth: 160,
    ...Shadow.sm,
  },
  savedPillText: { flex: 1, color: Colors.textPrimary },

  // Section headers
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  sectionTitle: { flex: 1 },
  countBadge: {
    backgroundColor: Colors.chipBackground,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    minWidth: 22,
    alignItems: 'center',
  },
  countText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textSecondary },
  resultCount: { color: Colors.placeholder },

  // Trending placeholder
  trendingCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  trendingEmoji: { fontSize: 14 },
  trendingBody: { color: Colors.textSecondary, lineHeight: 18, marginTop: Spacing.xs },
  phase2Badge: {
    backgroundColor: Colors.primary + '18',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  phase2Text: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.semibold },

  // Attraction cards
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.md,
  },
  cardAccent: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  cardAccentEmoji: { fontSize: 22, lineHeight: 28 },
  distanceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0,0,0,0.22)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  distanceText: {
    fontSize: 10,
    fontWeight: FontWeight.semibold,
    color: Colors.white,
  },
  cardBody: { padding: Spacing.md, gap: Spacing.sm },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  cardLocation: { marginTop: 2, color: Colors.textSecondary },
  saveBtn: { padding: Spacing.xs, marginTop: -2 },
  desc: { color: Colors.textSecondary, lineHeight: 20 },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  typeChip: {
    backgroundColor: Colors.chipBackground,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  typeChipText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    color: Colors.textSecondary,
  },
  addTripBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary + '14',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  addTripBtnText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.primary,
  },

  // Live place card
  liveCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    marginBottom: Spacing.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary + '80',
    ...Shadow.sm,
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

  // Empty state
  noResults: {
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing['3xl'],
    paddingHorizontal: Spacing['2xl'],
  },
  noResultsEmoji: { fontSize: 44, lineHeight: 54 },
  noResultsSub: { color: Colors.placeholder, lineHeight: 20 },
  clearFilterBtn: {
    marginTop: Spacing.sm,
    backgroundColor: Colors.primary + '14',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: Radius.full,
  },
  clearFilterText: {
    color: Colors.primary,
    fontWeight: FontWeight.semibold,
    fontSize: FontSize.sm,
  },

  // Live search section
  liveSection: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing['2xl'],
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    marginTop: Spacing.md,
  },

  // Foursquare badge
  fsqBadge: {
    backgroundColor: Colors.accent + '20',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  fsqBadgeText: {
    fontSize: FontSize.xs,
    color: Colors.accent,
    fontWeight: FontWeight.semibold,
  },

  // Coming soon card
  comingSoonCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  comingSoonIconRow: {
    width: 48,
    height: 48,
    borderRadius: Radius.full,
    backgroundColor: Colors.primary + '14',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  comingSoonEmoji: { fontSize: 24 },
  comingSoonTitle: { textAlign: 'center' },
  comingSoonBody: {
    textAlign: 'center',
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  comingSoonFeatures: {
    width: '100%',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  featureText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },

  // Rate limit
  rateLimitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.warning + '14',
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.warning + '30',
  },
  rateLimitText: {
    flex: 1,
    color: Colors.warning,
    lineHeight: 18,
  },

  // No live results
  noLiveResults: {
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
  noLiveText: {
    color: Colors.textSecondary,
    textAlign: 'center',
  },

  // Live results list
  liveResultsList: { gap: 0 },

  // Loading skeleton
  skeletonContainer: { gap: Spacing.md },
  skeletonCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  skeletonBody: {
    padding: Spacing.md,
  },
  skeletonLine: {
    height: 12,
    borderRadius: Radius.sm,
    backgroundColor: Colors.chipBackground,
  },
});
