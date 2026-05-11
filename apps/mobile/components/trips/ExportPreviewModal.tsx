import { useState, useMemo } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  ScrollView,
  Share,
  Switch,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Text } from '@/components/ui';
import { formatTripSummary } from '@/utils/formatTripSummary';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/constants/theme';
import type { PlannedTrip, ItineraryDay, ChecklistItem } from '@solotravelsoul/shared';

interface Props {
  visible: boolean;
  onClose: () => void;
  trip: PlannedTrip;
  itinerary: ItineraryDay[];
  checklist: ChecklistItem[];
}

export function ExportPreviewModal({ visible, onClose, trip, itinerary, checklist }: Props) {
  const [includeJournal, setIncludeJournal] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);

  const summaryText = useMemo(
    () => formatTripSummary(trip, itinerary, checklist, { includeJournal }),
    [trip, itinerary, checklist, includeJournal]
  );

  const handleShare = async () => {
    setSharing(true);
    try {
      await Share.share({
        message: summaryText,
        title: `${trip.destination} — Trip Summary`,
      });
    } finally {
      setSharing(false);
    }
  };

  const handleCopy = async () => {
    await Clipboard.setStringAsync(summaryText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const totalEntries = itinerary.reduce((n, d) => n + d.journalEntries.length, 0);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {/* ── Header ── */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7}>
            <Ionicons name="close" size={20} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Share Trip</Text>
          <View style={styles.closeBtn} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Privacy notice ── */}
          <View style={styles.privacyBanner}>
            <Ionicons name="shield-checkmark-outline" size={14} color={Colors.success} />
            <Text style={styles.privacyText}>
              Journal text is never shared — only titles and mood.
            </Text>
          </View>

          {/* ── Journal toggle ── */}
          <View style={styles.toggleCard}>
            <View style={styles.toggleLeft}>
              <Ionicons name="book-outline" size={18} color={Colors.textSecondary} />
              <View style={styles.toggleLabels}>
                <Text style={styles.toggleLabel}>Include journal entries</Text>
                <Text style={styles.toggleSub}>
                  {totalEntries === 0
                    ? 'No entries yet'
                    : `${totalEntries} entr${totalEntries === 1 ? 'y' : 'ies'} · titles & mood only`}
                </Text>
              </View>
            </View>
            <Switch
              value={includeJournal}
              onValueChange={setIncludeJournal}
              disabled={totalEntries === 0}
              trackColor={{ false: Colors.border, true: Colors.primary + '60' }}
              thumbColor={includeJournal ? Colors.primary : Colors.surface}
            />
          </View>

          {/* ── Preview card ── */}
          <View style={styles.previewCard}>
            <View style={styles.previewHeader}>
              <Ionicons name="document-text-outline" size={14} color={Colors.textSecondary} />
              <Text style={styles.previewLabel}>PREVIEW</Text>
            </View>
            <Text style={styles.previewText} selectable>
              {summaryText}
            </Text>
          </View>
        </ScrollView>

        {/* ── Action buttons ── */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.copyBtn, copied && styles.copyBtnDone]}
            onPress={handleCopy}
            activeOpacity={0.8}
          >
            <Ionicons
              name={copied ? 'checkmark' : 'copy-outline'}
              size={17}
              color={copied ? Colors.success : Colors.textPrimary}
            />
            <Text style={[styles.copyBtnLabel, copied && styles.copyBtnLabelDone]}>
              {copied ? 'Copied!' : 'Copy'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.shareBtn, sharing && styles.shareBtnDisabled]}
            onPress={handleShare}
            disabled={sharing}
            activeOpacity={0.8}
          >
            {sharing ? (
              <ActivityIndicator size="small" color={Colors.white} />
            ) : (
              <>
                <Ionicons
                  name={Platform.OS === 'ios' ? 'share-outline' : 'share-social-outline'}
                  size={17}
                  color={Colors.white}
                />
                <Text style={styles.shareBtnLabel}>Share</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.chipBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },

  scroll: { flex: 1 },
  scrollContent: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing['2xl'] },

  // Privacy banner
  privacyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.success + '12',
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.success + '30',
  },
  privacyText: {
    fontSize: FontSize.sm,
    color: Colors.success,
    flex: 1,
    flexWrap: 'wrap',
  },

  // Toggle
  toggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  toggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    flex: 1,
    marginRight: Spacing.md,
  },
  toggleLabels: { gap: 2, flex: 1 },
  toggleLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  toggleSub: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },

  // Preview card
  previewCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    gap: Spacing.sm,
    ...Shadow.sm,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  previewLabel: {
    fontSize: 11,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
    letterSpacing: 0.6,
  },
  previewText: {
    fontSize: 13,
    color: Colors.textPrimary,
    lineHeight: 21,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },

  // Actions
  actions: {
    flexDirection: 'row',
    gap: Spacing.md,
    padding: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  copyBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md + 2,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  copyBtnDone: {
    borderColor: Colors.success + '50',
    backgroundColor: Colors.success + '10',
  },
  copyBtnLabel: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  copyBtnLabelDone: { color: Colors.success },

  shareBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md + 2,
    borderRadius: Radius.lg,
    backgroundColor: Colors.primary,
  },
  shareBtnDisabled: { opacity: 0.6 },
  shareBtnLabel: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.white,
  },
});
