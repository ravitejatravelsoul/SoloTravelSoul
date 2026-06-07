import { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Skeleton } from '@/components/ui';
import { TravelGroupCard } from '@/components/community/TravelGroupCard';
import { subscribePublicTravelGroups } from '@solotravelsoul/firebase';
import type { CommunityGroup } from '@solotravelsoul/shared';
import { useBlockStore } from '@/stores/blockStore';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

export default function TravelGroupsScreen() {
  const [groups, setGroups] = useState<CommunityGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [acceptingOnly, setAcceptingOnly] = useState(false);
  const { blockedUids } = useBlockStore();
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (unsubRef.current) unsubRef.current();
    setLoading(true);
    const unsub = subscribePublicTravelGroups(
      { destination: search || undefined, acceptingOnly },
      20,
      (g) => { setGroups(g); setLoading(false); }
    );
    unsubRef.current = unsub;
    return () => { if (unsubRef.current) unsubRef.current(); };
  }, [search, acceptingOnly]);

  const visible = groups.filter((g) => !blockedUids.includes(g.ownerUid));

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Travel Groups</Text>
        <TouchableOpacity onPress={() => router.push('/(app)/community/groups/create' as never)} hitSlop={12}>
          <Ionicons name="add" size={26} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.filterBar}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={16} color={Colors.placeholder} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search destination…"
            placeholderTextColor={Colors.placeholder}
          />
        </View>
        <View style={styles.filterRow}>
          <Text style={styles.filterLabel}>Open to join</Text>
          <Switch value={acceptingOnly} onValueChange={setAcceptingOnly} trackColor={{ false: Colors.border, true: Colors.primary }} thumbColor={Colors.white} />
        </View>
      </View>

      {loading && visible.length === 0 ? (
        <View style={styles.list}>
          {[1, 2, 3].map((k) => <Skeleton key={k} style={styles.skeleton} />)}
        </View>
      ) : visible.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="people-outline" size={56} color={Colors.placeholder} />
          <Text style={styles.emptyTitle}>No travel groups found</Text>
          <Text style={styles.emptySubtitle}>Be the first to create a group!</Text>
          <TouchableOpacity
            style={styles.createBtn}
            onPress={() => router.push('/(app)/community/groups/create' as never)}
            activeOpacity={0.7}
          >
            <Text style={styles.createBtnLabel}>Create a Group</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(g) => g.groupId}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.md }} />}
          renderItem={({ item }) => (
            <TravelGroupCard
              group={item}
              onPress={() => router.push(`/(app)/community/groups/${item.groupId}` as never)}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  navBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  navTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  filterBar: {
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.sm,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
    height: 40,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: { flex: 1, fontSize: FontSize.md, color: Colors.textPrimary },
  filterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  filterLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.textPrimary },
  list: { padding: Spacing.lg },
  skeleton: { height: 130, borderRadius: Radius.lg, marginBottom: Spacing.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing['2xl'], gap: Spacing.md },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.semibold, color: Colors.textPrimary, textAlign: 'center' },
  emptySubtitle: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center' },
  createBtn: { paddingVertical: Spacing.sm, paddingHorizontal: Spacing.lg, backgroundColor: Colors.primary, borderRadius: Radius.lg },
  createBtnLabel: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.white },
});
