import { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui';
import {
  Colors,
  FontSize,
  FontWeight,
  Radius,
  Shadow,
  Spacing,
} from '@/constants/theme';
import type { JournalEntry, JournalMood, PlaceEntry } from '@solotravelsoul/shared';

// ── Types ─────────────────────────────────────────────────────────────

export interface JournalDraft {
  title?: string;
  text: string;
  mood?: JournalMood;
  placeId?: string;
  placeName?: string;
}

interface Props {
  visible: boolean;
  places: PlaceEntry[];
  initialEntry?: JournalEntry;
  onSave: (draft: JournalDraft) => Promise<void>;
  onClose: () => void;
  modalTitle?: string;
}

// ── Mood config ───────────────────────────────────────────────────────

const MOODS: { value: JournalMood; emoji: string; label: string; color: string }[] = [
  { value: 'amazing', emoji: '🤩', label: 'Amazing', color: '#F59E0B' },
  { value: 'good',    emoji: '😊', label: 'Good',    color: '#10B981' },
  { value: 'okay',    emoji: '😐', label: 'Okay',    color: '#6B7280' },
  { value: 'tired',   emoji: '😴', label: 'Tired',   color: '#8B5CF6' },
  { value: 'challenging', emoji: '😤', label: 'Tough', color: '#EF4444' },
];

// ── Component ─────────────────────────────────────────────────────────

export function JournalEntryModal({
  visible,
  places,
  initialEntry,
  onSave,
  onClose,
  modalTitle,
}: Props) {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [mood, setMood] = useState<JournalMood | undefined>(undefined);
  const [placeId, setPlaceId] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const textRef = useRef<TextInput>(null);

  // Populate form when editing an existing entry
  useEffect(() => {
    if (visible) {
      setTitle(initialEntry?.title ?? '');
      setText(initialEntry?.text ?? '');
      setMood(initialEntry?.mood ?? undefined);
      setPlaceId(initialEntry?.placeId ?? undefined);
      setSaving(false);
    }
  }, [visible, initialEntry]);

  const canSave = text.trim().length > 0 && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    const selectedPlace = places.find((p) => p.id === placeId);
    const draft: JournalDraft = {
      ...(title.trim() && { title: title.trim() }),
      text: text.trim(),
      ...(mood && { mood }),
      ...(selectedPlace && { placeId: selectedPlace.id, placeName: selectedPlace.name }),
    };
    try {
      await onSave(draft);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const togglePlace = (id: string) => {
    setPlaceId((prev) => (prev === id ? undefined : id));
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        {/* ── Drag handle ── */}
        <View style={styles.handle} />

        {/* ── Header ── */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <Text style={styles.cancelBtn}>Cancel</Text>
          </TouchableOpacity>
          <Text variant="h3" style={styles.headerTitle}>
            {modalTitle ?? (initialEntry ? 'Edit memory' : 'New memory')}
          </Text>
          <TouchableOpacity
            onPress={handleSave}
            disabled={!canSave}
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          >
            {saving ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <Text style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}>Save</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >

          {/* ── Mood selector ── */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>How was it?</Text>
            <View style={styles.moodRow}>
              {MOODS.map((m) => {
                const selected = mood === m.value;
                return (
                  <TouchableOpacity
                    key={m.value}
                    onPress={() => setMood(selected ? undefined : m.value)}
                    activeOpacity={0.7}
                    style={[
                      styles.moodBtn,
                      selected && { backgroundColor: m.color + '1A', borderColor: m.color },
                    ]}
                  >
                    <Text style={styles.moodEmoji}>{m.emoji}</Text>
                    <Text
                      style={[styles.moodLabel, selected && { color: m.color, fontWeight: FontWeight.semibold }]}
                    >
                      {m.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* ── Title ── */}
          <View style={styles.section}>
            <TextInput
              style={styles.titleInput}
              placeholder="Add a title (optional)"
              placeholderTextColor={Colors.placeholder}
              value={title}
              onChangeText={setTitle}
              returnKeyType="next"
              onSubmitEditing={() => textRef.current?.focus()}
              maxLength={100}
            />
          </View>

          {/* ── Main text ── */}
          <View style={styles.section}>
            <TextInput
              ref={textRef}
              style={styles.bodyInput}
              placeholder="What happened today? Write your memory…"
              placeholderTextColor={Colors.placeholder}
              value={text}
              onChangeText={setText}
              multiline
              textAlignVertical="top"
              scrollEnabled={false}
              autoFocus={!initialEntry}
            />
          </View>

          {/* ── Place picker ── */}
          {places.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Link a place</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.placesRow}
              >
                {places.map((p) => {
                  const selected = placeId === p.id;
                  return (
                    <TouchableOpacity
                      key={p.id}
                      onPress={() => togglePlace(p.id)}
                      activeOpacity={0.7}
                      style={[styles.placeChip, selected && styles.placeChipSelected]}
                    >
                      <Ionicons
                        name="location-outline"
                        size={12}
                        color={selected ? Colors.white : Colors.textSecondary}
                      />
                      <Text
                        style={[styles.placeChipText, selected && styles.placeChipTextSelected]}
                        numberOfLines={1}
                      >
                        {p.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* ── Photo placeholder ── */}
          <View style={[styles.section, styles.photoPlaceholder]}>
            <Ionicons name="camera-outline" size={20} color={Colors.placeholder} />
            <Text style={styles.photoPlaceholderText}>Photos — coming soon</Text>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.surface },

  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: FontSize.md, fontWeight: FontWeight.semibold },
  cancelBtn: { fontSize: FontSize.md, color: Colors.textSecondary },
  saveBtn: { fontSize: FontSize.md, color: Colors.primary, fontWeight: FontWeight.semibold },
  saveBtnDisabled: { color: Colors.placeholder },

  scroll: { flex: 1 },
  scrollContent: { padding: Spacing.lg, gap: Spacing.lg, paddingBottom: Spacing['4xl'] },

  section: {},

  sectionLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
  },

  // Mood
  moodRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  moodBtn: {
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    minWidth: 58,
  },
  moodEmoji: { fontSize: 22 },
  moodLabel: { fontSize: FontSize.xs, color: Colors.textSecondary },

  // Title
  titleInput: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingVertical: Spacing.sm,
  },

  // Body
  bodyInput: {
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    lineHeight: 24,
    minHeight: 140,
    backgroundColor: Colors.background,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },

  // Place chips
  placesRow: { gap: Spacing.sm, paddingRight: Spacing.lg },
  placeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    backgroundColor: Colors.chipBackground,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  placeChipSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  placeChipText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
    maxWidth: 120,
  },
  placeChipTextSelected: { color: Colors.white },

  // Photo placeholder
  photoPlaceholder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.background,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    padding: Spacing.lg,
    justifyContent: 'center',
    opacity: 0.6,
  },
  photoPlaceholderText: {
    fontSize: FontSize.sm,
    color: Colors.placeholder,
  },
});
