import { FlatList, View, StyleSheet, TouchableOpacity } from 'react-native';
import { Screen, Text, Card } from '@/components/ui';
import { useNotifications } from '@/hooks/useNotifications';
import { Colors, Spacing, Radius } from '@/constants/theme';

export default function NotificationsScreen() {
  const { notifications, markRead } = useNotifications();

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <Text variant="h2">Notifications</Text>
      </View>

      {notifications.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ fontSize: 48 }}>🔔</Text>
          <Text variant="h3" center>No notifications yet</Text>
          <Text variant="caption" center>You'll see group activity and updates here.</Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(n) => n.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => !item.isRead && markRead(item.id)}
              activeOpacity={0.8}
            >
              <Card
                elevation="sm"
                style={[styles.card, !item.isRead && styles.unread]}
              >
                {!item.isRead && <View style={styles.dot} />}
                <View style={styles.content}>
                  <Text variant="label">{item.title}</Text>
                  <Text variant="caption">{item.message}</Text>
                  <Text variant="caption" color={Colors.placeholder}>
                    {item.createdAt.toLocaleDateString()}
                  </Text>
                </View>
              </Card>
            </TouchableOpacity>
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { padding: Spacing.lg, paddingTop: Spacing['2xl'] },
  list: { padding: Spacing.lg, gap: Spacing.md },
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  unread: { borderColor: Colors.primary },
  dot: {
    width: 8,
    height: 8,
    borderRadius: Radius.full,
    backgroundColor: Colors.primary,
    marginTop: 6,
  },
  content: { flex: 1, gap: 2 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.lg,
    padding: Spacing['2xl'],
  },
});
