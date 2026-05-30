import { View, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Text } from '@/components/ui';
import { Colors, Gradients, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/constants/theme';
import type { BundledAttraction } from '@solotravelsoul/shared';

const TYPE_COLOR: Record<string, string> = {
  Beach: '#F59E0B',
  Hiking: '#6366F1',
  City: '#1270C2',
  Food: '#EF4444',
  Adventure: '#10B981',
  Nightlife: '#8B5CF6',
  'Hidden Gem': '#F97316',
  Solo: '#06B6D4',
};

interface Props {
  attractions: BundledAttraction[];
  totalCount: number;
}

export function MapPlaceholder({ attractions, totalCount }: Props) {
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Gradient map hero ── */}
      <LinearGradient
        colors={Gradients.hero}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        {/* Decorative circles — give depth/map-grid feel */}
        <View style={styles.decCircle1} />
        <View style={styles.decCircle2} />
        <View style={styles.decCircle3} />

        {/* Horizontal grid lines */}
        <View style={[styles.gridLine, { top: 60 }]} />
        <View style={[styles.gridLine, { top: 120 }]} />
        <View style={[styles.gridLine, { top: 180 }]} />

        {/* Content */}
        <View style={styles.heroInner}>
          <View style={styles.pinWrap}>
            <Ionicons name="location" size={54} color={Colors.white} />
          </View>
          <Text style={styles.heroTitle}>Map View</Text>
          <Text style={styles.heroSub}>
            {totalCount} attraction{totalCount !== 1 ? 's' : ''} ready to explore
          </Text>

          <View style={styles.statRow}>
            <StatBadge icon="map-outline" label="Interactive map" />
            <StatBadge icon="pin-outline" label="Clustered pins" />
            <StatBadge icon="navigate-outline" label="Near me" />
          </View>
        </View>
      </LinearGradient>

      {/* ── Status card ── */}
      <View style={styles.statusCard}>
        <View style={styles.statusRow}>
          <View style={styles.statusIconBox}>
            <Ionicons name="map-outline" size={18} color={Colors.primary} />
          </View>
          <View style={styles.statusText}>
            <Text style={styles.statusTitle}>Map temporarily unavailable</Text>
            <Text style={styles.statusBody}>
              Switch to{' '}
              <Text style={styles.inline}>List</Text> to browse all{' '}
              {totalCount} attractions now.
            </Text>
          </View>
        </View>
      </View>

      {/* ── Pin preview list ── */}
      <Text style={styles.previewLabel}>ATTRACTION PINS PREVIEW</Text>

      {attractions.slice(0, 8).map((a, i) => (
        <PinPreviewRow key={a.id} attraction={a} index={i + 1} />
      ))}

      {attractions.length > 8 && (
        <Text style={styles.moreLabel}>
          +{attractions.length - 8} more — switch to List to see all
        </Text>
      )}
    </ScrollView>
  );
}

function StatBadge({ icon, label }: { icon: string; label: string }) {
  return (
    <View style={styles.statBadge}>
      <Ionicons name={icon as never} size={12} color="rgba(255,255,255,0.8)" />
      <Text style={styles.statBadgeText}>{label}</Text>
    </View>
  );
}

function PinPreviewRow({
  attraction,
  index,
}: {
  attraction: BundledAttraction;
  index: number;
}) {
  const pinColor = TYPE_COLOR[attraction.type] ?? Colors.primary;
  return (
    <View style={styles.pinRow}>
      <View style={[styles.pinDot, { backgroundColor: pinColor }]}>
        <Text style={styles.pinIndex}>{index}</Text>
      </View>
      <View style={styles.pinInfo}>
        <Text style={styles.pinName} numberOfLines={1}>
          {attraction.name}
        </Text>
        <Text style={styles.pinMeta} numberOfLines={1}>
          {[attraction.city, attraction.state].filter(Boolean).join(', ')}
        </Text>
      </View>
      <View style={[styles.pinType, { backgroundColor: pinColor + '18' }]}>
        <Text style={[styles.pinTypeText, { color: pinColor }]}>
          {attraction.type}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { paddingBottom: Spacing['4xl'] },

  // Hero
  hero: {
    height: 260,
    overflow: 'hidden',
    position: 'relative',
  },
  decCircle1: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    top: -80,
    right: -60,
  },
  decCircle2: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    bottom: -40,
    left: -30,
  },
  decCircle3: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.04)',
    top: 30,
    left: 40,
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  heroInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingTop: Spacing.md,
  },
  pinWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  heroTitle: {
    fontSize: FontSize['2xl'],
    lineHeight: 30,
    fontWeight: FontWeight.bold,
    color: Colors.white,
  },
  heroSub: {
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.72)',
    lineHeight: 20,
  },
  statRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  statBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  statBadgeText: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: FontWeight.medium,
  },

  // Status card
  statusCard: {
    margin: Spacing.lg,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: Spacing.md,
    ...Shadow.sm,
  },
  statusRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    alignItems: 'flex-start',
  },
  statusIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.primary + '14',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  statusText: { flex: 1, gap: 4 },
  statusTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    lineHeight: 22,
  },
  statusBody: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  inline: {
    fontWeight: FontWeight.semibold,
    color: Colors.primary,
  },
  devBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primary + '0D',
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.primary + '25',
  },
  devBadgeText: {
    fontSize: FontSize.xs,
    color: Colors.primary,
    fontWeight: FontWeight.medium,
    flex: 1,
  },

  // Pin preview list
  previewLabel: {
    fontSize: 11,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
    letterSpacing: 0.7,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  pinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  pinDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  pinIndex: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.white,
    lineHeight: 16,
  },
  pinInfo: { flex: 1, gap: 2 },
  pinName: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  pinMeta: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  pinType: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  pinTypeText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
  },

  moreLabel: {
    fontSize: FontSize.sm,
    color: Colors.placeholder,
    textAlign: 'center',
    marginTop: Spacing.md,
  },
});
