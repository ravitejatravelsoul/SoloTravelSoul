import { memo } from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSavePost } from '@/hooks/useSavedPosts';
import { Colors } from '@/constants/theme';

interface Props {
  postId: string;
  size?: number;
}

/** Bookmark toggle: saves the post to the person's Saved Posts, or takes it out again. */
export const SaveButton = memo(function SaveButton({ postId, size = 22 }: Props) {
  const { saved, toggling, toggle } = useSavePost(postId);
  return (
    <TouchableOpacity
      onPress={toggle}
      disabled={toggling}
      activeOpacity={0.7}
      style={styles.btn}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={saved ? 'Remove from saved posts' : 'Save post'}
      accessibilityState={{ selected: saved }}
    >
      <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={size} color={saved ? Colors.primary : Colors.textSecondary} />
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  btn: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32, paddingHorizontal: 4 },
});
