/**
 * StoryRing — feature-flagged story indicator around an Avatar.
 * Only renders when EXPO_PUBLIC_STORIES_ENABLED === 'true'.
 */
import { memo } from 'react';
import { View, StyleSheet } from 'react-native';

const STORIES_ENABLED = process.env.EXPO_PUBLIC_STORIES_ENABLED === 'true';

interface Props {
  hasStory?: boolean;
  seen?: boolean;
  size?: number;
  children: React.ReactNode;
}

export const StoryRing = memo(function StoryRing({ hasStory, seen, size = 80, children }: Props) {
  if (!STORIES_ENABLED || !hasStory) return <>{children}</>;

  const ringSize = size + 6;

  return (
    <View
      style={[
        styles.ring,
        {
          width: ringSize,
          height: ringSize,
          borderRadius: ringSize / 2,
          borderColor: seen ? '#D1D5DB' : '#1270C2',
        },
      ]}
    >
      {children}
    </View>
  );
});

const styles = StyleSheet.create({
  ring: {
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
