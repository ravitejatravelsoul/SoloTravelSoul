import { useState, useCallback } from 'react';
import {
  View,
  SectionList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useDirectChats } from '@/hooks/useDirectChats';
import { useAuthStore } from '@/stores/authStore';
import { useHaptics } from '@/hooks/useHaptics';
import { ChatListItem } from '@/components/chat/ChatListItem';
import { Text, Skeleton } from '@/components/ui';
import { Colors, FontSize, FontWeight, Spacing, Radius } from '@/constants/theme';
import type { TravelGroup } from '@solotravelsoul/shared';

// ── Skeleton ──────────────────────────────────────────────────────────

function GroupSkeleton() {
  return (
    <View style={sk.container}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={sk.row}>
          <Skeleton width={48} height={48} radius={10} />
          <View style={sk.body}>
            <Skeleton width="50%" height={15} radius={4} />
            <Skeleton width="70%" height={13} radius={4} style={sk.gap} />
          </View>
        </View>
      ))}
    </View>
  );
}

const sk = StyleSheet.create({
  container: { paddingTop: Spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  body: { flex: 1, gap: 6 },
  gap: { marginTop: 4 },
});

// ── Screen ────────────────────────────────────────────────────────────

export default function GroupsIndexScreen() {
  const router = useRouter();
  const uid = useAuthStore((s) => s.user?.uid ?? '');
  const haptics = useHaptics();
  const { groups, loadingChats } = useDirectChats();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await new Promise((r) => setTimeout(r, 700));
    setRefreshing(false);
  }, []);

  const handleCreateGroup = useCallback(() => {
    haptics.light();
    router.push('/groups/new');
  }, [haptics, router]);

  const renderGroup = useCallback(
    (group: TravelGroup) => {
      const initials = group.name
        .split(' ')
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() ?? '')
        .join('');
      const unread = group.unreadCounts[uid] ?? 0;

      return (
        <ChatListItem
          name={group.name}
          initials={initials}
          lastMessageText={group.lastMessage?.text ?? null}
          updatedAt={group.updatedAt}
          unreadCount={unread}
          isGroup
          memberCount={group.members.length}
          onPress={() => { haptics.selection(); router.push(`/groups/${group.id}/chat`); }}
        />
      );
    },
    [uid, router, haptics],
  );

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={26} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text variant="h3">Travel Groups</Text>
        <TouchableOpacity
          onPress={handleCreateGroup}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="add" size={26} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {loadingChats ? (
        <GroupSkeleton />
      ) : groups.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyEmoji}>🌍</Text>
          <Text variant="h3" center>No groups yet</Text>
          <Text variant="caption" center style={styles.emptyBody}>
            Create a travel group to coordinate trips, share updates, and chat with everyone at once.
          </Text>
          <TouchableOpacity style={styles.createBtn} onPress={handleCreateGroup} activeOpacity={0.8}>
            <Ionicons name="people-outline" size={16} color={Colors.white} />
            <Text style={styles.createBtnText}>Create a Group</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <SectionList
          sections={[{ title: 'Your Groups', data: groups }]}
          keyExtractor={(item) => item.id}
          renderSectionHeader={() => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Your Groups</Text>
            </View>
          )}
          renderItem={({ item }) => renderGroup(item)}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={Colors.primary}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingBottom: Spacing.md,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  list: { paddingBottom: 32 },
  sectionHeader: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xs,
    backgroundColor: Colors.background,
  },
  sectionTitle: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  separator: { height: 1, backgroundColor: Colors.borderLight, marginLeft: 72 },

  // ── Empty state ───────────────────────────────────────────────────
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing['3xl'],
    gap: Spacing.md,
  },
  emptyEmoji: { fontSize: 56, lineHeight: 72, marginBottom: Spacing.xs },
  emptyBody: { lineHeight: 20, maxWidth: 280, color: Colors.textSecondary },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing['2xl'],
    paddingVertical: Spacing.md,
    borderRadius: Radius.full,
    marginTop: Spacing.sm,
  },
  createBtnText: {
    color: Colors.white,
    fontWeight: FontWeight.semibold,
    fontSize: FontSize.sm,
  },
});
