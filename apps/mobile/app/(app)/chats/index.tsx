import { useState, useCallback } from 'react';
import {
  View,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SectionList,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useDirectChats } from '@/hooks/useDirectChats';
import { useAuthStore } from '@/stores/authStore';
import { useHaptics } from '@/hooks/useHaptics';
import { ChatListItem } from '@/components/chat/ChatListItem';
import { Text, Skeleton, EmptyState } from '@/components/ui';
import { Colors, FontSize, FontWeight, Spacing, Radius } from '@/constants/theme';
import type { DirectChat, TravelGroup } from '@solotravelsoul/shared';

// ── Chat skeleton row ─────────────────────────────────────────────────

function ChatRowSkeleton() {
  return (
    <View style={sk.row}>
      <Skeleton width={48} height={48} radius={24} />
      <View style={sk.body}>
        <Skeleton width="55%" height={15} radius={4} />
        <Skeleton width="80%" height={13} radius={4} style={sk.gap} />
      </View>
      <Skeleton width={36} height={12} radius={4} />
    </View>
  );
}

function ChatListSkeleton() {
  return (
    <View style={sk.container}>
      {[0, 1, 2, 3].map((i) => <ChatRowSkeleton key={i} />)}
    </View>
  );
}

const sk = StyleSheet.create({
  container: { paddingTop: Spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  body: { flex: 1, gap: 6 },
  gap: { marginTop: 4 },
});

// ── Screen ────────────────────────────────────────────────────────────

export default function ChatsIndexScreen() {
  const router = useRouter();
  const uid = useAuthStore((s) => s.user?.uid ?? '');
  const haptics = useHaptics();
  const { directChats, groups, loadingChats } = useDirectChats();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    // Listeners are always live; just give visual feedback
    await new Promise((r) => setTimeout(r, 700));
    setRefreshing(false);
  }, []);

  const handleNewChat = useCallback(() => {
    haptics.light();
    router.push('/chats/new');
  }, [haptics, router]);

  const handleNewGroup = useCallback(() => {
    haptics.light();
    router.push('/groups/new');
  }, [haptics, router]);

  const dmSection = directChats.length > 0
    ? [{
        title: 'Direct Messages',
        data: directChats as (DirectChat | TravelGroup)[],
        type: 'dm' as const,
      }]
    : [];

  const groupSection = groups.length > 0
    ? [{
        title: 'Groups',
        data: groups as (DirectChat | TravelGroup)[],
        type: 'group' as const,
      }]
    : [];

  const sections = [...dmSection, ...groupSection];
  const isEmpty = directChats.length === 0 && groups.length === 0 && !loadingChats;

  const renderDM = useCallback((chat: DirectChat) => {
    const other = chat.participants.find((p) => p !== uid);
    const info = other ? chat.participantInfo[other] : null;
    const name = info?.name ?? 'Unknown';
    const initials = info?.initials ?? '?';
    const unread = chat.unreadCounts[uid] ?? 0;

    return (
      <ChatListItem
        name={name}
        initials={initials}
        lastMessageText={chat.lastMessage?.text ?? null}
        updatedAt={chat.updatedAt}
        unreadCount={unread}
        onPress={() => { haptics.selection(); router.push(`/chats/${chat.id}`); }}
      />
    );
  }, [uid, router, haptics]);

  const renderGroup = useCallback((group: TravelGroup) => {
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
  }, [uid, router, haptics]);

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <Text variant="h2">Chats</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={handleNewGroup}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="people-outline" size={22} color={Colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={handleNewChat}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="create-outline" size={22} color={Colors.primary} />
          </TouchableOpacity>
        </View>
      </View>

      {loadingChats ? (
        <ChatListSkeleton />
      ) : isEmpty ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyEmoji}>✈️</Text>
          <Text variant="h3" center>Start a conversation</Text>
          <Text variant="caption" center style={styles.emptyBody}>
            Message a fellow traveler directly, or create a group to coordinate your next adventure together.
          </Text>
          <View style={styles.emptyCtas}>
            <TouchableOpacity style={styles.ctaBtn} onPress={handleNewChat} activeOpacity={0.8}>
              <Ionicons name="chatbubble-outline" size={16} color={Colors.white} />
              <Text style={styles.ctaBtnText}>New Message</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.ctaBtn, styles.ctaBtnSecondary]} onPress={handleNewGroup} activeOpacity={0.8}>
              <Ionicons name="people-outline" size={16} color={Colors.primary} />
              <Text style={[styles.ctaBtnText, styles.ctaBtnTextSecondary]}>Create Group</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
            </View>
          )}
          renderItem={({ item, section }) =>
            section.type === 'dm'
              ? renderDM(item as DirectChat)
              : renderGroup(item as TravelGroup)
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          stickySectionHeadersEnabled={false}
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
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingBottom: Spacing.md,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerActions: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  iconBtn: {
    padding: 4,
  },
  list: {
    paddingBottom: 32,
  },
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
  separator: {
    height: 1,
    backgroundColor: Colors.borderLight,
    marginLeft: 72,
  },

  // ── Empty state ───────────────────────────────────────────────────
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing['3xl'],
    gap: Spacing.md,
  },
  emptyEmoji: {
    fontSize: 56,
    lineHeight: 72,
    marginBottom: Spacing.xs,
  },
  emptyBody: {
    lineHeight: 20,
    maxWidth: 280,
    color: Colors.textSecondary,
  },
  emptyCtas: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.sm,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: Radius.full,
  },
  ctaBtnSecondary: {
    backgroundColor: Colors.primary + '14',
    borderWidth: 1,
    borderColor: Colors.primary + '40',
  },
  ctaBtnText: {
    color: Colors.white,
    fontWeight: FontWeight.semibold,
    fontSize: FontSize.sm,
  },
  ctaBtnTextSecondary: {
    color: Colors.primary,
  },
});
