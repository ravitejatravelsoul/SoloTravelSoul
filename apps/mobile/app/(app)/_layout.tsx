import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, StyleSheet } from 'react-native';
import { useNotifications } from '@/hooks/useNotifications';
import { useNetworkState } from '@/hooks/useNetworkState';
import { useDirectChats } from '@/hooks/useDirectChats';
import { useAuthStore } from '@/stores/authStore';
import { useChatStore, totalChatUnread } from '@/stores/chatStore';
import { useHaptics } from '@/hooks/useHaptics';
import { Badge, OfflineBanner } from '@/components/ui';
import { Colors } from '@/constants/theme';

const ICON_SIZE = 26;

type IoniconsName = keyof typeof Ionicons.glyphMap;

function TabIcon({
  name,
  color,
  focused,
  badge,
}: {
  name: IoniconsName;
  color: string;
  focused: boolean;
  badge?: number;
}) {
  return (
    <View style={[styles.iconPill, focused && styles.iconPillActive]}>
      <Ionicons name={name} size={ICON_SIZE} color={color} />
      {badge ? (
        <View style={styles.badgeWrap}>
          <Badge count={badge} />
        </View>
      ) : null}
    </View>
  );
}

export default function AppLayout() {
  const { unreadCount } = useNotifications();
  const { isConnected } = useNetworkState();
  const uid = useAuthStore((s) => s.user?.uid ?? '');
  const haptics = useHaptics();
  // Subscribes and keeps chatStore current for badge counts
  useDirectChats();
  const directChats = useChatStore((s) => s.directChats);
  const groups = useChatStore((s) => s.groups);
  const chatUnread = totalChatUnread(uid, directChats, groups);

  return (
    <View style={styles.root}>
      {!isConnected && <OfflineBanner />}
      <Tabs
      screenListeners={{ tabPress: () => haptics.selection() }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: '#6B7280',
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopWidth: 0,
          height: 72,
          paddingTop: 6,
          paddingBottom: 8,
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.08,
          shadowRadius: 12,
          elevation: 16,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          letterSpacing: 0.2,
          marginTop: 2,
        },
        tabBarItemStyle: {
          paddingVertical: 0,
        },
      }}
    >
      {/* ── Visible tabs ─────────────────────────────────────────────── */}
      <Tabs.Screen
        name="home/index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? 'home' : 'home-outline'} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="trips"
        options={{
          title: 'Trips',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? 'map' : 'map-outline'} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="discover/index"
        options={{
          title: 'Discover',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? 'compass' : 'compass-outline'} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          title: 'Chats',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              name={focused ? 'chatbubbles' : 'chatbubbles-outline'}
              color={color}
              focused={focused}
              badge={chatUnread > 0 ? chatUnread : undefined}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile/index"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              name={focused ? 'person-circle' : 'person-circle-outline'}
              color={color}
              focused={focused}
              badge={unreadCount > 0 ? unreadCount : undefined}
            />
          ),
        }}
      />

      {/* ── Hidden — navigable via push, never shown as tabs ─────────── */}
      <Tabs.Screen name="groups" options={{ href: null }} />
      <Tabs.Screen name="notifications/index" options={{ href: null }} />
      <Tabs.Screen name="profile/edit" options={{ href: null }} />
      <Tabs.Screen name="saved-places/index" options={{ href: null }} />
    </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  iconPill: {
    width: 56,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPillActive: {
    backgroundColor: 'rgba(18,112,194,0.12)',
  },
  badgeWrap: {
    position: 'absolute',
    top: 0,
    right: 2,
  },
});
