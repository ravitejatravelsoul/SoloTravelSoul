import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Text, ProgressBar, SyncStatusBar } from '@/components/ui';
import { useTripStore } from '@/stores/tripStore';
import { useShallow } from 'zustand/react/shallow';
import { useTrips } from '@/hooks/useTrips';
import { useChecklist } from '@/hooks/useChecklist';
import { useAuthStore } from '@/stores/authStore';
import { useNetworkState } from '@/hooks/useNetworkState';
import { useSyncEngine } from '@/hooks/useSyncEngine';
import {
  formatDateRange,
  tripDurationDays,
  tripStatus,
  daysUntil,
  tripCurrentDay,
} from '@/utils/dateUtils';
import {
  Colors,
  Gradients,
  Spacing,
  Radius,
  FontSize,
  FontWeight,
  Shadow,
} from '@/constants/theme';
import { usePackingSuggestions } from '@/hooks/usePackingSuggestions';
import { ExportPreviewModal } from '@/components/trips/ExportPreviewModal';
import { TripRemindersCard } from '@/components/trips/TripRemindersCard';
import { cancelAllTripNotifications } from '@/services/notificationService';

const STATUS_GRADIENT: Record<string, readonly [string, string]> = {
  active: Gradients.heroActive,
  upcoming: Gradients.hero,
  past: ['#6B7280', '#374151'],
};

const STATUS_LABEL: Record<string, string> = {
  active: 'Currently Active',
  upcoming: 'Upcoming',
  past: 'Completed',
};

const STATUS_ICON: Record<string, string> = {
  active: 'airplane',
  upcoming: 'calendar-outline',
  past: 'checkmark-circle-outline',
};

export default function TripDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const trip = useTripStore((s) => s.trips.find((t) => t.id === id));
  const { itinerary, currentItineraryTripId } = useTripStore(
    useShallow((s) => ({
      itinerary: s.itinerary,
      currentItineraryTripId: s.currentItineraryTripId,
    }))
  );
  const { deleteTrip } = useTrips();
  const { checklist, loading: checklistLoading, load: loadChecklist, toggleItem, addItem, deleteItem } =
    useChecklist(id);

  const uid = useAuthStore((s) => s.user?.uid);
  const { isConnected } = useNetworkState();
  const { pendingCount, lastSyncedAt, syncing, hasFailed, sync } = useSyncEngine(uid);

  const [newItemText, setNewItemText] = useState('');
  const [addingItem, setAddingItem] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const addInputRef = useRef<TextInput>(null);

  useEffect(() => {
    loadChecklist();
  }, [id]);

  const itineraryLoaded = currentItineraryTripId === id;
  const totalPlaces = itineraryLoaded
    ? itinerary.reduce((n, d) => n + d.places.length, 0)
    : null;
  const totalJournal = itineraryLoaded
    ? itinerary.reduce((n, d) => n + d.journalEntries.length, 0)
    : null;

  const checkedCount = checklist.filter((c) => c.checked).length;
  const totalCount = checklist.length;

  const { suggestions, context } = usePackingSuggestions(trip, itinerary, checklist);

  const handleAddAllSuggestions = useCallback(async () => {
    await Promise.all(suggestions.slice(0, 8).map((s) => addItem(s.text)));
  }, [suggestions, addItem]);

  if (!trip) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text variant="caption" center>Trip not found.</Text>
      </SafeAreaView>
    );
  }

  const status = tripStatus(trip.startDate, trip.endDate);
  const gradient = STATUS_GRADIENT[status] ?? Gradients.hero;
  const totalDays = tripDurationDays(trip.startDate, trip.endDate);

  const daysStat =
    status === 'upcoming'
      ? `${daysUntil(trip.startDate)} day${daysUntil(trip.startDate) !== 1 ? 's' : ''} away`
      : status === 'active'
      ? `Day ${tripCurrentDay(trip.startDate)} of ${totalDays}`
      : `${totalDays} day${totalDays !== 1 ? 's' : ''} total`;

  const progress =
    status === 'active'
      ? (tripCurrentDay(trip.startDate) - 1) / Math.max(1, totalDays - 1)
      : 0;

  const handleDelete = () => {
    Alert.alert('Delete trip', `Remove "${trip.destination}" from your trips?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          // Cancel any scheduled notifications before deleting
          if (uid) await cancelAllTripNotifications(uid, trip.id).catch(() => {});
          await deleteTrip(trip.id);
          router.back();
        },
      },
    ]);
  };

  const handleAddItem = useCallback(async () => {
    if (!newItemText.trim()) return;
    setAddingItem(true);
    await addItem(newItemText);
    setNewItemText('');
    setAddingItem(false);
    addInputRef.current?.blur();
  }, [newItemText, addItem]);

  const handleDeleteItem = useCallback((itemId: string) => {
    Alert.alert('Remove item', 'Remove this item from the checklist?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => deleteItem(itemId) },
    ]);
  }, [deleteItem]);

  // Separate checked/unchecked so unchecked items always show first
  const uncheckedItems = checklist.filter((c) => !c.checked);
  const checkedItems = checklist.filter((c) => c.checked);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Gradient hero ── */}
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.decCircle1} />
          <View style={styles.decCircle2} />

          {/* Nav */}
          <View style={styles.heroNav}>
            <TouchableOpacity style={styles.navBtn} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={20} color={Colors.white} />
            </TouchableOpacity>
            <View style={styles.heroNavRight}>
              <TouchableOpacity
                style={styles.navBtn}
                onPress={() => setShowExportModal(true)}
              >
                <Ionicons name="share-outline" size={20} color={Colors.white} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.navBtn}
                onPress={() => router.push(`/(app)/trips/${id}/edit`)}
              >
                <Ionicons name="create-outline" size={20} color={Colors.white} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Status badge */}
          <View style={styles.statusBadge}>
            <Ionicons name={STATUS_ICON[status] as never} size={11} color={Colors.white} />
            <Text style={styles.statusText}>{STATUS_LABEL[status]}</Text>
          </View>

          {/* Destination */}
          <Text style={styles.destination} numberOfLines={2}>
            {trip.destination}
          </Text>
          <Text style={styles.dateRange}>
            {formatDateRange(trip.startDate, trip.endDate)}
          </Text>

          {/* Duration pill */}
          <View style={styles.durationPill}>
            <Ionicons name="calendar-outline" size={12} color={Colors.white} />
            <Text style={styles.durationText}>
              {totalDays} day{totalDays !== 1 ? 's' : ''}
            </Text>
          </View>

          {/* Progress bar — active only */}
          {status === 'active' ? (
            <View style={styles.progressSection}>
              <View style={styles.progressHeader}>
                <Text style={styles.progressLabel}>{daysStat}</Text>
                <Text style={styles.progressPct}>{Math.round(progress * 100)}%</Text>
              </View>
              <ProgressBar
                progress={progress}
                color={Colors.white}
                height={3}
                style={styles.progressTrack}
              />
            </View>
          ) : (
            <Text style={styles.dayStat}>{daysStat}</Text>
          )}
        </LinearGradient>

        {/* ── Body ── */}
        <View style={styles.body}>

          {/* ── Sync status ── */}
          <SyncStatusBar
            pendingCount={pendingCount}
            lastSyncedAt={lastSyncedAt}
            syncing={syncing}
            hasFailed={hasFailed}
            isOffline={!isConnected}
            onRetry={sync}
          />

          {/* ── Stats strip ── */}
          <View style={styles.statsRow}>
            <StatPill
              icon="calendar-outline"
              value={`${totalDays}`}
              label={totalDays === 1 ? 'Day' : 'Days'}
            />
            <View style={styles.statsDivider} />
            {totalCount > 0 ? (
              <StatPill
                icon="checkmark-done-outline"
                value={`${checkedCount}/${totalCount}`}
                label="Packed"
              />
            ) : (
              <StatPill icon="checkmark-done-outline" value="—" label="Packed" />
            )}
            <View style={styles.statsDivider} />
            {totalPlaces !== null ? (
              <StatPill
                icon="location-outline"
                value={`${totalPlaces}`}
                label={totalPlaces === 1 ? 'Place' : 'Places'}
              />
            ) : (
              <StatPill icon="location-outline" value="—" label="Places" />
            )}
          </View>

          {/* ── Quick actions 2×2 ── */}
          <View style={styles.actionsGrid}>
            <ActionTile
              gradient={Gradients.primary}
              icon="calendar"
              label="Itinerary"
              sub="Day-by-day plan"
              onPress={() => router.push(`/(app)/trips/${id}/itinerary`)}
            />
            <ActionTile
              gradient={Gradients.ocean}
              icon="book"
              label="Journal"
              sub="Memories & notes"
              onPress={() => router.push(`/(app)/trips/${id}/journal`)}
            />
            <ActionTile
              gradient={Gradients.adventure}
              icon="compass"
              label="Discover"
              sub="Find new places"
              onPress={() => router.push('/(app)/discover')}
            />
            <ActionTile
              gradient={Gradients.sunset}
              icon="add-circle"
              label="Add to Day"
              sub="Plan a specific day"
              onPress={() => router.push(`/(app)/trips/${id}/itinerary`)}
            />
          </View>

          {/* ── Packing Checklist ── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="checkbox-outline" size={18} color={Colors.primary} />
                <Text style={styles.sectionTitle}>Packing Checklist</Text>
              </View>
              {totalCount > 0 && (
                <Text style={styles.sectionMeta}>
                  {checkedCount} of {totalCount}
                </Text>
              )}
            </View>

            {/* Progress bar */}
            {totalCount > 0 && (
              <View style={styles.checklistProgress}>
                <View style={styles.checklistProgressTrack}>
                  <View
                    style={[
                      styles.checklistProgressFill,
                      { width: `${Math.round((checkedCount / totalCount) * 100)}%` },
                    ]}
                  />
                </View>
                <Text style={styles.checklistProgressPct}>
                  {Math.round((checkedCount / totalCount) * 100)}%
                </Text>
              </View>
            )}

            {checklistLoading ? (
              <ActivityIndicator
                size="small"
                color={Colors.primary}
                style={{ marginVertical: Spacing.lg }}
              />
            ) : (
              <>
                {/* Suggested items */}
                {suggestions.length > 0 && (
                  <View style={styles.suggestionsWrap}>
                    <View style={styles.suggestionHeader}>
                      <Ionicons name="sparkles" size={14} color={Colors.primary} />
                      <Text style={styles.suggestionTitle}>SUGGESTED FOR THIS TRIP</Text>
                      <TouchableOpacity
                        style={styles.addAllBtn}
                        onPress={handleAddAllSuggestions}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.addAllBtnText}>Add all</Text>
                      </TouchableOpacity>
                    </View>
                    {context.labels.length > 0 && (
                      <View style={styles.contextLabels}>
                        {context.labels.map((label) => (
                          <View key={label} style={styles.contextLabel}>
                            <Text style={styles.contextLabelText}>{label}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.sugChipsContent}
                    >
                      {suggestions.slice(0, 8).map((s) => (
                        <TouchableOpacity
                          key={s.id}
                          style={styles.sugChip}
                          onPress={() => addItem(s.text)}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.sugChipEmoji}>{s.emoji}</Text>
                          <Text style={styles.sugChipText} numberOfLines={1}>{s.text}</Text>
                          <View style={styles.sugChipAdd}>
                            <Ionicons name="add" size={12} color={Colors.primary} />
                          </View>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}

                {/* Unchecked items */}
                {uncheckedItems.map((item) => (
                  <ChecklistRow
                    key={item.id}
                    text={item.text}
                    checked={false}
                    onToggle={() => toggleItem(item.id)}
                    onDelete={() => handleDeleteItem(item.id)}
                  />
                ))}

                {/* Checked items — grayed out, below unchecked */}
                {checkedItems.length > 0 && uncheckedItems.length > 0 && (
                  <View style={styles.checklistDivider} />
                )}
                {checkedItems.map((item) => (
                  <ChecklistRow
                    key={item.id}
                    text={item.text}
                    checked
                    onToggle={() => toggleItem(item.id)}
                    onDelete={() => handleDeleteItem(item.id)}
                  />
                ))}

                {/* Add item row */}
                <View style={styles.addItemRow}>
                  <View style={styles.addItemInput}>
                    <Ionicons name="add" size={16} color={Colors.placeholder} />
                    <TextInput
                      ref={addInputRef}
                      value={newItemText}
                      onChangeText={setNewItemText}
                      placeholder="Add an item…"
                      placeholderTextColor={Colors.placeholder}
                      style={styles.addItemTextInput}
                      returnKeyType="done"
                      onSubmitEditing={handleAddItem}
                      editable={!addingItem}
                    />
                  </View>
                  {newItemText.trim().length > 0 && (
                    <TouchableOpacity
                      style={[styles.addItemBtn, addingItem && styles.addItemBtnDisabled]}
                      onPress={handleAddItem}
                      disabled={addingItem}
                      activeOpacity={0.8}
                    >
                      {addingItem ? (
                        <ActivityIndicator size="small" color={Colors.white} />
                      ) : (
                        <Text style={styles.addItemBtnText}>Add</Text>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}
          </View>

          {/* ── Trip notes ── */}
          {trip.notes ? (
            <View style={styles.notesCard}>
              <View style={styles.notesHeader}>
                <Ionicons name="document-text-outline" size={15} color={Colors.textSecondary} />
                <Text style={styles.notesLabel}>NOTES</Text>
              </View>
              <Text variant="body" style={styles.notesText}>{trip.notes}</Text>
            </View>
          ) : null}

          {/* ── Reminders ── */}
          <TripRemindersCard trip={trip} />

          {/* ── Delete ── */}
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={handleDelete}
            activeOpacity={0.8}
          >
            <Ionicons name="trash-outline" size={16} color={Colors.error} />
            <Text style={styles.deleteBtnLabel}>Delete trip</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* ── Export / Share modal ── */}
      {showExportModal && (
        <ExportPreviewModal
          visible={showExportModal}
          onClose={() => setShowExportModal(false)}
          trip={trip}
          itinerary={itinerary}
          checklist={checklist}
        />
      )}
    </SafeAreaView>
  );
}

// ── StatPill ──────────────────────────────────────────────────────────

function StatPill({ icon, value, label }: { icon: string; value: string; label: string }) {
  return (
    <View style={styles.statPill}>
      <Ionicons name={icon as never} size={14} color={Colors.primary} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ── ActionTile ────────────────────────────────────────────────────────

function ActionTile({
  gradient,
  icon,
  label,
  sub,
  onPress,
}: {
  gradient: readonly [string, string];
  icon: string;
  label: string;
  sub: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.tile} onPress={onPress} activeOpacity={0.85}>
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.tileInner}
      >
        <View style={styles.tileIconBox}>
          <Ionicons name={icon as never} size={22} color={Colors.white} />
        </View>
        <Text style={styles.tileLabel}>{label}</Text>
        <Text style={styles.tileSub} numberOfLines={1}>{sub}</Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

// ── ChecklistRow ──────────────────────────────────────────────────────

function ChecklistRow({
  text,
  checked,
  onToggle,
  onDelete,
}: {
  text: string;
  checked: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <View style={styles.checkRow}>
      <TouchableOpacity
        style={[styles.checkbox, checked && styles.checkboxChecked]}
        onPress={onToggle}
        hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
        activeOpacity={0.7}
      >
        {checked && <Ionicons name="checkmark" size={11} color={Colors.white} />}
      </TouchableOpacity>
      <TouchableOpacity style={styles.checkLabelWrap} onPress={onToggle} activeOpacity={0.7}>
        <Text
          style={[styles.checkLabel, checked && styles.checkLabelDone]}
          numberOfLines={2}
        >
          {text}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onDelete}
        hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
        style={styles.checkDeleteBtn}
      >
        <Ionicons name="close" size={14} color={Colors.placeholder} />
      </TouchableOpacity>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.primary },
  scroll: { flexGrow: 1 },

  // ── Hero ──────────────────────────────────────────────────────────────
  hero: {
    paddingTop: Spacing.md,
    paddingBottom: Spacing['4xl'],
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
    overflow: 'hidden',
    minHeight: 260,
  },
  decCircle1: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(255,255,255,0.06)',
    top: -70,
    right: -50,
  },
  decCircle2: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.04)',
    bottom: -30,
    left: -20,
  },
  heroNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  heroNavRight: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  statusText: {
    fontSize: 11,
    fontWeight: FontWeight.bold,
    color: Colors.white,
    letterSpacing: 0.4,
  },
  destination: {
    fontSize: FontSize['4xl'],
    lineHeight: 42,
    fontWeight: FontWeight.extrabold,
    color: Colors.white,
    marginTop: Spacing.xs,
  },
  dateRange: {
    fontSize: FontSize.md,
    color: 'rgba(255,255,255,0.78)',
    lineHeight: 22,
  },
  durationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: Radius.full,
    marginTop: 2,
  },
  durationText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    color: Colors.white,
  },
  dayStat: {
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.72)',
    marginTop: 2,
  },
  progressSection: { marginTop: Spacing.md, gap: Spacing.xs },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressLabel: {
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: FontWeight.medium,
  },
  progressPct: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.6)' },
  progressTrack: { backgroundColor: 'rgba(255,255,255,0.22)' },

  // ── Body ──────────────────────────────────────────────────────────────
  body: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    marginTop: -Radius.xl,
    paddingTop: Spacing['2xl'],
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing['4xl'],
    gap: Spacing.xl,
    minHeight: 500,
  },

  // ── Stats strip ───────────────────────────────────────────────────────
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: Spacing.md,
    ...Shadow.sm,
  },
  statPill: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  statsDivider: {
    width: 1,
    height: 32,
    backgroundColor: Colors.border,
  },
  statValue: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    lineHeight: 22,
  },
  statLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },

  // ── Action grid 2×2 ──────────────────────────────────────────────────
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  tile: {
    // Each tile takes exactly half the row minus half the gap
    width: '47.5%',
    borderRadius: Radius.lg,
    overflow: 'hidden',
    ...Shadow.md,
  },
  tileInner: {
    padding: Spacing.md,
    gap: 4,
    minHeight: 96,
    justifyContent: 'flex-end',
  },
  tileIconBox: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  tileLabel: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.white,
    lineHeight: 20,
  },
  tileSub: {
    fontSize: FontSize.xs,
    color: 'rgba(255,255,255,0.72)',
    lineHeight: 16,
  },

  // ── Checklist section ─────────────────────────────────────────────────
  section: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    gap: Spacing.md,
    ...Shadow.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  sectionMeta: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },

  // Progress bar inside checklist
  checklistProgress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  checklistProgressTrack: {
    flex: 1,
    height: 4,
    backgroundColor: Colors.chipBackground,
    borderRadius: 2,
    overflow: 'hidden',
  },
  checklistProgressFill: {
    height: '100%',
    backgroundColor: Colors.success,
    borderRadius: 2,
  },
  checklistProgressPct: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
    minWidth: 30,
    textAlign: 'right',
  },

  // Checklist item rows
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checkboxChecked: {
    backgroundColor: Colors.success,
    borderColor: Colors.success,
  },
  checkLabelWrap: { flex: 1 },
  checkLabel: {
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    lineHeight: 20,
  },
  checkLabelDone: {
    color: Colors.placeholder,
    textDecorationLine: 'line-through',
  },
  checkDeleteBtn: {
    padding: Spacing.xs,
    flexShrink: 0,
  },

  // Divider between unchecked + checked items
  checklistDivider: {
    height: 1,
    backgroundColor: Colors.borderLight,
    marginVertical: Spacing.xs,
  },

  // Add item row
  addItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  addItemInput: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.background,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  addItemTextInput: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    paddingVertical: 0,
  },
  addItemBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    minWidth: 52,
    alignItems: 'center',
  },
  addItemBtnDisabled: { opacity: 0.5 },
  addItemBtnText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.white,
  },

  // ── Notes ─────────────────────────────────────────────────────────────
  notesCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.sm,
    ...Shadow.sm,
  },
  notesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  notesLabel: {
    fontSize: 11,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
    letterSpacing: 0.5,
  },
  notesText: {
    color: Colors.textPrimary,
    lineHeight: 22,
  },

  // ── Suggestions ───────────────────────────────────────────────────────
  suggestionsWrap: {
    gap: Spacing.sm,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    marginBottom: Spacing.xs,
  },
  suggestionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  suggestionTitle: {
    flex: 1,
    fontSize: 10,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
    letterSpacing: 0.6,
  },
  addAllBtn: {
    backgroundColor: Colors.primary + '15',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  addAllBtnText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.primary,
  },
  contextLabels: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  contextLabel: {
    backgroundColor: Colors.chipBackground,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  contextLabelText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  sugChipsContent: {
    gap: Spacing.sm,
    paddingRight: Spacing.sm,
  },
  sugChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.full,
    paddingVertical: 7,
    paddingLeft: Spacing.sm,
    paddingRight: Spacing.xs,
    maxWidth: 180,
  },
  sugChipEmoji: {
    fontSize: 14,
  },
  sugChipText: {
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    flexShrink: 1,
  },
  sugChipAdd: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  // ── Delete ────────────────────────────────────────────────────────────
  deleteBtn: {
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
  deleteBtnLabel: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.error,
  },
});
