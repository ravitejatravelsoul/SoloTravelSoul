import { TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Text } from '@/components/ui';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

interface Props {
  following: boolean;
  loading?: boolean;
  toggling?: boolean;
  onToggle: () => void;
  size?: 'sm' | 'md';
}

export function FollowButton({ following, loading, toggling, onToggle, size = 'md' }: Props) {
  const isSmall = size === 'sm';

  if (loading) {
    return (
      <ActivityIndicator
        size="small"
        color={Colors.primary}
        style={isSmall ? styles.spinnerSm : styles.spinner}
      />
    );
  }

  return (
    <TouchableOpacity
      onPress={onToggle}
      disabled={toggling}
      activeOpacity={0.75}
      style={[
        styles.base,
        isSmall ? styles.sm : styles.md,
        following ? styles.following : styles.follow,
        toggling && styles.disabled,
      ]}
    >
      {toggling ? (
        <ActivityIndicator size="small" color={following ? Colors.primary : Colors.white} />
      ) : (
        <Text
          style={[
            styles.label,
            isSmall && styles.labelSm,
            { color: following ? Colors.primaryDark : Colors.white },
          ]}
        >
          {following ? 'Following' : 'Follow'}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  md: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    minWidth: 112,
    minHeight: 44,
  },
  sm: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: 6,
    minWidth: 100,
    minHeight: 40,
  },
  follow: {
    backgroundColor: Colors.primaryDark,
  },
  following: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: Colors.primaryDark,
  },
  disabled: {
    opacity: 0.6,
  },
  label: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    flexShrink: 0,
  },
  labelSm: {
    fontSize: FontSize.sm,
  },
  spinner: {
    width: 112,
    height: 44,
  },
  spinnerSm: {
    width: 100,
    height: 40,
  },
});
