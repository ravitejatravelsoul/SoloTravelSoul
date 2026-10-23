import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';

import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, EmptyState, BackButton } from '@/components/ui';
import { PhotoGrid } from '@/components/profile/PhotoGrid';
import { useSavedPosts } from '@/hooks/useSavedPosts';
import { Colors, Spacing, FontSize, Fonts } from '@/constants/theme';

export default function SavedPostsScreen() {
  const { posts, loading } = useSavedPosts(100);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <BackButton />
        <Text style={styles.title}>Saved Posts</Text>
        <View style={{ width: 44 }} />
      </View>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : posts.length > 0 ? (
        <PhotoGrid posts={posts} includeTextOnly />
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
    backgroundColor: Colors.background,
  },
  title: { fontFamily: Fonts.display, fontSize: FontSize.lg, color: Colors.textPrimary },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
