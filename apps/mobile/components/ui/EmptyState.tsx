import { View, StyleSheet, ActivityIndicator, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { Button } from './Button';
import { Colors, Spacing } from '@/constants/theme';

type EmptyVariant = 'empty' | 'error' | 'offline' | 'loading';

interface EmptyStateProps {
  emoji?: string;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  variant?: EmptyVariant;
  retrying?: boolean;
  style?: ViewStyle;
}

const VARIANT_DEFAULTS: Record<EmptyVariant, { icon?: string; iconColor: string; defaultEmoji: string }> = {
  empty:   { iconColor: Colors.placeholder,    defaultEmoji: '🗺️' },
  error:   { icon: 'alert-circle-outline',     iconColor: Colors.error,   defaultEmoji: '⚠️' },
  offline: { icon: 'cloud-offline-outline',    iconColor: Colors.textSecondary, defaultEmoji: '📡' },
  loading: { iconColor: Colors.primary,        defaultEmoji: '⏳' },
};

export function EmptyState({
  emoji,
  title,
  subtitle,
  actionLabel,
  onAction,
  variant = 'empty',
  retrying = false,
  style,
}: EmptyStateProps) {
  const { icon, iconColor, defaultEmoji } = VARIANT_DEFAULTS[variant];

  return (
    <View style={[styles.container, style]}>
      {variant === 'loading' ? (
        <ActivityIndicator size="large" color={Colors.primary} style={styles.loader} />
      ) : icon ? (
        <View style={[styles.badge, { backgroundColor: variant === 'error' ? Colors.coralSoft : Colors.chipBackground }]}>
          <Ionicons name={icon as never} size={44} color={iconColor} />
        </View>
      ) : (
        <View style={styles.badge}><Text style={styles.emoji}>{emoji ?? defaultEmoji}</Text></View>
      )}

      <Text variant="h3" center style={variant === 'error' ? styles.errorTitle : undefined}>
        {title}
      </Text>

      {subtitle ? (
        <Text variant="caption" center style={styles.subtitle}>{subtitle}</Text>
      ) : null}

      {actionLabel && onAction ? (
        <Button
          label={retrying ? 'Retrying…' : actionLabel}
          onPress={onAction}
          loading={retrying}
          variant={variant === 'error' ? 'danger' : 'primary'}
          style={styles.action}
          size="md"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    padding: Spacing['3xl'],
  },
  loader: { marginBottom: Spacing.sm },
  badge: { width: 104, height: 104, borderRadius: 52, backgroundColor: Colors.chipBackground, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 48, lineHeight: 60 },
  errorTitle: { color: Colors.error },
  subtitle: { lineHeight: 20, maxWidth: 280, textAlign: 'center' },
  action: { marginTop: Spacing.sm, minWidth: 160 },
});
