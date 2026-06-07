import { View, StyleSheet, FlatList, TouchableOpacity, Alert } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@/components/ui';
import { useBlockStore } from '@/stores/blockStore';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

export default function BlockedUsersScreen() {
  const { blockedUids, unblockUser } = useBlockStore();

  const handleUnblock = (uid: string) => {
    Alert.alert('Unblock this user?', 'They will be able to see your profile again.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Unblock', onPress: () => unblockUser(uid) },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Blocked Users</Text>
        <View style={{ width: 24 }} />
      </View>

      {blockedUids.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="checkmark-circle-outline" size={52} color={Colors.success} />
          <Text style={styles.emptyTitle}>No blocked users</Text>
          <Text style={styles.emptySubtitle}>Users you block will appear here.</Text>
        </View>
      ) : (
        <FlatList
          data={blockedUids}
          keyExtractor={(uid) => uid}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.divider} />}
          renderItem={({ item: uid }) => (
            <View style={styles.row}>
              <View style={styles.iconBox}>
                <Ionicons name="person-outline" size={20} color={Colors.textSecondary} />
              </View>
              <Text style={styles.uidText} numberOfLines={1}>{uid}</Text>
              <TouchableOpacity onPress={() => handleUnblock(uid)} style={styles.unblockBtn} activeOpacity={0.7}>
                <Text style={styles.unblockLabel}>Unblock</Text>
              </TouchableOpacity>
            </View>
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing['2xl'], gap: Spacing.md },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  emptySubtitle: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center' },
  list: { backgroundColor: Colors.surface, marginTop: Spacing.lg, marginHorizontal: Spacing.lg, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  divider: { height: 1, backgroundColor: Colors.borderLight, marginLeft: 56 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.lg },
  iconBox: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.chipBackground, alignItems: 'center', justifyContent: 'center' },
  uidText: { flex: 1, fontSize: FontSize.sm, color: Colors.textSecondary },
  unblockBtn: { paddingVertical: 6, paddingHorizontal: Spacing.md, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.primary },
  unblockLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.primary },
});
