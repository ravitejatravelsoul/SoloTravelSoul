import { useState, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  View,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Text } from '@/components/ui';
import { useTripStore } from '@/stores/tripStore';
import { useAddToTrip } from '@/hooks/useAddToTrip';
import { buildItineraryDays } from '@solotravelsoul/shared';
import { tripStatus, formatDateRange, formatDayLabel } from '@/utils/dateUtils';
import {
  Colors,
  Gradients,
  Spacing,
  Radius,
  FontSize,
  FontWeight,
  Shadow,
} from '@/constants/theme';
import type { PlaceEntry, PlannedTrip } from '@solotravelsoul/shared';

// Pre-defined pill colors — avoids runtime hex concat which varies across RN versions
const STATUS_CONFIG: Record<string, {
  gradient: readonly [string, string];
  label: string;
  pillBg: string;
  pillText: string;
}> = {
  active: {
    gradient: Gradients.heroActive,
    label: 'Active',
    pillBg: 'rgba(16,185,129,0.12)',
    pillText: '#059669',
  },
  upcoming: {
    gradient: Gradients.hero,
    label: 'Upcoming',
    pillBg: 'rgba(18,112,194,0.12)',
    pillText: '#1270C2',
  },
  past: {
    gradient: ['#6B7280', '#374151'] as const,
    label: 'Past',
    pillBg: 'rgba(107,114,128,0.12)',
    pillText: '#6B7280',
  },
};

interface Props {
  visible: boolean;
  place: PlaceEntry | null;
  onClose: () => void;
}

export function AddToTripSheet({ visible, place, onClose }: Props) {
  const trips = useTripStore(useShallow((s) => s.trips.filter((t) => !t.isArchived)));
  const { addPlaceToDay, loading } = useAddToTrip();
  const [selectedTrip, setSelectedTrip] = useState<PlannedTrip | null>(null);

  // Reset to step 1 every time the sheet opens
  useEffect(() => {
    if (visible) setSelectedTrip(null);
  }, [visible]);

  const handleClose = () => {
    setSelectedTrip(null);
    onClose();
  };

  const handleSelectDay = async (dayRef: { id: string; date: Date }) => {
    if (!place || !selectedTrip || loading) return;
    const ok = await addPlaceToDay(selectedTrip.id, dayRef, place);
    if (ok) handleClose();
  };

  const days = selectedTrip
    ? buildItineraryDays(selectedTrip.startDate, selectedTrip.endDate)
    : [];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <SafeAreaView style={styles.sheet} edges={['top']}>
        <KeyboardAvoidingView
          style={styles.fill}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >

          {/* ── Header ── */}
          <View style={styles.header}>
            <View style={styles.dragHandle} />
            <View style={styles.headerRow}>
              {selectedTrip ? (
                <TouchableOpacity style={styles.navBtn} onPress={() => setSelectedTrip(null)}>
                  <Ionicons name="arrow-back" size={18} color={Colors.textPrimary} />
                </TouchableOpacity>
              ) : (
                <View style={styles.navBtn} />
              )}
              <View style={styles.headerCenter}>
                <Text style={styles.headerTitle}>
                  {selectedTrip ? 'Select a day' : 'Add to trip'}
                </Text>
                {place && (
                  <Text style={styles.headerSub} numberOfLines={1}>
                    {place.name}
                  </Text>
                )}
              </View>
              <TouchableOpacity style={styles.navBtn} onPress={handleClose}>
                <Ionicons name="close" size={18} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Step 1: Trip list ── */}
          {!selectedTrip && (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {trips.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyEmoji}>✈️</Text>
                  <Text style={styles.emptyTitle}>No trips yet</Text>
                  <Text style={styles.emptySub}>
                    Create a trip from the Trips tab, then come back to add places.
                  </Text>
                </View>
              ) : (
                trips.map((trip) => {
                  const status = tripStatus(trip.startDate, trip.endDate);
                  const cfg = STATUS_CONFIG[status];
                  return (
                    <TouchableOpacity
                      key={trip.id}
                      style={styles.tripCard}
                      onPress={() => setSelectedTrip(trip)}
                      activeOpacity={0.8}
                    >
                      {/* Gradient left accent bar — needs no alignItems on parent */}
                      <LinearGradient
                        colors={cfg.gradient}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 0, y: 1 }}
                        style={styles.tripAccent}
                      />
                      <View style={styles.tripBody}>
                        <View style={styles.tripRow}>
                          <Text style={styles.tripDestination} numberOfLines={1}>
                            {trip.destination}
                          </Text>
                          <View style={[styles.statusPill, { backgroundColor: cfg.pillBg }]}>
                            <Text style={[styles.statusPillText, { color: cfg.pillText }]}>
                              {cfg.label}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.tripDates}>
                          {formatDateRange(trip.startDate, trip.endDate)}
                        </Text>
                      </View>
                      <View style={styles.chevronWrap}>
                        <Ionicons name="chevron-forward" size={16} color={Colors.placeholder} />
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          )}

          {/* ── Step 2: Day list ── */}
          {selectedTrip && (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {days.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>No days found</Text>
                  <Text style={styles.emptySub}>Check the trip start and end dates.</Text>
                </View>
              ) : (
                days.map((day, index) => (
                  <TouchableOpacity
                    key={day.id}
                    style={[styles.dayCard, loading && styles.dayCardDisabled]}
                    onPress={() => handleSelectDay(day)}
                    activeOpacity={0.8}
                    disabled={loading}
                  >
                    <View style={styles.dayNumberBox}>
                      <Text style={styles.dayNumber}>{index + 1}</Text>
                    </View>
                    <View style={styles.dayInfo}>
                      <Text style={styles.dayLabel}>{formatDayLabel(day.date)}</Text>
                      <Text style={styles.dayHint}>Tap to add here</Text>
                    </View>
                    {loading ? (
                      <ActivityIndicator size="small" color={Colors.primary} />
                    ) : (
                      <Ionicons name="add-circle-outline" size={22} color={Colors.primary} />
                    )}
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          )}

        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  fill: { flex: 1 },

  // ── Header ──────────────────────────────────────────────────────────
  header: {
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    ...Shadow.sm,
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  navBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  headerSub: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  // ── Scroll ──────────────────────────────────────────────────────────
  scroll: { flex: 1 },
  scrollContent: {
    padding: Spacing.lg,
    gap: Spacing.md,
    paddingBottom: Spacing['4xl'],
  },

  // ── Trip cards (Step 1) ─────────────────────────────────────────────
  // NOTE: no alignItems on tripCard — allows tripAccent to use alignSelf: 'stretch'
  tripCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  tripAccent: {
    width: 6,
    alignSelf: 'stretch',
  },
  tripBody: {
    flex: 1,
    padding: Spacing.md,
    gap: 4,
    justifyContent: 'center',
  },
  tripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  tripDestination: {
    flex: 1,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  statusPill: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  statusPillText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
  },
  tripDates: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  chevronWrap: {
    alignSelf: 'center',
    paddingRight: Spacing.md,
  },

  // ── Day cards (Step 2) ──────────────────────────────────────────────
  dayCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  dayCardDisabled: { opacity: 0.6 },
  dayNumberBox: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(18,112,194,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNumber: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
  },
  dayInfo: { flex: 1 },
  dayLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  dayHint: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  // ── Empty states ────────────────────────────────────────────────────
  emptyState: {
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing['3xl'],
    paddingHorizontal: Spacing.xl,
  },
  emptyEmoji: { fontSize: 44, lineHeight: 54 },
  emptyTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});
