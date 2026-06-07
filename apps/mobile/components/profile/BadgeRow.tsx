import { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui';
import { getReputation } from '@solotravelsoul/firebase';
import { BADGE_META } from '@solotravelsoul/shared';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import type { BadgeType, TravelerReputation } from '@solotravelsoul/shared';

interface Props {
  uid: string;
  reputation?: TravelerReputation | null;
}

export function BadgeRow({ uid, reputation: repProp }: Props) {
  const [rep, setRep] = useState<TravelerReputation | null>(repProp ?? null);

  useEffect(() => {
    if (repProp !== undefined) { setRep(repProp); return; }
    if (!uid) return;
    getReputation(uid).then(setRep);
  }, [uid, repProp]);

  const badges: BadgeType[] = rep?.badges ?? [];
  if (badges.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {badges.map((badge) => {
          const meta = BADGE_META[badge];
          return (
            <View key={badge} style={styles.badge}>
              <Ionicons name={meta.icon as never} size={14} color={Colors.primary} />
              <Text style={styles.label}>{meta.label}</Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: Colors.surface,
    paddingVertical: Spacing.sm,
  },
  row: {
    paddingHorizontal: Spacing['2xl'],
    gap: Spacing.sm,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
    backgroundColor: Colors.primary + '10',
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
  },
  label: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.primary,
  },
});
