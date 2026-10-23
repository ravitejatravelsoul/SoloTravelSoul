import { useState, useCallback } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  SectionList,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDirectChats } from '@/hooks/useDirectChats';
import { useMyGroupInvites } from '@/hooks/useGroupInvites';
import { GroupInviteCard } from '@/components/chat/GroupInviteCard';
import { VerifyEmailBanner } from '@/components/chat/VerifyEmailBanner';
import { useEmailVerification } from '@/hooks/useEmailVerification';
import { useAuthStore } from '@/stores/authStore';
import { useHaptics } from '@/hooks/useHaptics';
import { ChatListItem } from '@/components/chat/ChatListItem';
import { Text, Skeleton, PressableScale } from '@/components/ui';
import { Colors, FontSize, FontWeight, Fonts, Spacing, Radius } from '@/constants/theme';
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
  const insets = useSafeAreaInsets();
  const uid = useAuthStore((s) => s.user?.uid ?? '');
  const haptics = useHaptics();
  const { directChats: allDirectChats, groups, loadingChats } = useDirectChats();
  const verification = useEmailVerification();
  const invites = useMyGroupInvites(verification.verified);
  // A chat nobody has written in yet (someone opened Message and left) is not a conversation: not shown to either side.
  const directChats = allDirectChats.filter((c) => c.lastMessage !== null);
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
  const isEmpty = directChats.length === 0 && groups.length === 0 && invites.length === 0 && !loadingChats;

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
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Text variant="h2" accessibilityRole="header">Chats</Text>
        <View style={styles.headerActions}>
          <PressableScale
            style={styles.iconBtn}
            onPress={handleNewGroup}
            guardMs={500}
            accessibilityRole="button"
            accessibilityLabel="New group"
            hitSlop={6}
          >
            <Ionicons name="people-outline" size={22} color={Colors.primaryDark} />
          </PressableScale>
          <PressableScale
            style={styles.iconBtn}
            onPress={handleNewChat}
            guardMs={500}
            accessibilityRole="button"
            accessibilityLabel="New message"
            hitSlop={6}
          >
            <Ionicons name="create-outline" size={22} color={Colors.primaryDark} />
          </PressableScale>
        </View>
      </View>

      {verification.verified === false && (
        <VerifyEmailBanner
          email={verification.email}
          sending={verification.sending}
          checking={verification.checking}
          message={verification.message}
          onSend={verification.send}
          onRefresh={verification.refresh}
        />
      )}

      {loadingChats ? (
        <ChatListSkeleton />
      ) : isEmpty ? (
        <ScrollView contentContainerStyle={styles.emptyWrap}>
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
        </ScrollView>
      ) : (
        <SectionList
          sections={sections}
          ListHeaderComponent={invites.length > 0 ? (
            <View>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Group invitations</Text>
              </View>
              {invites.map((invite) => <GroupInviteCard key={invite.id} invite={invite} />)}
            </View>
          ) : null}
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
    paddingBottom: Spacing.md,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.background,
  },
  headerActions: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.tealSoft,
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
    fontFamily: Fonts.display,
    fontSize: FontSize.lg,
    color: Colors.textPrimary,
  },
  separator: {
    height: 1,
    backgroundColor: Colors.borderLight,
    marginLeft: 76,
  },

  // ── Empty state ───────────────────────────────────────────────────
  emptyWrap: {
    flexGrow: 1,
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
