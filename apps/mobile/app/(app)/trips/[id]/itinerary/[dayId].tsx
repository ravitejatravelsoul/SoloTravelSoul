import { useState, useMemo } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Alert,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Text, Button, Input, Chip, Divider } from '@/components/ui';
import { JournalEntryModal, type JournalDraft } from '@/components/journal/JournalEntryModal';
import { useTripStore } from '@/stores/tripStore';
import { useItinerary } from '@/hooks/useItinerary';
import { useJournal } from '@/hooks/useJournal';
import { useSavedPlaces } from '@/hooks/useSavedPlaces';
import { formatDayLabel } from '@/utils/dateUtils';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/constants/theme';
import type { PlaceCategory, BundledAttraction, JournalEntry } from '@solotravelsoul/shared';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const allAttractions: BundledAttraction[] = require('@/assets/attractions.json');

const CATEGORIES: PlaceCategory[] = ['food', 'attraction', 'accommodation', 'transport', 'other'];

const CATEGORY_COLOR: Record<PlaceCategory, string> = {
  food: Colors.catFood,
  attraction: Colors.catCity,
  accommodation: Colors.catSolo,
  transport: Colors.textSecondary,
  other: Colors.catHidden,
};

const CATEGORY_ICON: Record<PlaceCategory, string> = {
  food: 'restaurant-outline',
  attraction: 'telescope-outline',
  accommodation: 'bed-outline',
  transport: 'car-outline',
  other: 'ellipsis-horizontal-outline',
};

const ATTRACTION_CATEGORY_MAP: Record<string, PlaceCategory> = { Food: 'food' };

function generatePlaceId(): string {
  return `ip-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const MOOD_EMOJI: Record<string, string> = {
  amazing: '🤩',
  good: '😊',
  okay: '😐',
  tired: '😴',
  challenging: '😤',
};

type AddTab = 'custom' | 'browse';

export default function DayDetailScreen() {
  const { id: tripId, dayId } = useLocalSearchParams<{ id: string; dayId: string }>();
  const day = useTripStore((s) => s.itinerary.find((d) => d.id === dayId));
  const { addPlace, removePlace } = useItinerary(tripId);
  const { addEntry, editEntry, deleteEntry } = useJournal(tripId);
  const { savedPlaces } = useSavedPlaces();

  const [showAddPlace, setShowAddPlace] = useState(false);
  const [showAddJournal, setShowAddJournal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<JournalEntry | null>(null);
  const [addTab, setAddTab] = useState<AddTab>('custom');

  const [placeName, setPlaceName] = useState('');
  const [placeCategory, setPlaceCategory] = useState<PlaceCategory>('attraction');
  const [placeNotes, setPlaceNotes] = useState('');
  const [browseQuery, setBrowseQuery] = useState('');

  const filteredAttractions = useMemo(() => {
    const q = browseQuery.trim().toLowerCase();
    if (!q) return allAttractions.slice(0, 20);
    return allAttractions
      .filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          (a.city ?? '').toLowerCase().includes(q) ||
          a.state.toLowerCase().includes(q)
      )
      .slice(0, 20);
  }, [browseQuery]);

  const filteredSavedPlaces = useMemo(() => {
    const q = browseQuery.trim().toLowerCase();
    if (!q) return savedPlaces;
    return savedPlaces.filter((p) => p.name.toLowerCase().includes(q));
  }, [savedPlaces, browseQuery]);

  if (!day) {
    return (
      <Screen padded>
        <Text variant="caption" center>Day not found.</Text>
      </Screen>
    );
  }

  const handleAddCustomPlace = async () => {
    if (!placeName.trim()) return;
    await addPlace(dayId, {
      id: generatePlaceId(),
      name: placeName.trim(),
      category: placeCategory,
      notes: placeNotes.trim(),
    });
    setPlaceName('');
    setPlaceNotes('');
    setPlaceCategory('attraction');
    setShowAddPlace(false);
  };

  const handleAddBrowseAttraction = async (attraction: BundledAttraction) => {
    await addPlace(dayId, {
      id: generatePlaceId(),
      attractionId: attraction.id,
      name: attraction.name,
      category: ATTRACTION_CATEGORY_MAP[attraction.type] ?? 'attraction',
      notes: [attraction.city, attraction.state].filter(Boolean).join(', '),
    });
    setShowAddPlace(false);
  };

  const handleAddSavedPlace = async (name: string, category: string, savedId: string) => {
    await addPlace(dayId, {
      id: generatePlaceId(),
      attractionId: savedId,
      name,
      category: (CATEGORIES.includes(category as PlaceCategory) ? category : 'attraction') as PlaceCategory,
      notes: '',
    });
    setShowAddPlace(false);
  };

  const handleRemovePlace = (placeId: string) => {
    Alert.alert('Remove place', 'Remove this place from your itinerary?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removePlace(dayId, placeId) },
    ]);
  };

  const handleAddJournal = async (draft: JournalDraft) => {
    await addEntry(dayId, {
      id: `je-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      text: draft.text,
      ...(draft.title && { title: draft.title }),
      ...(draft.mood && { mood: draft.mood }),
      ...(draft.placeId && { placeId: draft.placeId }),
      ...(draft.placeName && { placeName: draft.placeName }),
      photoURL: null,
      createdAt: new Date(),
    });
  };

  const handleEditJournal = async (draft: JournalDraft) => {
    if (!editingEntry) return;
    await editEntry(dayId, editingEntry.id, {
      text: draft.text,
      title: draft.title,
      mood: draft.mood,
      placeId: draft.placeId,
      placeName: draft.placeName,
      updatedAt: new Date(),
    });
  };

  const handleDeleteJournal = (entryId: string) => {
    Alert.alert('Delete entry', 'Delete this journal entry? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteEntry(dayId, entryId) },
    ]);
  };

  const openAddPlace = () => {
    setAddTab('custom');
    setBrowseQuery('');
    setShowAddPlace(true);
  };

  return (
    <Screen scroll padded={false}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text variant="h3" numberOfLines={1} style={{ flex: 1, textAlign: 'center' }}>
          {formatDayLabel(day.date)}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.content}>

        {/* ── Places section ── */}
        <View style={styles.sectionHeader}>
          <Text variant="label">Places</Text>
          <TouchableOpacity
            onPress={openAddPlace}
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          >
            <Ionicons name="add-circle-outline" size={22} color={Colors.primary} />
          </TouchableOpacity>
        </View>

        {day.places.length === 0 ? (
          <TouchableOpacity style={styles.emptyCard} onPress={openAddPlace} activeOpacity={0.7}>
            <Ionicons name="location-outline" size={22} color={Colors.placeholder} />
            <Text style={styles.emptyCardText}>No places yet — tap to add one</Text>
          </TouchableOpacity>
        ) : (
          day.places.map((p, index) => (
            // Use index suffix so legacy entries with duplicate attraction ids don't warn.
            // New entries generated by generatePlaceId() are already unique.
            <View key={`${p.id}-${index}`} style={styles.placeCard}>
              <View
                style={[styles.placeAccent, { backgroundColor: CATEGORY_COLOR[p.category] + '22' }]}
              >
                <Ionicons
                  name={CATEGORY_ICON[p.category] as never}
                  size={18}
                  color={CATEGORY_COLOR[p.category]}
                />
              </View>
              <View style={styles.placeBody}>
                <Text style={styles.placeName} numberOfLines={1}>{p.name}</Text>
                {p.notes ? (
                  <Text style={styles.placeNotes} numberOfLines={2}>{p.notes}</Text>
                ) : null}
                <View style={styles.placeChip}>
                  <Text style={[styles.placeChipText, { color: CATEGORY_COLOR[p.category] }]}>
                    {p.category}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.placeDeleteBtn}
                onPress={() => handleRemovePlace(p.id)}
                hitSlop={{ top: 8, right: 4, bottom: 8, left: 8 }}
              >
                <Ionicons name="trash-outline" size={18} color={Colors.error} />
              </TouchableOpacity>
            </View>
          ))
        )}

        <Divider style={styles.divider} />

        {/* ── Journal section ── */}
        <View style={styles.sectionHeader}>
          <Text variant="label">Journal</Text>
          <TouchableOpacity
            onPress={() => setShowAddJournal(true)}
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          >
            <Ionicons name="add-circle-outline" size={22} color={Colors.primary} />
          </TouchableOpacity>
        </View>

        {day.journalEntries.length === 0 ? (
          <TouchableOpacity
            style={styles.emptyCard}
            onPress={() => setShowAddJournal(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="pencil-outline" size={22} color={Colors.placeholder} />
            <Text style={styles.emptyCardText}>No entries yet — tap to write</Text>
          </TouchableOpacity>
        ) : (
          day.journalEntries.map((j) => (
            <View key={j.id} style={styles.journalCard}>
              {/* Mood + title row */}
              {(j.mood || j.title) && (
                <View style={styles.journalTopRow}>
                  {j.mood && <Text style={styles.journalMoodEmoji}>{MOOD_EMOJI[j.mood]}</Text>}
                  {j.title && (
                    <Text style={styles.journalTitle} numberOfLines={1}>{j.title}</Text>
                  )}
                </View>
              )}
              <View style={styles.journalRow}>
                <Text variant="body" style={styles.journalText}>{j.text}</Text>
                <View style={styles.journalActions}>
                  <TouchableOpacity
                    onPress={() => setEditingEntry(j)}
                    hitSlop={{ top: 8, right: 4, bottom: 8, left: 8 }}
                  >
                    <Ionicons name="pencil-outline" size={15} color={Colors.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDeleteJournal(j.id)}
                    hitSlop={{ top: 8, right: 4, bottom: 8, left: 8 }}
                  >
                    <Ionicons name="trash-outline" size={15} color={Colors.error + 'AA'} />
                  </TouchableOpacity>
                </View>
              </View>
              {j.placeName && (
                <View style={styles.journalPlaceChip}>
                  <Ionicons name="location-outline" size={11} color={Colors.primary} />
                  <Text style={styles.journalPlaceText}>{j.placeName}</Text>
                </View>
              )}
              <Text style={styles.journalTime}>
                {j.createdAt instanceof Date
                  ? j.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : ''}
              </Text>
            </View>
          ))
        )}
      </View>

      {/* ── Add Place Modal ── */}
      <Modal
        visible={showAddPlace}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAddPlace(false)}
      >
        <SafeAreaView style={styles.modalSheet} edges={['top']}>
          <KeyboardAvoidingView
            style={styles.fill}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            {/* Modal header */}
            <View style={styles.modalHeader}>
              <View style={styles.dragHandle} />
              <View style={styles.modalHeaderRow}>
                <Text style={styles.modalTitle}>Add Place</Text>
                <TouchableOpacity
                  onPress={() => setShowAddPlace(false)}
                  style={styles.modalCloseBtn}
                >
                  <Ionicons name="close" size={18} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {/* Custom | Browse tabs */}
              <View style={styles.tabRow}>
                <TouchableOpacity
                  style={[styles.tabBtn, addTab === 'custom' && styles.tabBtnActive]}
                  onPress={() => setAddTab('custom')}
                >
                  <Ionicons
                    name="create-outline"
                    size={14}
                    color={addTab === 'custom' ? Colors.primary : Colors.textSecondary}
                  />
                  <Text style={[styles.tabLabel, addTab === 'custom' && styles.tabLabelActive]}>
                    Custom
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.tabBtn, addTab === 'browse' && styles.tabBtnActive]}
                  onPress={() => setAddTab('browse')}
                >
                  <Ionicons
                    name="compass-outline"
                    size={14}
                    color={addTab === 'browse' ? Colors.primary : Colors.textSecondary}
                  />
                  <Text style={[styles.tabLabel, addTab === 'browse' && styles.tabLabelActive]}>
                    Browse
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Custom tab */}
            {addTab === 'custom' && (
              <ScrollView
                style={styles.fill}
                contentContainerStyle={styles.customForm}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <Input
                  label="Place name"
                  value={placeName}
                  onChangeText={setPlaceName}
                  placeholder="e.g. Senso-ji Temple"
                  autoFocus
                />
                <Text variant="label">Category</Text>
                <View style={styles.chips}>
                  {CATEGORIES.map((c) => (
                    <Chip
                      key={c}
                      label={c}
                      selected={placeCategory === c}
                      onPress={() => setPlaceCategory(c)}
                    />
                  ))}
                </View>
                <Input
                  label="Notes (optional)"
                  value={placeNotes}
                  onChangeText={setPlaceNotes}
                  multiline
                  placeholder="Anything to remember about this place…"
                />
                <Button
                  label="Add place"
                  onPress={handleAddCustomPlace}
                  fullWidth
                  disabled={!placeName.trim()}
                />
                <Button
                  label="Cancel"
                  variant="ghost"
                  onPress={() => setShowAddPlace(false)}
                  fullWidth
                />
              </ScrollView>
            )}

            {/* Browse tab */}
            {addTab === 'browse' && (
              <View style={styles.fill}>
                {/* Search bar — stays pinned above scroll */}
                <View style={styles.browseSearchWrap}>
                  <Ionicons name="search-outline" size={15} color={Colors.placeholder} />
                  <TextInput
                    value={browseQuery}
                    onChangeText={setBrowseQuery}
                    placeholder="Search places, cities, states…"
                    placeholderTextColor={Colors.placeholder}
                    style={styles.browseInput}
                    autoCorrect={false}
                    autoCapitalize="none"
                    returnKeyType="search"
                  />
                  {browseQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setBrowseQuery('')}>
                      <Ionicons name="close-circle" size={15} color={Colors.placeholder} />
                    </TouchableOpacity>
                  )}
                </View>

                <ScrollView
                  style={styles.fill}
                  contentContainerStyle={styles.browseList}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  {/* Saved places — also filtered by query */}
                  {filteredSavedPlaces.length > 0 && (
                    <View>
                      <View style={styles.browseSectionHeader}>
                        <Ionicons name="heart" size={12} color={Colors.error} />
                        <Text style={styles.browseSectionLabel}>Saved places</Text>
                      </View>
                      {filteredSavedPlaces.map((p) => (
                        <TouchableOpacity
                          key={p.id}
                          style={styles.browseItem}
                          onPress={() => handleAddSavedPlace(p.name, p.category, p.id)}
                          activeOpacity={0.7}
                        >
                          <View style={[styles.browseItemIcon, { backgroundColor: 'rgba(239,68,68,0.08)' }]}>
                            <Ionicons name="heart" size={14} color={Colors.error} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.browseItemName} numberOfLines={1}>{p.name}</Text>
                            <Text style={styles.browseItemSub}>{p.category}</Text>
                          </View>
                          <Ionicons name="add-circle-outline" size={20} color={Colors.primary} />
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  {/* Bundled attractions */}
                  <View>
                    <View style={styles.browseSectionHeader}>
                      <Ionicons name="location" size={12} color={Colors.primary} />
                      <Text style={styles.browseSectionLabel}>
                        {browseQuery ? 'Results' : 'Popular attractions'}
                      </Text>
                    </View>
                    {filteredAttractions.length === 0 ? (
                      <View style={styles.browseEmpty}>
                        <Ionicons name="search-outline" size={28} color={Colors.border} />
                        <Text style={styles.browseEmptyText}>No matches for "{browseQuery}"</Text>
                      </View>
                    ) : (
                      filteredAttractions.map((a) => (
                        <TouchableOpacity
                          key={a.id}
                          style={styles.browseItem}
                          onPress={() => handleAddBrowseAttraction(a)}
                          activeOpacity={0.7}
                        >
                          <View style={[styles.browseItemIcon, { backgroundColor: 'rgba(18,112,194,0.08)' }]}>
                            <Ionicons name="location-outline" size={14} color={Colors.primary} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.browseItemName} numberOfLines={1}>{a.name}</Text>
                            <Text style={styles.browseItemSub} numberOfLines={1}>
                              {[a.city, a.state].filter(Boolean).join(', ')} · {a.type}
                            </Text>
                          </View>
                          <Ionicons name="add-circle-outline" size={20} color={Colors.primary} />
                        </TouchableOpacity>
                      ))
                    )}
                  </View>
                </ScrollView>
              </View>
            )}
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* ── Add Journal Modal ── */}
      <JournalEntryModal
        visible={showAddJournal}
        places={day.places}
        onSave={handleAddJournal}
        onClose={() => setShowAddJournal(false)}
      />

      {/* ── Edit Journal Modal ── */}
      <JournalEntryModal
        visible={editingEntry !== null}
        places={day.places}
        initialEntry={editingEntry ?? undefined}
        onSave={handleEditJournal}
        onClose={() => setEditingEntry(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    paddingTop: Spacing['2xl'],
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  content: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing['4xl'] },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

  // ── Empty state cards ────────────────────────────────────────────────
  emptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    padding: Spacing.lg,
  },
  emptyCardText: {
    fontSize: FontSize.sm,
    color: Colors.placeholder,
    fontStyle: 'italic',
  },

  // ── Place cards ──────────────────────────────────────────────────────
  // NOTE: no alignItems — lets placeAccent use alignSelf: 'stretch'
  placeCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  placeAccent: {
    width: 48,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeBody: {
    flex: 1,
    paddingVertical: Spacing.md,
    paddingLeft: Spacing.sm,
    gap: 4,
    justifyContent: 'center',
  },
  placeName: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  placeNotes: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  placeChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    backgroundColor: Colors.chipBackground,
    borderRadius: Radius.full,
    marginTop: 2,
  },
  placeChipText: { fontSize: FontSize.xs, fontWeight: FontWeight.medium },
  placeDeleteBtn: {
    alignSelf: 'center',
    padding: Spacing.md,
  },

  // ── Journal cards ────────────────────────────────────────────────────
  journalCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.xs,
    ...Shadow.sm,
  },
  journalTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  journalMoodEmoji: { fontSize: 16 },
  journalTitle: {
    flex: 1,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  journalRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  journalText: { flex: 1, lineHeight: 22, color: Colors.textPrimary },
  journalActions: { flexDirection: 'row', gap: Spacing.sm, paddingTop: 2 },
  journalPlaceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: Colors.primary + '12',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  journalPlaceText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.medium },
  journalTime: { fontSize: FontSize.xs, color: Colors.placeholder },

  divider: { marginVertical: Spacing.xl },

  // ── Add Place Modal ──────────────────────────────────────────────────
  modalSheet: { flex: 1, backgroundColor: Colors.background },
  fill: { flex: 1 },
  modalHeader: {
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginTop: Spacing.md,
    marginBottom: Spacing.md,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  modalTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  modalCloseBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Custom/Browse tab switcher
  tabRow: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    padding: 3,
    marginBottom: Spacing.sm,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.sm,
  },
  tabBtnActive: { backgroundColor: Colors.surface, ...Shadow.sm },
  tabLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
  },
  tabLabelActive: { color: Colors.primary },

  // Custom tab form
  customForm: { gap: Spacing.lg, padding: Spacing.lg, paddingBottom: Spacing['4xl'] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },

  // Browse tab
  browseSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.searchBackground,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    margin: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  browseInput: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    paddingVertical: 2,
  },
  browseList: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing['4xl'],
    gap: Spacing.sm,
  },
  browseSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
    marginTop: Spacing.md,
  },
  browseSectionLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  browseItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.sm,
  },
  browseItemIcon: {
    width: 32,
    height: 32,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  browseItemName: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  browseItemSub: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  browseEmpty: {
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing['2xl'],
  },
  browseEmptyText: {
    fontSize: FontSize.sm,
    color: Colors.placeholder,
    fontStyle: 'italic',
    textAlign: 'center',
  },

});
