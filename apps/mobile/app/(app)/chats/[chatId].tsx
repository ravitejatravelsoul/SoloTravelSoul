import { useRef, useCallback, useEffect } from 'react';
import {
  View,
  FlatList,
  Text,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ListRenderItemInfo,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useShallow } from 'zustand/react/shallow';
import { useChatStore } from '@/stores/chatStore';
import { useAuthStore } from '@/stores/authStore';
import { useMessages } from '@/hooks/useMessages';
import { useNetworkState } from '@/hooks/useNetworkState';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { DateSeparator } from '@/components/chat/DateSeparator';
import { ChatInput } from '@/components/chat/ChatInput';
import { Colors, FontSize, FontWeight, Spacing } from '@/constants/theme';
import { isSameDay } from 'date-fns';
import type { DirectMessage } from '@solotravelsoul/shared';

type ListItem =
  | { kind: 'message'; msg: DirectMessage }
  | { kind: 'separator'; date: Date; key: string };

export default function DirectChatScreen() {
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  const router = useRouter();
  const uid = useAuthStore((s) => s.user?.uid ?? '');
  const { isConnected } = useNetworkState();
  const flatRef = useRef<FlatList>(null);

  const directChats = useChatStore((s) => s.directChats);
  const chat = directChats.find((c) => c.id === chatId);
  const otherUid = chat?.participants.find((p) => p !== uid);
  const otherInfo = otherUid ? chat?.participantInfo[otherUid] : null;
  const otherUids = otherUid ? [otherUid] : [];

  const { messages, sendMessage } = useMessages(chatId ?? '', otherUids);

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
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={26} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={styles.headerAvatar}>
            <Text style={styles.headerAvatarText}>{otherInfo?.initials ?? '?'}</Text>
          </View>
          <Text style={styles.headerName} numberOfLines={1}>
            {otherInfo?.name ?? 'Chat'}
          </Text>
        </View>
        <View style={{ width: 34 }} />
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

      <ChatInput onSend={sendMessage} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 56,
    paddingBottom: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.sm,
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headerAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
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
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    flex: 1,
  },
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
