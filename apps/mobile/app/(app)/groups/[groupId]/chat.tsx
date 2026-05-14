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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useChatStore } from '@/stores/chatStore';
import { useAuthStore } from '@/stores/authStore';
import { useGroupChat } from '@/hooks/useGroupChat';
import { useNetworkState } from '@/hooks/useNetworkState';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { DateSeparator } from '@/components/chat/DateSeparator';
import { SystemMessage } from '@/components/chat/SystemMessage';
import { ChatInput } from '@/components/chat/ChatInput';
import { Colors, FontSize, FontWeight, Radius, Spacing } from '@/constants/theme';
import { isSameDay } from 'date-fns';
import type { TravelGroupMessage } from '@solotravelsoul/shared';

type ListItem =
  | { kind: 'message'; msg: TravelGroupMessage }
  | { kind: 'separator'; date: Date; key: string };

export default function GroupChatScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();
  const { top } = useSafeAreaInsets();
  const uid = useAuthStore((s) => s.user?.uid ?? '');
  const profile = useAuthStore((s) => s.profile);
  const { isConnected } = useNetworkState();
  const flatRef = useRef<FlatList>(null);

  const groups = useChatStore((s) => s.groups);
  const group = groups.find((g) => g.id === groupId);
  const groupName = group?.name ?? 'Group Chat';

  const myName = profile?.name ?? 'Traveler';
  const { messages, sendMessage } = useGroupChat(groupId ?? '', myName);

  // Build display list with date separators
  const listItems: ListItem[] = [];
  messages.forEach((msg, i) => {
    const prev = messages[i - 1];
    if (!prev || !isSameDay(prev.sentAt, msg.sentAt)) {
      listItems.push({ kind: 'separator', date: msg.sentAt, key: `sep-${msg.sentAt.toDateString()}-${i}` });
    }
    listItems.push({ kind: 'message', msg });
  });

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
      const { msg } = item;
      if (msg.type === 'system') {
        return <SystemMessage text={msg.text} />;
      }
      return (
        <MessageBubble
          text={msg.text}
          isMine={msg.senderId === uid}
          senderName={msg.senderId !== uid ? msg.senderName : undefined}
          status={msg.status}
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
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: top + 10 }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={26} color={Colors.textPrimary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerCenter}
          onPress={() => router.push(`/groups/${groupId}`)}
          activeOpacity={0.7}
        >
          <View style={styles.headerAvatar}>
            <Text style={styles.headerAvatarText}>
              {groupName.split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')}
            </Text>
          </View>
          <View>
            <Text style={styles.headerName} numberOfLines={1}>{groupName}</Text>
            {group && (
              <Text style={styles.headerMeta}>{group.members.length} members</Text>
            )}
          </View>
        </TouchableOpacity>
        <View style={{ width: 34 }} />
      </View>

      {!isConnected && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>Offline — messages will send when reconnected</Text>
        </View>
      )}

      <FlatList
        ref={flatRef}
        data={listItems}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.messageList}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Start the conversation! 🌍</Text>
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
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarText: { color: Colors.white, fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  headerName: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  headerMeta: { fontSize: FontSize.xs, color: Colors.textSecondary },
  offlineBanner: {
    backgroundColor: '#F59E0B22',
    borderBottomWidth: 1,
    borderBottomColor: '#F59E0B44',
    padding: Spacing.sm,
  },
  offlineText: { textAlign: 'center', fontSize: FontSize.xs, color: Colors.warning, fontWeight: FontWeight.medium },
  messageList: { paddingVertical: Spacing.md, flexGrow: 1 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80 },
  emptyText: { fontSize: FontSize.md, color: Colors.textSecondary },
});
