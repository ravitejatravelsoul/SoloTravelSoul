import { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Text } from '@/components/ui';
import { getNearbyTraveler } from '@solotravelsoul/firebase';
import { preferencesOf, COMPATIBILITY_NOTICE } from '@solotravelsoul/shared';
import type { NearbyTraveler } from '@solotravelsoul/shared';
import { useAuthStore } from '@/stores/authStore';
import { compareAnswers } from '@/utils/tripSummary';
import { ComparisonList } from './JoinSummary';
import { Colors, Spacing, FontSize, FontWeight } from '@/constants/theme';

/**
 * For the organizer's decision: the requester's travel answers next to the organizer's own, loaded only when
 * the organizer asks (one document read). Approval stays the organizer's call; this only shows what the
 * requester chose to share.
 */
export function RequesterAnswers({ requestorUid }: { requestorUid: string }) {
  const profile = useAuthStore((s) => s.profile);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [record, setRecord] = useState<NearbyTraveler | null | undefined>(undefined);

  useEffect(() => {
    if (!open || record !== undefined) return;
    let active = true;
    setLoading(true);
    getNearbyTraveler(requestorUid).then((r) => { if (active) setRecord(r); }).catch(() => { if (active) setRecord(null); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, record, requestorUid]);

  const comparison = compareAnswers(preferencesOf(profile), record ?? null);

  return (
    <View style={styles.wrap}>
      <TouchableOpacity style={styles.toggle} onPress={() => setOpen((v) => !v)} accessibilityRole="button" accessibilityLabel={open ? 'Hide shared answers' : 'Show shared answers'} activeOpacity={0.7}>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.primary} />
        <Text style={styles.toggleText}>{open ? 'Hide shared answers' : 'Shared answers'}</Text>
      </TouchableOpacity>
      {open && (
        <View style={styles.body}>
          {loading ? <ActivityIndicator size="small" color={Colors.primary} /> : (
            <>
              <ComparisonList comparison={comparison} />
              <Text style={styles.notice}>{COMPATIBILITY_NOTICE}</Text>
              <TouchableOpacity onPress={() => router.push(`/(app)/community/profile/${requestorUid}` as never)} accessibilityRole="link" activeOpacity={0.7}>
                <Text style={styles.link}>View public profile</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: Spacing.sm },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingVertical: Spacing.xs },
  toggleText: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: FontWeight.semibold },
  body: { gap: Spacing.sm, paddingTop: Spacing.xs },
  notice: { fontSize: FontSize.xs, color: Colors.placeholder, lineHeight: 17 },
  link: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: FontWeight.semibold },
});
