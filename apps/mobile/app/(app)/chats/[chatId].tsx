import { useRef, useCallback, useEffect, useMemo } from 'react';
import { BackButton } from '@/components/ui/BackButton';
import { useModerationActions } from '@/hooks/useModerationActions';
import {
  View,
  FlatList,
  Text,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Keyboard,
  ListRenderItemInfo,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useChatStore } from '@/stores/chatStore';
import { useAuthStore } from '@/stores/authStore';
import { useMessages } from '@/hooks/useMessages';
import { useNetworkState } from '@/hooks/useNetworkState';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { DateSeparator } from '@/components/chat/DateSeparator';
import { ChatInput } from '@/components/chat/ChatInput';
import { Colors, FontSize, FontWeight, Fonts, Spacing } from '@/constants/theme';
import { isSameDay } from 'date-fns';
import { DELETED_ACCOUNT_NAME } from '@solotravelsoul/shared';
import type { DirectMessage } from '@solotravelsoul/shared';

type ListItem =
  | { kind: 'message'; msg: DirectMessage }
  | { kind: 'separator'; date: Date; key: string };

export default function DirectChatScreen() {
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  const router = useRouter();
  const { top } = useSafeAreaInsets();
  const uid = useAuthStore((s) => s.user?.uid ?? '');
  const { isConnected } = useNetworkState();
  const flatRef = useRef<FlatList>(null);

  const directChats = useChatStore((s) => s.directChats);
  const chat = directChats.find((c) => c.id === chatId);
  const moderation = useModerationActions();
  const otherUid = chat?.participants.find((p) => p !== uid);
  const otherInfo = otherUid ? chat?.participantInfo[otherUid] : null;
  // Stable reference — prevents sendMessage callback from being recreated every render
  const otherUids = useMemo(() => (otherUid ? [otherUid] : []), [otherUid]);

  const { messages, sendMessage, restored } = useMessages(chatId ?? '', otherUids);
  // The other person's account is gone: the history stays readable, but nothing can be sent to them.
  const otherDeleted = !!otherUid && (chat?.deletedParticipants.includes(otherUid) || otherInfo?.name === DELETED_ACCOUNT_NAME);

  // Build display list with date separators
  const listItems: ListItem[] = [];
  messages.forEach((msg, i) => {
    const prev = messages[i - 1];
    if (!prev || !isSameDay(prev.sentAt, msg.sentAt)) {
      listItems.push({ kind: 'separator', date: msg.sentAt, key: `sep-${msg.sentAt.toDateString()}` });
    }
    listItems.push({ kind: 'message', msg });
  });

  // Scroll to bottom when messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [messages.length]);

  // The keyboard shrinks the list from below; keep the newest message in view instead of hiding it behind the composer.
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () => {
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: false }), 60);
    });
    return () => sub.remove();
  }, []);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<ListItem>) => {
      if (item.kind === 'separator') {
        return <DateSeparator date={item.date} />;
      }
      return (
        <MessageBubble
          text={item.msg.text}
          isMine={item.msg.senderId === uid}
          status={item.msg.status}
        />
      );
    },
    [uid],
  );

  const keyExtractor = useCallback((item: ListItem) => {
    return item.kind === 'separator' ? item.key : item.msg.id;
  }, []);

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: top + 10 }]}>
        <BackButton />
        <View style={styles.headerCenter}>
          <View style={styles.headerAvatar}>
            <Text style={styles.headerAvatarText}>{otherInfo?.initials ?? '?'}</Text>
          </View>
          <Text style={styles.headerName} numberOfLines={1}>
            {otherInfo?.name ?? 'Chat'}
          </Text>
        </View>
        {otherUid ? (
          <TouchableOpacity
            onPress={() => moderation.openMenu({ targetType: 'user', targetId: otherUid, authorId: otherUid, authorName: otherInfo?.name ?? '', label: 'User', onBlocked: () => router.back() })}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Report or block"
            style={{ width: 34, alignItems: 'flex-end' }}
          >
            <Ionicons name="ellipsis-horizontal" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 34 }} />
        )}
      </View>

      {!isConnected && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>Offline — messages will send when reconnected</Text>
        </View>
      )}

      {/* Messages */}
      <FlatList
        ref={flatRef}
        data={listItems}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.messageList}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Say hello! 👋</Text>
          </View>
        }
      />

      {otherDeleted ? (
        <View style={styles.deletedBanner}>
          <Text style={styles.deletedText}>This account was deleted. You can read this conversation but cannot send messages to it.</Text>
        </View>
      ) : (
        <ChatInput onSend={sendMessage} restore={restored} />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.background,
    gap: Spacing.sm,
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarText: {
    color: Colors.white,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
  },
  headerName: {
    fontFamily: Fonts.display,
    fontSize: FontSize.lg,
    color: Colors.textPrimary,
    flex: 1,
  },
  deletedBanner: {
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    padding: Spacing.md,
  },
  deletedText: { textAlign: 'center', fontSize: FontSize.sm, color: Colors.textSecondary },
  offlineBanner: {
    backgroundColor: '#F59E0B22',
    borderBottomWidth: 1,
    borderBottomColor: '#F59E0B44',
    padding: Spacing.sm,
  },
  offlineText: {
    textAlign: 'center',
    fontSize: FontSize.xs,
    color: Colors.warning,
    fontWeight: FontWeight.medium,
  },
  messageList: {
    paddingVertical: Spacing.md,
    flexGrow: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyText: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
  },
});
