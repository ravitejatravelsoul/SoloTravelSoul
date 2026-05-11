import { useState, useMemo, useCallback, memo } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Text, EmptyState } from '@/components/ui';
import { AddToTripSheet } from '@/components/trips/AddToTripSheet';
import { useSavedPlaces } from '@/hooks/useSavedPlaces';
import { useHaptics } from '@/hooks/useHaptics';
import {
  Colors,
  Gradients,
  Spacing,
  Radius,
  FontSize,
  FontWeight,
  Shadow,
} from '@/constants/theme';
import type { SavedPlace, PlaceEntry, PlaceCategory } from '@solotravelsoul/shared';

// ── Helpers ───────────────────────────────────────────────────────────

function generatePlaceId(): string {
  return `ip-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const CATEGORY_TO_PLACE_CAT: Record<string, PlaceCategory> = {
  Food: 'food',
  Accommodation: 'accommodation',
  Transport: 'transport',
};

function savedToPlaceEntry(p: SavedPlace): PlaceEntry {
  return {
    id: generatePlaceId(),
    attractionId: p.localId ?? p.id,
    name: p.name,
    category: CATEGORY_TO_PLACE_CAT[p.category] ?? 'attraction',
    notes: [p.city, p.state].filter(Boolean).join(', '),
  };
}

const CATEGORY_EMOJI: Record<string, string> = {
  Beach: '🏖️',
  Hiking: '⛰️',
  City: '🏙️',
  Food: '🍜',
  Adventure: '🧗',
  Nightlife: '🌙',
  'Hidden Gem': '💎',
  Solo: '🧳',
  Accommodation: '🏨',
  Transport: '🚆',
  Other: '📍',
};

const CATEGORY_GRADIENT: Record<string, readonly [string, string]> = {
  Beach: Gradients.beach,
  Hiking: Gradients.mountain,
  City: Gradients.city,
  Food: Gradients.food,
  Adventure: Gradients.adventure,
  Nightlife: Gradients.nightlife,
  'Hidden Gem': Gradients.hidden,
  Solo: Gradients.solo,
  Accommodation: Gradients.ocean,
  Transport: ['#9CA3AF', '#6B7280'] as const,
  Other: Gradients.primarySoft,
};

function formatSavedDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Screen ────────────────────────────────────────────────────────────

export default function SavedPlacesScreen() {
  const { savedPlaces, loading, unsavePlace } = useSavedPlaces();
  const haptics = useHaptics();

  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [detailPlace, setDetailPlace] = useState<SavedPlace | null>(null);
  const [addToTripPlace, setAddToTripPlace] = useState<PlaceEntry | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Derive unique categories from saved places
  const categories = useMemo(() => {
    const cats = new Set(savedPlaces.map((p) => p.category));
    return ['All', ...Array.from(cats).sort()];
  }, [savedPlaces]);

  // Reset active category if it no longer exists in data
  const safeCategory = categories.includes(activeCategory) ? activeCategory : 'All';

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return savedPlaces.filter((p) => {
      const matchCat = safeCategory === 'All' || p.category === safeCategory;
      const matchQuery =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.city ?? '').toLowerCase().includes(q) ||
        (p.state ?? '').toLowerCase().includes(q) ||
        (p.description ?? '').toLowerCase().includes(q);
      return matchCat && matchQuery;
    });
  }, [savedPlaces, query, safeCategory]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await new Promise((r) => setTimeout(r, 700));
    setRefreshing(false);
  }, []);

  const handleRemove = useCallback(
    (place: SavedPlace) => {
      haptics.warning();
      Alert.alert(
        'Remove from library',
        `Remove "${place.name}" from your saved places?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => {
              setDetailPlace(null);
              unsavePlace(place.id);
            },
          },
        ]
      );
    },
    [unsavePlace, haptics]
  );

  const handleAddToTrip = useCallback((place: SavedPlace) => {
    haptics.medium();
    setDetailPlace(null);
    setAddToTripPlace(savedToPlaceEntry(place));
  }, [haptics]);

  const renderCard = useCallback(
    ({ item }: { item: SavedPlace }) => (
      <SavedPlaceCard
        place={item}
        onPress={() => setDetailPlace(item)}
        onAddToTrip={() => handleAddToTrip(item)}
        onRemove={() => handleRemove(item)}
      />
    ),
    [handleAddToTrip, handleRemove]
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text variant="h3">My Library</Text>
          {savedPlaces.length > 0 && (
            <Text variant="caption" style={styles.headerSub}>
              {savedPlaces.length} saved place{savedPlaces.length !== 1 ? 's' : ''}
            </Text>
          )}
        </View>
        <View style={styles.heartBadge}>
          <Ionicons name="heart" size={16} color={Colors.error} />
        </View>
      </View>

      {/* ── Search bar ── */}
      <View style={styles.searchWrap}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={16} color={Colors.placeholder} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name, city, state…"
            placeholderTextColor={Colors.placeholder}
            style={styles.searchInput}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <Ionicons name="close-circle" size={16} color={Colors.placeholder} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Category filter chips ── */}
      {categories.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {categories.map((cat) => {
            const active = safeCategory === cat;
            return (
              <TouchableOpacity
                key={cat}
                onPress={() => { haptics.selection(); setActiveCategory(cat); }}
                activeOpacity={0.7}
                style={[styles.filterChip, active && styles.filterChipActive]}
              >
                {cat !== 'All' && (
                  <Text style={styles.filterChipEmoji}>
                    {CATEGORY_EMOJI[cat] ?? '📍'}
                  </Text>
                )}
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                  {cat}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* ── List ── */}
      {savedPlaces.length === 0 && !loading ? (
        <EmptyState
          emoji="🤍"
          title="Your library is empty"
          subtitle="Save places from Discover to build your personal travel wishlist."
          actionLabel="Go to Discover"
          onAction={() => router.push('/(app)/discover')}
        />
      ) : filtered.length === 0 ? (
        <View style={styles.noResults}>
          <Text style={styles.noResultsEmoji}>🔍</Text>
          <Text variant="h3" center>No matches</Text>
          <Text variant="caption" center style={styles.noResultsSub}>
            {query ? `Nothing matches "${query}"` : `No ${safeCategory} places saved yet`}
          </Text>
          <TouchableOpacity
            style={styles.clearBtn}
            onPress={() => { setQuery(''); setActiveCategory('All'); }}
          >
            <Text style={styles.clearBtnText}>Clear filters</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(p) => p.id}
          renderItem={renderCard}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          initialNumToRender={10}
          maxToRenderPerBatch={6}
          removeClippedSubviews
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={Colors.primary}
            />
          }
        />
      )}

      {/* ── Detail Modal ── */}
      <PlaceDetailModal
        place={detailPlace}
        onClose={() => setDetailPlace(null)}
        onAddToTrip={handleAddToTrip}
        onRemove={handleRemove}
      />

      {/* ── Add to Trip Sheet ── */}
      <AddToTripSheet
        visible={addToTripPlace !== null}
        place={addToTripPlace}
        onClose={() => setAddToTripPlace(null)}
      />

    </SafeAreaView>
  );
}

// ── SavedPlaceCard ────────────────────────────────────────────────────

const SavedPlaceCard = memo(function SavedPlaceCard({
  place,
  onPress,
  onAddToTrip,
  onRemove,
}: {
  place: SavedPlace;
  onPress: () => void;
  onAddToTrip: () => void;
  onRemove: () => void;
}) {
  const gradient = CATEGORY_GRADIENT[place.category] ?? Gradients.primarySoft;
  const emoji = CATEGORY_EMOJI[place.category] ?? '📍';
  const location = [place.city, place.state].filter(Boolean).join(', ');

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.82}
    >
      {/* Gradient accent */}
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.cardAccent}
      >
        <Text style={styles.cardEmoji}>{emoji}</Text>
      </LinearGradient>

      {/* Body */}
      <View style={styles.cardBody}>
        <View style={styles.cardTopRow}>
          <Text style={styles.cardName} numberOfLines={1}>{place.name}</Text>
          <TouchableOpacity
            onPress={onRemove}
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          >
            <Ionicons name="heart" size={18} color={Colors.error} />
          </TouchableOpacity>
        </View>

        {location ? (
          <Text style={styles.cardLocation} numberOfLines={1}>{location}</Text>
        ) : null}

        <View style={styles.cardFooterRow}>
          <View style={styles.categoryChip}>
            <Text style={styles.categoryChipText}>{place.category}</Text>
          </View>
          <TouchableOpacity style={styles.addTripBtn} onPress={onAddToTrip} activeOpacity={0.7}>
            <Ionicons name="add-circle-outline" size={12} color={Colors.primary} />
            <Text style={styles.addTripBtnText}>Add to trip</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.savedDate}>
          Saved {formatSavedDate(place.savedAt)}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

// ── PlaceDetailModal ──────────────────────────────────────────────────

function PlaceDetailModal({
  place,
  onClose,
  onAddToTrip,
  onRemove,
}: {
  place: SavedPlace | null;
  onClose: () => void;
  onAddToTrip: (p: SavedPlace) => void;
  onRemove: (p: SavedPlace) => void;
}) {
  if (!place) return null;

  const gradient = CATEGORY_GRADIENT[place.category] ?? Gradients.primarySoft;
  const emoji = CATEGORY_EMOJI[place.category] ?? '📍';
  const location = [place.city, place.state].filter(Boolean).join(', ');

  return (
    <Modal
      visible={place !== null}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.detailSheet}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Drag handle */}
        <View style={styles.dragHandle} />

        {/* Gradient hero */}
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.detailHero}
        >
          <View style={styles.detailHeroDecCircle} />
          <Text style={styles.detailHeroEmoji}>{emoji}</Text>
          <Text style={styles.detailHeroName} numberOfLines={2}>{place.name}</Text>
          {location ? (
            <View style={styles.detailLocationRow}>
              <Ionicons name="location-outline" size={12} color="rgba(255,255,255,0.75)" />
              <Text style={styles.detailLocationText}>{location}</Text>
            </View>
          ) : null}
          <TouchableOpacity style={styles.detailCloseBtn} onPress={onClose}>
            <Ionicons name="close" size={16} color={Colors.white} />
          </TouchableOpacity>
        </LinearGradient>

        <ScrollView
          contentContainerStyle={styles.detailContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Category + saved date chips */}
          <View style={styles.detailMetaRow}>
            <View style={styles.categoryChip}>
              <Text style={styles.categoryChipText}>{emoji} {place.category}</Text>
            </View>
            <View style={styles.detailDateChip}>
              <Ionicons name="time-outline" size={11} color={Colors.textSecondary} />
              <Text style={styles.detailDateText}>Saved {formatSavedDate(place.savedAt)}</Text>
            </View>
          </View>

          {/* Description */}
          {place.description ? (
            <View style={styles.detailSection}>
              <Text style={styles.detailSectionLabel}>ABOUT</Text>
              <Text style={styles.detailDescription}>{place.description}</Text>
            </View>
          ) : null}

          {/* Notes */}
          {place.notes ? (
            <View style={styles.detailSection}>
              <Text style={styles.detailSectionLabel}>NOTES</Text>
              <Text style={styles.detailDescription}>{place.notes}</Text>
            </View>
          ) : null}

          {/* Discover link */}
          <TouchableOpacity
            style={styles.discoverLink}
            onPress={() => { onClose(); router.push('/(app)/discover'); }}
            activeOpacity={0.7}
          >
            <Ionicons name="compass-outline" size={16} color={Colors.primary} />
            <Text style={styles.discoverLinkText}>Explore more {place.category} places</Text>
            <Ionicons name="chevron-forward" size={14} color={Colors.primary} />
          </TouchableOpacity>

          {/* Action buttons */}
          <View style={styles.detailActions}>
            <TouchableOpacity
              style={styles.detailAddBtn}
              onPress={() => onAddToTrip(place)}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={Gradients.primary}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.detailAddBtnGradient}
              >
                <Ionicons name="add-circle-outline" size={18} color={Colors.white} />
                <Text style={styles.detailAddBtnText}>Add to Trip</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.detailRemoveBtn}
              onPress={() => onRemove(place)}
              activeOpacity={0.85}
            >
              <Ionicons name="heart-dislike-outline" size={16} color={Colors.error} />
              <Text style={styles.detailRemoveBtnText}>Remove from Library</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  // ── Header ────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.md,
  },
  headerCenter: { flex: 1 },
  headerSub: { color: Colors.textSecondary, marginTop: 1 },
  heartBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.error + '12',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Search ────────────────────────────────────────────────────────
  searchWrap: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.searchBackground,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    minHeight: 44,
    gap: Spacing.xs,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    paddingVertical: Spacing.sm,
  },

  // ── Category chips ────────────────────────────────────────────────
  chipRow: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterChipEmoji: { fontSize: 13 },
  filterChipText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  filterChipTextActive: { color: Colors.white, fontWeight: FontWeight.semibold },

  // ── List ──────────────────────────────────────────────────────────
  list: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing['4xl'], gap: Spacing.md },

  // ── No results ────────────────────────────────────────────────────
  noResults: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing['2xl'],
  },
  noResultsEmoji: { fontSize: 44, lineHeight: 54 },
  noResultsSub: { color: Colors.placeholder, lineHeight: 20 },
  clearBtn: {
    marginTop: Spacing.sm,
    backgroundColor: Colors.primary + '14',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: Radius.full,
  },
  clearBtnText: {
    color: Colors.primary,
    fontWeight: FontWeight.semibold,
    fontSize: FontSize.sm,
  },

  // ── Place card ────────────────────────────────────────────────────
  // NOTE: no alignItems — lets cardAccent stretch to full height
  card: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.md,
  },
  cardAccent: {
    width: 52,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardEmoji: { fontSize: 22 },
  cardBody: {
    flex: 1,
    padding: Spacing.md,
    gap: 5,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  cardName: {
    flex: 1,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  cardLocation: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  cardFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  categoryChip: {
    backgroundColor: Colors.chipBackground,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  categoryChipText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    color: Colors.textSecondary,
  },
  addTripBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.primary + '14',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  addTripBtnText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.primary,
  },
  savedDate: {
    fontSize: FontSize.xs,
    color: Colors.placeholder,
  },

  // ── Detail modal ──────────────────────────────────────────────────
  detailSheet: { flex: 1, backgroundColor: Colors.surface },
  dragHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  detailHero: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing['2xl'],
    gap: Spacing.xs,
    overflow: 'hidden',
    position: 'relative',
  },
  detailHeroDecCircle: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.08)',
    top: -60,
    right: -40,
  },
  detailCloseBtn: {
    position: 'absolute',
    top: Spacing.md,
    right: Spacing.md,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailHeroEmoji: { fontSize: 36, lineHeight: 46 },
  detailHeroName: {
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.extrabold,
    color: Colors.white,
    lineHeight: 30,
  },
  detailLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  detailLocationText: {
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.75)',
  },

  detailContent: {
    padding: Spacing.lg,
    gap: Spacing.lg,
    paddingBottom: Spacing['4xl'],
  },
  detailMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  detailDateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.chipBackground,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  detailDateText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },

  detailSection: { gap: Spacing.xs },
  detailSectionLabel: {
    fontSize: 11,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
    letterSpacing: 0.7,
  },
  detailDescription: {
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    lineHeight: 24,
  },

  discoverLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary + '0C',
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.primary + '25',
  },
  discoverLinkText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: FontWeight.medium,
  },

  detailActions: { gap: Spacing.md },
  detailAddBtn: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    ...Shadow.md,
  },
  detailAddBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: 14,
    borderRadius: Radius.lg,
  },
  detailAddBtnText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.white,
  },
  detailRemoveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.error + '35',
    backgroundColor: Colors.error + '08',
  },
  detailRemoveBtnText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.error,
  },
});
