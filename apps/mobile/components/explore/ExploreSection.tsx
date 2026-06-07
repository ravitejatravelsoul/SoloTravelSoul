import { memo } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui';
import { Colors, Spacing, FontSize, FontWeight } from '@/constants/theme';

interface Props {
  title: string;
  icon?: string;
  onSeeAll?: () => void;
  children: React.ReactNode;
  horizontal?: boolean;
}

export const ExploreSection = memo(function ExploreSection({
  title,
  icon,
  onSeeAll,
  children,
  horizontal = true,
}: Props) {
  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          {icon ? <Ionicons name={icon as never} size={18} color={Colors.primary} /> : null}
          <Text style={styles.title}>{title}</Text>
        </View>
        {onSeeAll ? (
          <TouchableOpacity onPress={onSeeAll} hitSlop={8}>
            <Text style={styles.seeAll}>See all</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {horizontal ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={styles.col}>{children}</View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  section: { marginBottom: Spacing['2xl'] },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing['2xl'],
    marginBottom: Spacing.md,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  seeAll: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: FontWeight.medium },
  row: { paddingHorizontal: Spacing['2xl'], gap: Spacing.md },
  col: { paddingHorizontal: Spacing['2xl'], gap: Spacing.md },
});
