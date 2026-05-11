import { memo } from 'react';
import { View, TouchableOpacity, StyleSheet, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Text } from '@/components/ui/Text';
import { Gradients, Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/constants/theme';

export interface TravelCategory {
  id: string;
  label: string;
  emoji: string;
  gradient: readonly [string, string];
  // attraction types in bundled JSON this category maps to
  types: string[];
}

export const TRAVEL_CATEGORIES: TravelCategory[] = [
  { id: 'beach',     label: 'Beach',       emoji: '🏖️', gradient: Gradients.beach,     types: ['Beach'] },
  { id: 'hiking',    label: 'Mountains',   emoji: '⛰️', gradient: Gradients.mountain,  types: ['Hiking', 'National Park', 'Mountain'] },
  { id: 'city',      label: 'City',        emoji: '🏙️', gradient: Gradients.city,      types: ['City', 'Landmark', 'Museum'] },
  { id: 'food',      label: 'Food',        emoji: '🍜', gradient: Gradients.food,      types: ['Food', 'Restaurant', 'Market'] },
  { id: 'adventure', label: 'Adventure',   emoji: '🧗', gradient: Gradients.adventure, types: ['Adventure', 'Outdoor', 'Sports'] },
  { id: 'nightlife', label: 'Nightlife',   emoji: '🌙', gradient: Gradients.nightlife, types: ['Nightlife', 'Bar', 'Entertainment'] },
  { id: 'hidden',    label: 'Hidden Gems', emoji: '💎', gradient: Gradients.hidden,    types: ['Hidden Gem', 'Hidden'] },
  { id: 'solo',      label: 'Solo',        emoji: '🧳', gradient: Gradients.solo,      types: ['Solo', 'Solo-Friendly'] },
];

interface CategoryGridProps {
  selectedId: string | null;
  onSelect: (category: TravelCategory | null) => void;
  style?: ViewStyle;
}

export const CategoryGrid = memo(function CategoryGrid({
  selectedId,
  onSelect,
  style,
}: CategoryGridProps) {
  return (
    <View style={[styles.grid, style]}>
      {TRAVEL_CATEGORIES.map((cat) => {
        const isSelected = selectedId === cat.id;
        return (
          <CategoryTile
            key={cat.id}
            category={cat}
            selected={isSelected}
            onPress={() => onSelect(isSelected ? null : cat)}
          />
        );
      })}
    </View>
  );
});

const CategoryTile = memo(function CategoryTile({
  category,
  selected,
  onPress,
}: {
  category: TravelCategory;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.tile, selected && styles.tileSelected]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <LinearGradient
        colors={selected ? category.gradient : ['#F0F1F3', '#E8EAED']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.tileGradient}
      >
        <Text style={styles.emoji}>{category.emoji}</Text>
      </LinearGradient>
      <Text
        style={[styles.label, selected && styles.labelSelected]}
        numberOfLines={1}
      >
        {category.label}
      </Text>
    </TouchableOpacity>
  );
});

const TILE_SIZE = 72;

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  tile: {
    width: TILE_SIZE,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  tileSelected: {},
  tileGradient: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.sm,
  },
  emoji: {
    fontSize: 28,
  },
  label: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  labelSelected: {
    color: Colors.textPrimary,
    fontWeight: FontWeight.bold,
  },
});
