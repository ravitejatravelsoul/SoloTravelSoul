import { View, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, EmptyState } from '@/components/ui';
import { PhotoGrid } from '@/components/profile/PhotoGrid';
import { useSavedPosts } from '@/hooks/useSavedPosts';
import { Colors, Spacing, FontSize, FontWeight } from '@/constants/theme';

export default function SavedPostsScreen() {
  const { posts, loading } = useSavedPosts(100);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Saved Posts</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : posts.length > 0 ? (
        <PhotoGrid posts={posts} />
      ) : (
        <EmptyState
          emoji="🔖"
          title="No saved posts yet"
          subtitle="Tap the bookmark icon on any post to save it here."
          actionLabel="Explore Posts"
          onAction={() => router.push('/(app)/discover')}
        />
      )}
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
  title: { fontSize: FontSize.lg, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
