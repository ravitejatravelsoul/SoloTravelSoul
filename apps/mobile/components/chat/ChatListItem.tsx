import { View, Text, StyleSheet } from 'react-native';
import { formatDistanceToNowStrict } from 'date-fns';
import { PressableScale } from '@/components/ui/PressableScale';
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
    <PressableScale
      style={styles.row}
      onPress={onPress}
      guardMs={500}
      scaleTo={0.985}
      accessibilityRole="button"
      accessibilityLabel={`${name}${hasUnread ? `, ${unreadCount} unread` : ''}, ${lastMessageText ?? (isGroup ? `${memberCount ?? 0} members` : 'No messages yet')}`}
    >
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
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.background,
    gap: Spacing.md,
    minHeight: 72,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarGroup: {
    backgroundColor: Colors.coral,
    borderRadius: Radius.lg,
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
    fontSize: FontSize.md,
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
    color: Colors.primaryDark,
    fontWeight: FontWeight.bold,
  },
  preview: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    flex: 1,
    marginRight: Spacing.sm,
  },
  previewBold: {
    color: Colors.textPrimary,
    fontWeight: FontWeight.medium,
  },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.coral,
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
