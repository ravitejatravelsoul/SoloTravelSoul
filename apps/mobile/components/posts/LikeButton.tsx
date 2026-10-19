import { memo, useCallback } from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui';
import { Colors, FontSize, FontWeight } from '@/constants/theme';

/** 999, 1.5k, 999.9k, 1M, 2.4M — short enough to sit beside the heart at large text sizes. */
function formatCount(n: number): string {
  if (n < 1000) return String(n);
  const k = Math.round(n / 100) / 10;
  if (k < 1000) return `${k}k`;
  return `${Math.round(n / 100_000) / 10}M`;
}

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
          {formatCount(count)}
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
