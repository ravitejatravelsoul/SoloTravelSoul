import { memo } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

// Country → gradient pairs (deterministic from country name)
const DEST_GRADIENTS: Array<readonly [string, string]> = [
  ['#1270C2', '#3399DB'],
  ['#F59E0B', '#FBBF24'],
  ['#10B981', '#34D399'],
  ['#8B5CF6', '#A78BFA'],
  ['#EF4444', '#F87171'],
  ['#EC4899', '#F472B6'],
  ['#06B6D4', '#22D3EE'],
];

function gradientForCountry(country: string): readonly [string, string] {
  let hash = 0;
  for (let i = 0; i < country.length; i++) hash = (hash * 31 + country.charCodeAt(i)) | 0;
  return DEST_GRADIENTS[Math.abs(hash) % DEST_GRADIENTS.length];
}

interface Props {
  country: string;
  postCount: number;
  onPress: () => void;
}

export const TrendingDestCard = memo(function TrendingDestCard({ country, postCount, onPress }: Props) {
  const gradient = gradientForCountry(country);

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.88}>
      <LinearGradient
        colors={[gradient[0], gradient[1]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <View style={styles.decCircle} />
        <Ionicons name="location" size={22} color="rgba(255,255,255,0.7)" />
        <Text style={styles.country} numberOfLines={2}>{country}</Text>
        <Text style={styles.postCount}>{postCount} post{postCount !== 1 ? 's' : ''}</Text>
      </LinearGradient>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  card: {
    width: 140,
    borderRadius: Radius.xl,
    overflow: 'hidden',
  },
  gradient: {
    height: 160,
    padding: Spacing.lg,
    justifyContent: 'flex-end',
    gap: 4,
    overflow: 'hidden',
  },
  decCircle: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.08)',
    top: -20,
    right: -20,
  },
  country: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.white,
  },
  postCount: {
    fontSize: FontSize.xs,
    color: 'rgba(255,255,255,0.75)',
  },
});
