import { FlatList, View, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Screen, Text, Card, Avatar, EmptyState } from '@/components/ui';
import { useNotifications } from '@/hooks/useNotifications';
import { getUserInitials } from '@solotravelsoul/shared';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import type { AppNotification, NotificationType } from '@solotravelsoul/shared';

const TYPE_META: Record<NotificationType, { icon: string; color: string; label: string }> = {
  join_request: { icon: 'paper-plane-outline', color: Colors.accent, label: 'Join Request' },
  join_approved: { icon: 'checkmark-circle', color: Colors.success, label: 'Approved' },
  join_denied: { icon: 'close-circle', color: Colors.error, label: 'Request Declined' },
  group_chat: { icon: 'chatbubbles-outline', color: Colors.primary, label: 'Group Chat' },
  liked_post: { icon: 'heart', color: '#EF4444', label: 'Liked your post' },
  commented_post: { icon: 'chatbubble', color: Colors.primary, label: 'Commented on your post' },
  replied_comment: { icon: 'return-down-forward', color: Colors.accent, label: 'Replied to your comment' },
  followed_you: { icon: 'person-add', color: Colors.success, label: 'Started following you' },
  saved_post: { icon: 'bookmark', color: Colors.warning, label: 'Saved your post' },
};

function timeAgo(date: Date): string {
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return date.toLocaleDateString();
}

function NotificationRow({ notif, onPress }: { notif: AppNotification; onPress: () => void }) {
  const meta = TYPE_META[notif.type] ?? TYPE_META.join_request;
  const isSocial = ['liked_post', 'commented_post', 'replied_comment', 'followed_you', 'saved_post'].includes(notif.type);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[styles.row, !notif.isRead && styles.rowUnread]}
    >
      {/* ── Avatar or icon ── */}
      {isSocial && notif.actorName ? (
        <Avatar
          uri={notif.actorPhoto ?? null}
          initials={getUserInitials(notif.actorName)}
          size={44}
        />
      ) : (
        <View style={[styles.iconWrap, { backgroundColor: meta.color + '15' }]}>
          <Ionicons name={meta.icon as never} size={22} color={meta.color} />
        </View>
      )}

      {/* ── Content ── */}
      <View style={styles.content}>
        {isSocial && notif.actorName ? (
          <>
            <Text style={styles.body}>
              <Text style={styles.bold}>{notif.actorName} </Text>
              {meta.label.toLowerCase()}
              {notif.targetTitle ? (
                <Text style={styles.target}>{' '}"{notif.targetTitle}"</Text>
              ) : null}
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.bold}>{notif.title}</Text>
            <Text style={styles.body}>{notif.message}</Text>
          </>
        )}
        <Text style={styles.time}>{timeAgo(notif.createdAt)}</Text>
      </View>

      {/* ── Unread dot ── */}
      {!notif.isRead && <View style={styles.unreadDot} />}
    </TouchableOpacity>
  );
}

export default function NotificationsScreen() {
  const { notifications, markRead } = useNotifications();

  const handlePress = (notif: AppNotification) => {
    if (!notif.isRead) markRead(notif.id);

    // Navigate to relevant screen based on type
    if (notif.targetId) {
      if (notif.type === 'liked_post' || notif.type === 'commented_post' || notif.type === 'saved_post') {
        router.push(`/(app)/post/${notif.targetId}` as never);
      } else if (notif.type === 'followed_you' && notif.actorId) {
        router.push(`/(app)/community/profile/${notif.actorId}` as never);
      }
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Notifications</Text>
        {notifications.some((n) => !n.isRead) && (
          <Text style={styles.unreadCount}>
            {notifications.filter((n) => !n.isRead).length} unread
          </Text>
        )}
      </View>

      <FlatList
        data={notifications}
        keyExtractor={(n) => n.id}
        renderItem={({ item }) => (
          <NotificationRow notif={item} onPress={() => handlePress(item)} />
        )}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        ListEmptyComponent={
          <EmptyState
            emoji="🔔"
            title="No notifications yet"
            subtitle="You'll see likes, comments, follows, and group activity here."
          />
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing['2xl'],
    paddingVertical: Spacing.lg,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  headerTitle: { fontSize: FontSize['2xl'], fontWeight: FontWeight.bold, color: Colors.textPrimary },
  unreadCount: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: FontWeight.semibold },
  list: { padding: Spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
  },
  rowUnread: {
    backgroundColor: Colors.primary + '06',
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { flex: 1 },
  bold: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  body: { fontSize: FontSize.sm, color: Colors.textPrimary, lineHeight: 18 },
  target: { color: Colors.textSecondary },
  time: { fontSize: FontSize.xs, color: Colors.placeholder, marginTop: 2 },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: Radius.full,
    backgroundColor: Colors.primary,
  },
  sep: { height: Spacing.xs },
});
