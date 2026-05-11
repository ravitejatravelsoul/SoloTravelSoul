import { View, type ViewProps, StyleSheet } from 'react-native';
import { Colors, Radius, Spacing, Shadow } from '@/constants/theme';


type Elevation = 'flat' | 'sm' | 'md';

interface CardProps extends ViewProps {
  elevation?: Elevation;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export function Card({
  elevation = 'md',
  padding = 'md',
  style,
  children,
  ...props
}: CardProps) {
  return (
    <View
      style={[
        styles.base,
        elevation !== 'flat' ? Shadow[elevation] : undefined,
        paddingStyle[padding],
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
});

const paddingStyle = StyleSheet.create({
  none: { padding: 0 },
  sm: { padding: Spacing.sm },
  md: { padding: Spacing.lg },
  lg: { padding: Spacing['2xl'] },
});
