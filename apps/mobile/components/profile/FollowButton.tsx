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
            { color: following ? Colors.primary : Colors.white },
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
    minWidth: 100,
    height: 38,
  },
  sm: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: 6,
    minWidth: 80,
    height: 30,
  },
  follow: {
    backgroundColor: Colors.primary,
  },
  following: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  disabled: {
    opacity: 0.6,
  },
  label: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  labelSm: {
    fontSize: FontSize.xs,
  },
  spinner: {
    width: 100,
    height: 38,
  },
  spinnerSm: {
    width: 80,
    height: 30,
  },
});
