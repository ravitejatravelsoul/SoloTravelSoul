import { useState, memo, useCallback } from 'react';
import { View, FlatList, StyleSheet, TouchableOpacity, Alert, Image } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen, Text, EmptyState } from '@/components/ui';
import { JournalEntryModal, type JournalDraft } from '@/components/journal/JournalEntryModal';
import { useTripStore } from '@/stores/tripStore';
import { useJournal } from '@/hooks/useJournal';
import { formatDayLabel, formatTime } from '@/utils/dateUtils';
import { Colors, Gradients, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/constants/theme';
import type { JournalEntry, ItineraryDay } from '@solotravelsoul/shared';

// ── Helpers ───────────────────────────────────────────────────────────

function groupByDay(
  itinerary: ItineraryDay[]
): Array<{ day: ItineraryDay; entries: JournalEntry[] }> {
  return itinerary
    .filter((d) => d.journalEntries.length > 0)
    .map((day) => ({ day, entries: day.journalEntries }));
}

const MOOD_EMOJI: Record<string, string> = {
  amazing: '🤩',
  good: '😊',
  okay: '😐',
  tired: '😴',
  challenging: '😤',
};

const MOOD_COLOR: Record<string, string> = {
  amazing: '#F59E0B',
  good: '#10B981',
  okay: '#6B7280',
  tired: '#8B5CF6',
  challenging: '#EF4444',
};

// ── Screen ────────────────────────────────────────────────────────────

export default function JournalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const trip = useTripStore((s) => s.trips.find((t) => t.id === id));
  const itinerary = useTripStore((s) => s.itinerary);
  const { editEntry, deleteEntry } = useJournal(id);

  const grouped = groupByDay(itinerary);
  const totalEntries = itinerary.reduce((n, d) => n + d.journalEntries.length, 0);

  return (
    <Screen padded={false}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: Spacing.md }}>
          <Text variant="h3" numberOfLines={1}>{trip?.destination ?? 'Journal'}</Text>
          {totalEntries > 0 && (
            <Text variant="caption" style={styles.headerSub}>
              {totalEntries} memor{totalEntries === 1 ? 'y' : 'ies'} recorded
            </Text>
          )}
        </View>
        {totalEntries > 0 && (
          <View style={styles.journalBadge}>
            <Ionicons name="book" size={14} color={Colors.primary} />
          </View>
        )}
      </View>

      {grouped.length === 0 ? (
        <EmptyState
          emoji="📖"
          title="Your story starts here"
          subtitle="Open a day in your itinerary to write your first memory. Every great trip deserves to be remembered."
        />
      ) : (
        <FlatList
          data={grouped}
          keyExtractor={(g) => g.day.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          initialNumToRender={5}
          maxToRenderPerBatch={4}
          renderItem={({ item, index }) => (
            <DaySection
              day={item.day}
              entries={item.entries}
              isLast={index === grouped.length - 1}
              editEntry={editEntry}
              deleteEntry={deleteEntry}
            />
          )}
        />
      )}
    </Screen>
  );
}

// ── DaySection ───────────────────────────────────────────────────────

type EditEntryFn = (dayId: string, entryId: string, updates: Partial<JournalEntry>) => Promise<void>;
type DeleteEntryFn = (dayId: string, entryId: string) => Promise<void>;

const DaySection = memo(function DaySection({
  day,
  entries,
  isLast,
  editEntry,
  deleteEntry,
}: {
  day: ItineraryDay;
  entries: JournalEntry[];
  isLast: boolean;
  editEntry: EditEntryFn;
  deleteEntry: DeleteEntryFn;
}) {
  const [editingEntry, setEditingEntry] = useState<JournalEntry | null>(null);

  const handleSaveEdit = useCallback(
    async (draft: JournalDraft) => {
      if (!editingEntry) return;
      await editEntry(day.id, editingEntry.id, {
        text: draft.text,
        title: draft.title,
        mood: draft.mood,
        placeId: draft.placeId,
        placeName: draft.placeName,
        updatedAt: new Date(),
      });
    },
    [editingEntry, editEntry, day.id]
  );

  const handleDelete = useCallback(
    (entryId: string) => {
      Alert.alert('Delete memory', 'Delete this memory? This cannot be undone.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteEntry(day.id, entryId),
        },
      ]);
    },
    [deleteEntry, day.id]
  );

  return (
    <View style={styles.daySection}>
      {/* ── Timeline column ── */}
      <View style={styles.timelineCol}>
        <LinearGradient colors={Gradients.primary} style={styles.timelineDot} />
        {!isLast && <View style={styles.timelineLine} />}
      </View>

      <View style={styles.dayContent}>
        {/* Day label */}
        <View style={styles.dayLabelRow}>
          <Text variant="label" style={styles.dayLabel}>{formatDayLabel(day.date)}</Text>
          <Text variant="caption" style={styles.entryCount}>
            {entries.length} entr{entries.length !== 1 ? 'ies' : 'y'}
          </Text>
        </View>

        {/* Entry cards */}
        {entries.map((entry) => (
          <MemoryCard
            key={entry.id}
            entry={entry}
            onEdit={setEditingEntry}
            onDelete={handleDelete}
          />
        ))}
      </View>

      {/* Edit modal lives in DaySection so it survives FlatList virtualization */}
      <JournalEntryModal
        visible={editingEntry !== null}
        places={day.places}
        initialEntry={editingEntry ?? undefined}
        onSave={handleSaveEdit}
        onClose={() => setEditingEntry(null)}
      />
    </View>
  );
});

// ── MemoryCard ───────────────────────────────────────────────────────

const COLLAPSED_LINES = 5;

const MemoryCard = memo(function MemoryCard({
  entry,
  onEdit,
  onDelete,
}: {
  entry: JournalEntry;
  onEdit: (entry: JournalEntry) => void;
  onDelete: (entryId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isLong = entry.text.length > 280;
  const toggle = useCallback(() => setExpanded((v) => !v), []);

  const moodColor = entry.mood ? MOOD_COLOR[entry.mood] : undefined;

  return (
    <View style={styles.memoryCard}>
      {/* Photo frame */}
      {entry.photoURL ? (
        <View style={styles.photoFrame}>
          <Image source={{ uri: entry.photoURL }} style={styles.photo} resizeMode="cover" />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.35)']}
            style={styles.photoOverlay}
          />
        </View>
      ) : null}

      <View style={styles.memoryBody}>

        {/* ── Mood + title row ── */}
        {(entry.mood || entry.title) && (
          <View style={styles.cardTopRow}>
            {entry.mood && (
              <View style={[styles.moodBadge, { backgroundColor: (moodColor ?? Colors.primary) + '18' }]}>
                <Text style={styles.moodEmoji}>{MOOD_EMOJI[entry.mood]}</Text>
                <Text style={[styles.moodLabel, { color: moodColor ?? Colors.primary }]}>
                  {entry.mood.charAt(0).toUpperCase() + entry.mood.slice(1)}
                </Text>
              </View>
            )}
            {entry.title && (
              <Text style={styles.entryTitle} numberOfLines={2}>{entry.title}</Text>
            )}
          </View>
        )}

        {/* ── Quote decoration + body text ── */}
        <Text style={styles.quoteMark}>"</Text>
        <Text
          variant="body"
          style={styles.entryText}
          numberOfLines={expanded ? undefined : COLLAPSED_LINES}
        >
          {entry.text}
        </Text>

        {/* ── Place chip ── */}
        {entry.placeName && (
          <View style={styles.placeChip}>
            <Ionicons name="location-outline" size={11} color={Colors.primary} />
            <Text style={styles.placeChipText}>{entry.placeName}</Text>
          </View>
        )}

        {/* ── Footer ── */}
        <View style={styles.entryFooter}>
          <View style={styles.timeRow}>
            <Ionicons name="time-outline" size={12} color={Colors.placeholder} />
            <Text variant="caption" style={styles.entryTime}>
              {formatTime(entry.createdAt)}
            </Text>
          </View>
          <View style={styles.footerActions}>
            {isLong && (
              <TouchableOpacity onPress={toggle} hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}>
                <Text style={styles.readMore}>{expanded ? 'Show less' : 'Read more'}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => onEdit(entry)}
              hitSlop={{ top: 8, right: 6, bottom: 8, left: 6 }}
            >
              <Ionicons name="pencil-outline" size={15} color={Colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => onDelete(entry.id)}
              hitSlop={{ top: 8, right: 6, bottom: 8, left: 6 }}
            >
              <Ionicons name="trash-outline" size={15} color={Colors.error + 'AA'} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
});

// ── Styles ────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    paddingTop: Spacing['2xl'],
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerSub: { color: Colors.textSecondary, marginTop: 1 },
  journalBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.primary + '12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: { padding: Spacing.lg, paddingBottom: Spacing['4xl'] },

  // ── Timeline ──────────────────────────────────────────────────────
  daySection: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing['2xl'] },
  timelineCol: { alignItems: 'center', width: 18, paddingTop: 4 },
  timelineDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: Colors.background,
    ...Shadow.sm,
  },
  timelineLine: {
    flex: 1,
    width: 2,
    backgroundColor: Colors.borderLight,
    marginTop: Spacing.sm,
    borderRadius: 1,
  },

  // ── Day header ────────────────────────────────────────────────────
  dayContent: { flex: 1, gap: Spacing.md },
  dayLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dayLabel: { color: Colors.primary },
  entryCount: { color: Colors.placeholder },

  // ── Memory card ───────────────────────────────────────────────────
  memoryCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.md,
  },
  photoFrame: { height: 160, position: 'relative' },
  photo: { width: '100%', height: '100%' },
  photoOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 60 },

  memoryBody: { padding: Spacing.md, paddingTop: Spacing.sm, gap: Spacing.sm },

  // Mood + title
  cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  moodBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  moodEmoji: { fontSize: 14 },
  moodLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold },
  entryTitle: {
    flex: 1,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    lineHeight: 22,
  },

  // Body
  quoteMark: {
    fontSize: FontSize['5xl'],
    color: Colors.primary + '20',
    fontWeight: FontWeight.extrabold,
    lineHeight: 40,
    marginBottom: -Spacing.md,
  },
  entryText: { lineHeight: 24, color: Colors.textPrimary, fontStyle: 'italic' },

  // Place chip
  placeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: Colors.primary + '12',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  placeChipText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.medium },

  // Footer
  entryFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    paddingTop: Spacing.sm,
    marginTop: Spacing.xs,
  },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  entryTime: { color: Colors.placeholder },
  footerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  readMore: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: FontWeight.medium },
});
