import { Tabs, Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tabBarInsets } from '@/utils/tabBar';
import { TabLabel } from '@/components/ui/TabLabel';
import { useNetworkState } from '@/hooks/useNetworkState';
import { useSyncEngine } from '@/hooks/useSyncEngine';
import { useDirectChats } from '@/hooks/useDirectChats';
import { useAuthStore } from '@/stores/authStore';
import { useChatStore, totalChatUnread } from '@/stores/chatStore';
import { useHaptics } from '@/hooks/useHaptics';
import { Badge, OfflineBanner } from '@/components/ui';
import { Colors } from '@/constants/theme';
import { useDiscoveryReconcile } from '@/hooks/useDiscoveryReconcile';
import { useBlockStore } from '@/stores/blockStore';
import { useEffect, useState } from 'react';
import { getUserProfile } from '@solotravelsoul/firebase';
import { TERMS_VERSION } from '@solotravelsoul/shared';

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
  const { isConnected } = useNetworkState();
  const uid = useAuthStore((s) => s.user?.uid ?? '');
  const initialized = useAuthStore((s) => s.initialized);
  const profile = useAuthStore((s) => s.profile);
  const haptics = useHaptics();
  // A profile read can predate the acceptance that was just saved (sign-up, or accepting on another screen). Before
  // sending someone to the accept-terms screen, read it from the server once for this account.
  const termsMismatch = !!profile && profile.termsAcceptedVersion !== TERMS_VERSION;
  const [termsCheckedFor, setTermsCheckedFor] = useState<string | null>(null);
  useEffect(() => {
    if (!uid || !termsMismatch || termsCheckedFor === uid) return;
    let alive = true;
    getUserProfile(uid)
      .then((fresh) => { if (alive && fresh && useAuthStore.getState().user?.uid === uid) useAuthStore.getState().setProfile(fresh); })
      .catch(() => {})
      .finally(() => { if (alive) setTermsCheckedFor(uid); });
    return () => { alive = false; };
  }, [uid, termsMismatch, termsCheckedFor]);
  // Real bottom inset (system navigation bar / home indicator): the tab bar ends above it.
  const insets = useSafeAreaInsets();
  const { loadBlockList } = useBlockStore();
  // Subscribes and keeps chatStore current for badge counts
  useDirectChats();
  useDiscoveryReconcile();
  // Mounted globally so queued offline changes flush on reconnect/foreground
  // regardless of which screen the user is on (not just trip detail).
  useSyncEngine(uid || undefined);

  useEffect(() => {
    if (uid) loadBlockList(uid);
  }, [uid, loadBlockList]);
  const directChats = useChatStore((s) => s.directChats);
  const groups = useChatStore((s) => s.groups);
  const chatUnread = totalChatUnread(uid, directChats, groups);

  if (!initialized) return null;
  if (!uid) return <Redirect href="/(auth)/login" />;
  // Terms must be accepted before anything can be posted or sent (see app/accept-terms.tsx). Not applied while the profile is still loading.
  if (termsMismatch) return termsCheckedFor === uid ? <Redirect href={"/accept-terms" as never} /> : null;

  return (
    <View style={styles.root}>
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
          ...tabBarInsets(insets.bottom),
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.08,
          shadowRadius: 12,
          elevation: 16,
        },
        // One line that shrinks to fit the tab width (never "Communi…"), following the system text size.
        tabBarLabel: ({ color, children }) => <TabLabel color={color}>{children}</TabLabel>,
        tabBarItemStyle: {
          paddingVertical: 0,
        },
      }}
    >
      {/* ── Visible tabs ─────────────────────────────────────────────── */}
      <Tabs.Screen
        name="home/index"
        options={{
          title: 'Feed',
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
        name="discover"
        options={{
          title: 'Explore',
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
        name="community"
        options={{
          title: 'Community',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? 'people' : 'people-outline'} color={color} focused={focused} />
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
            />
          ),
        }}
      />

      {/* ── Hidden — navigable via push, never shown as tabs ─────────── */}
      {/* Only flat files that live in (app)/ without their own _layout need href:null */}
      <Tabs.Screen name="groups" options={{ href: null }} />
      <Tabs.Screen name="profile/edit" options={{ href: null }} />
      <Tabs.Screen name="profile/privacy" options={{ href: null }} />
      <Tabs.Screen name="profile/preferences" options={{ href: null }} />
      <Tabs.Screen name="profile/safety" options={{ href: null }} />
      <Tabs.Screen name="moderation/index" options={{ href: null }} />
      <Tabs.Screen name="profile/join-requests" options={{ href: null }} />
      <Tabs.Screen name="profile/blocked-users" options={{ href: null }} />
      <Tabs.Screen name="profile/followers" options={{ href: null }} />
      <Tabs.Screen name="profile/following" options={{ href: null }} />
      <Tabs.Screen name="saved-places/index" options={{ href: null }} />
      <Tabs.Screen name="saved-posts/index" options={{ href: null }} />
      {/* Phase 2: Posts & Journals */}
      <Tabs.Screen name="post/create" options={{ href: null }} />
      <Tabs.Screen name="post/[postId]" options={{ href: null }} />
      <Tabs.Screen name="journal/create" options={{ href: null }} />
      <Tabs.Screen name="journal/[journalId]" options={{ href: null }} />
    </Tabs>
      {!isConnected && <OfflineBanner overlay />}
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
