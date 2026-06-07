import { memo, useCallback } from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui';
import { Colors, FontSize, FontWeight } from '@/constants/theme';

interface Props {
  liked: boolean;
  count: number;
  onToggle: () => void;
  disabled?: boolean;
  size?: number;
}

export const LikeButton = memo(function LikeButton({ liked, count, onToggle, disabled, size = 22 }: Props) {
  return (
    <TouchableOpacity
      onPress={onToggle}
      disabled={disabled}
      activeOpacity={0.7}
      style={styles.btn}
      hitSlop={8}
    >
      <Ionicons
        name={liked ? 'heart' : 'heart-outline'}
        size={size}
        color={liked ? '#EF4444' : Colors.textSecondary}
      />
      {count > 0 && (
        <Text style={[styles.count, liked && styles.countLiked]}>
          {count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count)}
        </Text>
      )}
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  count: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    color: Colors.textSecondary,
  },
  countLiked: {
    color: '#EF4444',
  },
});
