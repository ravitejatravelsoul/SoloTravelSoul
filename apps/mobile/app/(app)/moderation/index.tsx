import { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  isModerator,
  subscribeOpenReports,
  getReportTarget,
  reviewReport,
  setContentVisibility,
  removeComment,
  suspendUser,
  type ModerationReport,
  type ReportTargetPreview,
} from '@solotravelsoul/firebase';
import { Text } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { requestMediaRemoval } from '@/utils/moderation';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

function age(date: Date): string {
  const hours = Math.floor((Date.now() - date.getTime()) / 3_600_000);
  return hours < 1 ? 'under 1 h' : hours < 48 ? `${hours} h` : `${Math.floor(hours / 24)} d`;
}

/**
 * Moderator report queue (role granted by the project owner in moderators/{uid};
 * all actions are enforced by Firestore rules, not by this screen).
 */
export default function ModerationScreen() {
  const uid = useAuthStore((s) => s.user?.uid ?? '');
  const addToast = useUIStore((s) => s.addToast);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [reports, setReports] = useState<ModerationReport[]>([]);
  const [previews, setPreviews] = useState<Record<string, ReportTargetPreview>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    isModerator(uid).then(setAllowed);
  }, [uid]);

  useEffect(() => {
    if (!allowed) return;
    return subscribeOpenReports(setReports);
  }, [allowed]);

  const preview = useCallback(async (r: ModerationReport) => {
    try {
      const p = await getReportTarget(r);
      setPreviews((prev) => ({ ...prev, [r.id]: p }));
    } catch {
      addToast('Could not load the reported item.', 'error');
    }
  }, [addToast]);

  const act = useCallback(
    async (r: ModerationReport, label: string, action: () => Promise<void>, resolution: string, status: 'actioned' | 'dismissed' = 'actioned') => {
      setBusy(r.id);
      try {
        await action();
        await reviewReport(r.id, uid, status, resolution);
        addToast(`${label} done.`, 'success');
      } catch {
        addToast(`${label} failed. Nothing further was changed.`, 'error');
      } finally {
        setBusy(null);
      }
    },
    [uid, addToast]
  );

  const confirm = (title: string, onOk: () => void) =>
    Alert.alert(title, undefined, [{ text: 'Cancel', style: 'cancel' }, { text: 'Confirm', style: 'destructive', onPress: onOk }]);

  const renderReport = ({ item: r }: { item: ModerationReport }) => {
    const p = previews[r.id];
    const content = r.targetType === 'post' || r.targetType === 'journal' ? r.targetType : null;
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{r.targetType} · {r.reason}</Text>
        <Text style={styles.meta}>Open for {age(r.createdAt)} · {r.targetId}</Text>
        {r.details ? <Text style={styles.details}>“{r.details}”</Text> : null}
        {p ? (
          <View style={styles.preview}>
            <Text style={styles.previewText}>{p.exists ? p.text || '(no text)' : 'Item no longer exists'}</Text>
            {p.images.length ? <Text style={styles.meta}>{p.images.length} photo(s) · visibility {p.visibility ?? '—'}</Text> : null}
          </View>
        ) : (
          <TouchableOpacity onPress={() => preview(r)}><Text style={styles.link}>Show reported item</Text></TouchableOpacity>
        )}
        {busy === r.id ? <ActivityIndicator /> : (
          <View style={styles.actions}>
            <TouchableOpacity style={styles.btn} onPress={() => act(r, 'Dismiss', async () => {}, 'No violation found', 'dismissed')}>
              <Text style={styles.btnText}>Dismiss</Text>
            </TouchableOpacity>
            {content && (
              <TouchableOpacity style={[styles.btn, styles.danger]} onPress={() => confirm('Remove this content and delete its photos?', () =>
                act(r, 'Remove', async () => {
                  await setContentVisibility(content, r.targetId, uid, 'removed');
                  await requestMediaRemoval(content, r.targetId);
                }, 'Content removed'))}>
                <Text style={styles.btnText}>Remove</Text>
              </TouchableOpacity>
            )}
            {content && (
              <TouchableOpacity style={styles.btn} onPress={() => act(r, 'Restore', () => setContentVisibility(content, r.targetId, uid, 'public'), 'Restored after review')}>
                <Text style={styles.btnText}>Restore</Text>
              </TouchableOpacity>
            )}
            {r.targetType === 'comment' && (
              <TouchableOpacity style={[styles.btn, styles.danger]} onPress={() => confirm('Remove this comment?', () =>
                act(r, 'Remove comment', () => removeComment(r.targetId, uid), 'Comment removed'))}>
                <Text style={styles.btnText}>Remove comment</Text>
              </TouchableOpacity>
            )}
            {p?.authorUid && p.authorUid !== uid && (
              <TouchableOpacity style={[styles.btn, styles.danger]} onPress={() => confirm('Suspend this account? They will no longer be able to post, message or upload.', () =>
                act(r, 'Suspend', () => suspendUser(p.authorUid!, uid, `Report ${r.id}: ${r.reason}`), 'Account suspended'))}>
                <Text style={styles.btnText}>Suspend author</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Moderation queue</Text>
        <View style={{ width: 24 }} />
      </View>
      {allowed === null ? <ActivityIndicator style={{ marginTop: 40 }} /> : !allowed ? (
        <Text style={styles.empty}>This area is only available to moderators.</Text>
      ) : (
        <FlatList
          data={reports}
          keyExtractor={(r) => r.id}
          renderItem={renderReport}
          contentContainerStyle={{ padding: Spacing.md, gap: Spacing.md }}
          ListEmptyComponent={<Text style={styles.empty}>No open reports.</Text>}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  navBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  navTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md, gap: 6 },
  cardTitle: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary, textTransform: 'capitalize' },
  meta: { fontSize: FontSize.xs, color: Colors.textSecondary },
  details: { fontSize: FontSize.sm, color: Colors.textPrimary, fontStyle: 'italic' },
  preview: { backgroundColor: Colors.background, borderRadius: Radius.sm, padding: Spacing.sm, gap: 4 },
  previewText: { fontSize: FontSize.sm, color: Colors.textPrimary },
  link: { fontSize: FontSize.sm, color: Colors.primary },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: 4 },
  btn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.sm, backgroundColor: Colors.primary },
  danger: { backgroundColor: Colors.error },
  btnText: { color: '#fff', fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  empty: { textAlign: 'center', marginTop: 40, color: Colors.textSecondary },
});
