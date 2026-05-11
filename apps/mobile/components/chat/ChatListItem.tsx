import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { formatDistanceToNowStrict } from 'date-fns';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '@/constants/theme';

interface ChatListItemProps {
  name: string;
  initials: string;
  lastMessageText: string | null;
  updatedAt: Date;
  unreadCount: number;
  isGroup?: boolean;
  memberCount?: number;
  onPress: () => void;
}

function shortTime(date: Date): string {
  try {
    return formatDistanceToNowStrict(date, { addSuffix: false })
      .replace(' seconds', 's')
      .replace(' second', 's')
      .replace(' minutes', 'm')
      .replace(' minute', 'm')
      .replace(' hours', 'h')
      .replace(' hour', 'h')
      .replace(' days', 'd')
      .replace(' day', 'd')
      .replace(' weeks', 'w')
      .replace(' week', 'w')
      .replace(' months', 'mo')
      .replace(' month', 'mo')
      .replace(' years', 'y')
      .replace(' year', 'y');
  } catch {
    return '';
  }
}

export function ChatListItem({
  name,
  initials,
  lastMessageText,
  updatedAt,
  unreadCount,
  isGroup,
  memberCount,
  onPress,
}: ChatListItemProps) {
  const hasUnread = unreadCount > 0;

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      {/* Avatar */}
      <View style={[styles.avatar, isGroup && styles.avatarGroup]}>
        <Text style={styles.initials}>{initials}</Text>
      </View>

      {/* Content */}
      <View style={styles.content}>
        <View style={styles.topRow}>
          <Text style={[styles.name, hasUnread && styles.nameBold]} numberOfLines={1}>
            {name}
          </Text>
          <Text style={[styles.time, hasUnread && styles.timeUnread]}>
            {shortTime(updatedAt)}
          </Text>
        </View>
        <View style={styles.bottomRow}>
          <Text
            style={[styles.preview, hasUnread && styles.previewBold]}
            numberOfLines={1}
          >
            {lastMessageText ?? (isGroup ? `${memberCount ?? 0} members` : 'No messages yet')}
          </Text>
          {hasUnread && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surface,
    gap: Spacing.md,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarGroup: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.md,
  },
  initials: {
    color: Colors.white,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.5,
  },
  content: {
    flex: 1,
    gap: 3,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  name: {
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    fontWeight: FontWeight.medium,
    flex: 1,
    marginRight: Spacing.sm,
  },
  nameBold: {
    fontWeight: FontWeight.bold,
  },
  time: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  timeUnread: {
    color: Colors.primary,
    fontWeight: FontWeight.semibold,
  },
  preview: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    flex: 1,
    marginRight: Spacing.sm,
  },
  previewBold: {
    color: Colors.textPrimary,
    fontWeight: FontWeight.medium,
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  badgeText: {
    color: Colors.white,
    fontSize: 11,
    fontWeight: FontWeight.bold,
  },
});
