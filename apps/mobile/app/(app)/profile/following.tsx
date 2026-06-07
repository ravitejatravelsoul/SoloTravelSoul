import { useEffect, useState } from 'react';
import { View, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Avatar, EmptyState } from '@/components/ui';
import { FollowButton } from '@/components/profile/FollowButton';
import { useFollowing, useIsFollowing } from '@/hooks/useFollows';
import { getPublicProfile } from '@solotravelsoul/firebase';
import { useAuthStore } from '@/stores/authStore';
import { getUserInitials } from '@solotravelsoul/shared';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/constants/theme';
import type { PublicProfile } from '@solotravelsoul/shared';

function FollowingRow({ followingUid }: { followingUid: string }) {
  const myUid = useAuthStore((s) => s.user?.uid ?? '');
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const { following, toggling, toggle } = useIsFollowing(followingUid);

  useEffect(() => {
    getPublicProfile(followingUid).then(setProfile);
  }, [followingUid]);

  if (!profile) return null;

  const initials = getUserInitials(profile.displayName);

  return (
    <View style={styles.row}>
      <TouchableOpacity
        style={styles.rowLeft}
        onPress={() => router.push(`/(app)/community/profile/${followingUid}` as never)}
        activeOpacity={0.8}
      >
        <Avatar uri={profile.photoURL} initials={initials} size={46} />
        <View style={styles.nameBlock}>
          <Text style={styles.name}>{profile.displayName}</Text>
          {profile.currentCity ? (
            <Text style={styles.city}>{profile.currentCity}</Text>
          ) : null}
        </View>
      </TouchableOpacity>
      {followingUid !== myUid && (
        <FollowButton
          following={following}
          toggling={toggling}
          onToggle={toggle}
          size="sm"
        />
      )}
    </View>
  );
}

export default function FollowingScreen() {
  const { uid } = useLocalSearchParams<{ uid: string }>();
  const targetUid = uid ?? useAuthStore.getState().user?.uid ?? '';
  const { following, loading } = useFollowing(targetUid, 100);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text variant="h3" style={styles.title}>Following</Text>
        <View style={{ width: 24 }} />
      </View>

      <FlatList
        data={following}
        keyExtractor={(item) => item.followingId}
        renderItem={({ item }) => <FollowingRow followingUid={item.followingId} />}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        ListEmptyComponent={
          loading ? null : (
            <EmptyState
              emoji="🌍"
              title="Not following anyone yet"
              subtitle="Explore the community to find travelers to follow."
              actionLabel="Explore"
              onAction={() => router.push('/(app)/discover')}
            />
          )
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
  title: { fontSize: FontSize.lg, fontWeight: FontWeight.semibold },
  list: { padding: Spacing.lg, gap: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    ...Shadow.sm,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  nameBlock: { marginLeft: Spacing.md, flex: 1 },
  name: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  city: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 1 },
  sep: { height: Spacing.sm },
});
