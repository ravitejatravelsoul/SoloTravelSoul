import { useCallback, useEffect, useState } from 'react';
import { useMediaSource } from '@/hooks/useMediaSource';
import { View, StyleSheet, FlatList, TouchableOpacity, Alert, ActivityIndicator, Image, ScrollView, Modal } from 'react-native';
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
  unsuspendUser,
  setItemModeration,
  subscribeSuspensions,
  subscribeModeratedItems,
  type AccountSuspension,
  type ModeratedItem,
  type ModerationReport,
  type ReportTargetPreview,
} from '@solotravelsoul/firebase';
import { Text } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { requestMediaRemoval } from '@/utils/moderation';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

/** One reported photo: loading spinner, error fallback, tap to view full size. */
function ReviewImage({ uri, onOpen }: { uri: string; onOpen: (uri: string) => void }) {
  const mediaSrc = useMediaSource();
  const [state, setState] = useState<'loading' | 'loaded' | 'error'>('loading');
  return (
    <TouchableOpacity
      style={styles.thumb}
      onPress={() => state !== 'error' && onOpen(uri)}
      accessibilityLabel="Reported photo, tap to enlarge"
      activeOpacity={0.8}
    >
      {state !== 'error' && (
        <Image
          source={mediaSrc(uri)}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          onLoad={() => setState('loaded')}
          onError={() => setState('error')}
        />
      )}
      {state === 'loading' && <ActivityIndicator style={StyleSheet.absoluteFill} />}
      {state === 'error' && (
        <View style={styles.thumbError}>
          <Ionicons name="image-outline" size={20} color={Colors.textSecondary} />
          <Text style={styles.meta}>Could not load</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

function age(date: Date): string {
  const hours = Math.floor((Date.now() - date.getTime()) / 3_600_000);
  return hours < 1 ? 'under 1 h' : hours < 48 ? `${hours} h` : `${Math.floor(hours / 24)} d`;
}

/**
 * Moderator report queue (role granted by the project owner in moderators/{uid};
 * all actions are enforced by Firestore rules, not by this screen).
 */
export default function ModerationScreen() {
  const mediaSrc = useMediaSource();
  const uid = useAuthStore((s) => s.user?.uid ?? '');
  const addToast = useUIStore((s) => s.addToast);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [reports, setReports] = useState<ModerationReport[]>([]);
  const [previews, setPreviews] = useState<Record<string, ReportTargetPreview>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [enlarged, setEnlarged] = useState<string | null>(null);
  const [tab, setTab] = useState<'reports' | 'hidden' | 'suspended'>('reports');
  const [moderatedItems, setModeratedItems] = useState<ModeratedItem[]>([]);
  const [suspensions, setSuspensions] = useState<AccountSuspension[]>([]);

  useEffect(() => {
    if (!uid) return;
    isModerator(uid).then(setAllowed);
  }, [uid]);

  useEffect(() => {
    if (!allowed) return;
    return subscribeOpenReports(setReports);
  }, [allowed]);

  useEffect(() => {
    if (!allowed) return;
    return subscribeSuspensions(setSuspensions);
  }, [allowed]);

  useEffect(() => {
    if (!allowed) return;
    return subscribeModeratedItems(setModeratedItems);
  }, [allowed]);

  const restoreItem = useCallback(async (m: ModeratedItem) => {
    setBusy(m.id);
    try {
      await setItemModeration(m.type, m.id, uid, 'visible');
      addToast(`Restored. The ${m.type} is visible again.`, 'success');
    } catch {
      addToast('Could not restore it. Nothing was changed.', 'error');
    } finally {
      setBusy(null);
    }
  }, [uid, addToast]);

  const lift = useCallback(async (s: AccountSuspension) => {
    setBusy(s.uid);
    try {
      await unsuspendUser(s.uid);
      addToast('Suspension lifted. The account can post and message again; it is not added back to traveler discovery.', 'success');
    } catch {
      addToast('Could not lift the suspension. Nothing was changed.', 'error');
    } finally {
      setBusy(null);
    }
  }, [addToast]);

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
        // One decision covers every open report on the same item (e.g. the three that hid it).
        const ids = new Set([r.id, ...reports.filter((x) => x.targetType === r.targetType && x.targetId === r.targetId).map((x) => x.id)]);
        await Promise.all([...ids].map((id) => reviewReport(id, uid, status, resolution)));
        addToast(`${label} done.`, 'success');
      } catch {
        addToast(`${label} failed. Nothing further was changed.`, 'error');
      } finally {
        setBusy(null);
      }
    },
    [uid, addToast, reports]
  );

  const confirm = (title: string, onOk: () => void) =>
    Alert.alert(title, undefined, [{ text: 'Cancel', style: 'cancel' }, { text: 'Confirm', style: 'destructive', onPress: onOk }]);

  const renderReport = ({ item: r }: { item: ModerationReport }) => {
    const p = previews[r.id];
    const content = r.targetType === 'post' || r.targetType === 'journal' ? r.targetType : null;
    const item = r.targetType === 'trip' || r.targetType === 'group' ? r.targetType : null;
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{r.targetType} · {r.reason}</Text>
        <Text style={styles.meta}>Open for {age(r.createdAt)} · {r.targetId}</Text>
        {r.details ? <Text style={styles.details}>“{r.details}”</Text> : null}
        {p ? (
          <View style={styles.preview}>
            <Text style={styles.previewText}>{p.exists ? p.text || '(no text)' : 'Item no longer exists'}</Text>
            {p.images.length ? (
              <>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbRow}>
                  {p.images.map((uri) => <ReviewImage key={uri} uri={uri} onOpen={setEnlarged} />)}
                </ScrollView>
                <Text style={styles.meta}>{p.images.length} photo(s) · visibility {p.visibility ?? '—'}</Text>
              </>
            ) : null}
            {p.moderationStatus ? <Text style={styles.meta}>Moderation status: {p.moderationStatus}</Text> : null}
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
            {item && (
              <>
                {p?.moderationStatus !== 'hidden' && p?.moderationStatus !== 'removed' && (
                  <TouchableOpacity style={styles.btn} onPress={() => confirm(`Hide this ${r.targetType}? It leaves discovery and matching, takes no new requests, and its owner cannot restore it. Members can still leave and report.`, () =>
                    act(r, 'Hide', () => setItemModeration(item, r.targetId, uid, 'hidden'), `${r.targetType} hidden pending review`))}>
                    <Text style={styles.btnText}>Hide</Text>
                  </TouchableOpacity>
                )}
                {p?.moderationStatus !== 'removed' && (
                  <TouchableOpacity style={[styles.btn, styles.danger]} onPress={() => confirm(`Remove this ${r.targetType}? It stays removed until a moderator restores it.`, () =>
                    act(r, 'Remove', () => setItemModeration(item, r.targetId, uid, 'removed'), `${r.targetType} removed`))}>
                    <Text style={styles.btnText}>Remove</Text>
                  </TouchableOpacity>
                )}
                {(p?.moderationStatus === 'hidden' || p?.moderationStatus === 'removed') && (
                  <TouchableOpacity style={styles.btn} onPress={() => act(r, 'Restore', () => setItemModeration(item, r.targetId, uid, 'visible'), 'Restored after review')}>
                    <Text style={styles.btnText}>Restore</Text>
                  </TouchableOpacity>
                )}
              </>
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
        <>
          <View style={styles.tabs}>
            {(['reports', 'hidden', 'suspended'] as const).map((t) => (
              <TouchableOpacity key={t} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => setTab(t)} accessibilityRole="tab" accessibilityState={{ selected: tab === t }}>
                <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t === 'reports' ? `Reports (${reports.length})` : t === 'hidden' ? `Hidden (${moderatedItems.length})` : `Suspended (${suspensions.length})`}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {tab === 'reports' ? (
            <FlatList
              data={reports}
              keyExtractor={(r) => r.id}
              renderItem={renderReport}
              contentContainerStyle={{ padding: Spacing.md, gap: Spacing.md }}
              ListEmptyComponent={<Text style={styles.empty}>No open reports.</Text>}
            />
          ) : tab === 'hidden' ? (
            <FlatList
              data={moderatedItems}
              keyExtractor={(m) => `${m.type}:${m.id}`}
              renderItem={({ item: m }) => (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>{m.type} · {m.status}</Text>
                  <Text style={styles.previewText}>{m.title}</Text>
                  <Text style={styles.meta}>{m.id}</Text>
                  {busy === m.id ? <ActivityIndicator /> : (
                    <View style={styles.actions}>
                      <TouchableOpacity style={styles.btn} onPress={() => restoreItem(m)}>
                        <Text style={styles.btnText}>Restore</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}
              contentContainerStyle={{ padding: Spacing.md, gap: Spacing.md }}
              ListEmptyComponent={<Text style={styles.empty}>Nothing hidden or removed.</Text>}
            />
          ) : (
            <FlatList
              data={suspensions}
              keyExtractor={(x) => x.uid}
              renderItem={({ item: sus }) => (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Suspended account</Text>
                  <Text style={styles.meta}>{sus.uid} · since {age(sus.createdAt)} ago</Text>
                  {sus.reason ? <Text style={styles.details}>“{sus.reason}”</Text> : null}
                  {busy === sus.uid ? <ActivityIndicator /> : (
                    <View style={styles.actions}>
                      <TouchableOpacity style={styles.btn} onPress={() => confirm('Lift this suspension? The account can post, message and upload again.', () => lift(sus))}>
                        <Text style={styles.btnText}>Lift suspension</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}
              contentContainerStyle={{ padding: Spacing.md, gap: Spacing.md }}
              ListEmptyComponent={<Text style={styles.empty}>No suspended accounts.</Text>}
            />
          )}
        </>
      )}
      <Modal visible={!!enlarged} transparent animationType="fade" onRequestClose={() => setEnlarged(null)}>
        <TouchableOpacity style={styles.viewer} onPress={() => setEnlarged(null)} accessibilityLabel="Close photo" activeOpacity={1}>
          {enlarged && <Image source={mediaSrc(enlarged)} style={styles.viewerImage} resizeMode="contain" />}
        </TouchableOpacity>
      </Modal>
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
  tabs: { flexDirection: 'row', paddingHorizontal: Spacing.md, gap: Spacing.sm },
  tab: { flex: 1, paddingVertical: 10, borderRadius: Radius.sm, backgroundColor: Colors.surface, alignItems: 'center' },
  tabActive: { backgroundColor: Colors.primary },
  tabText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.semibold },
  tabTextActive: { color: '#fff' },
  empty: { textAlign: 'center', marginTop: 40, color: Colors.textSecondary },
  thumbRow: { gap: Spacing.sm, paddingVertical: 4 },
  thumb: { width: 120, height: 120, borderRadius: Radius.sm, overflow: 'hidden', backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' },
  thumbError: { alignItems: 'center', gap: 4 },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  viewerImage: { width: '100%', height: '80%' },
});
