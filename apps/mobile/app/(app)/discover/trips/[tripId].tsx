import { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Share,
  Alert,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Avatar, Chip, Button } from '@/components/ui';
import { JoinRequestModal } from '@/components/community/JoinRequestModal';
import { getPublicTrip, getPublicProfile, subscribePublicTripMembers, getTripJoinRequestStatus } from '@solotravelsoul/firebase';
import type { PublicTrip, TripMember, RequestStatus } from '@solotravelsoul/shared';
import { useAuthStore } from '@/stores/authStore';
import { Colors, Spacing, Radius, FontSize, FontWeight, Shadow } from '@/constants/theme';
import { getUserInitials } from '@solotravelsoul/shared';

function formatDateRange(start: Date, end: Date): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
  return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}`;
}

function durationDays(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

export default function PublicTripDetailScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const uid = useAuthStore((s) => s.user?.uid ?? '');
  const profile = useAuthStore((s) => s.profile);

  const [trip, setTrip] = useState<PublicTrip | null>(null);
  const [members, setMembers] = useState<TripMember[]>([]);
  const [requestStatus, setRequestStatus] = useState<RequestStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (!tripId) return;
    let unsub: (() => void) | null = null;

    getPublicTrip(tripId).then((t) => {
      setTrip(t);
      setLoading(false);
      if (t) {
        unsub = subscribePublicTripMembers(tripId, setMembers);
      }
    }).catch(() => setLoading(false));

    getTripJoinRequestStatus(tripId, uid).then(setRequestStatus).catch(() => {});

    return () => { if (unsub) unsub(); };
  }, [tripId, uid]);

  const handleShare = async () => {
    if (!trip) return;
    await Share.share({ message: `Check out this trip: ${trip.title || trip.destination} – ${trip.destination}` });
  };

  const handleReport = () => {
    router.push({ pathname: '/(app)/community/report', params: { targetType: 'trip', targetId: tripId } } as never);
  };

  const onRequestSubmitted = () => {
    setRequestStatus('pending');
    setShowModal(false);
  };

  const onRequestCancelled = () => {
    setRequestStatus('cancelled');
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <NavBar />
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      </SafeAreaView>
    );
  }

  if (!trip) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <NavBar />
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Trip not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isOwner = trip.ownerUid === uid;
  const isMember = members.some((m) => m.uid === uid);
  const isPending = requestStatus === 'pending';
  const isFull = trip.maxMembers != null && trip.memberCount >= trip.maxMembers;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.navTitle} numberOfLines={1}>{trip.destination}</Text>
        <TouchableOpacity onPress={() => Alert.alert('Options', undefined, [
          { text: 'Report', onPress: handleReport },
          { text: 'Cancel', style: 'cancel' },
        ])} hitSlop={12}>
          <Ionicons name="ellipsis-horizontal" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Gradient hero */}
        <View style={styles.hero}>
          <Text style={styles.heroDestination}>{trip.destination}</Text>
          <Text style={styles.heroTitle}>{trip.title || trip.destination}</Text>
        </View>

        {/* Owner card */}
        <TouchableOpacity
          style={styles.ownerCard}
          onPress={() => router.push(`/(app)/community/profile/${trip.ownerUid}` as never)}
          activeOpacity={0.7}
        >
          <Avatar uri={trip.ownerPhotoURL} initials={getUserInitials(trip.ownerName)} size={44} />
          <View style={styles.ownerInfo}>
            <Text style={styles.ownerName}>{trip.ownerName}</Text>
            <Text style={styles.ownerLabel}>Trip organizer</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={Colors.placeholder} />
        </TouchableOpacity>

        {/* About */}
        {trip.description ? (
          <Section title="ABOUT THIS TRIP">
            <Text style={styles.bodyText}>{trip.description}</Text>
          </Section>
        ) : null}

        {/* Trip details */}
        <Section title="TRIP DETAILS">
          <View style={styles.detailsGrid}>
            <DetailRow icon="calendar-outline" label={formatDateRange(trip.startDate, trip.endDate)} sublabel={`${durationDays(trip.startDate, trip.endDate)} days`} />
            <DetailRow
              icon="people-outline"
              label={trip.maxMembers ? `${trip.memberCount} / ${trip.maxMembers} members` : `${trip.memberCount} member${trip.memberCount !== 1 ? 's' : ''}`}
              sublabel={trip.isAcceptingMembers ? 'Open to join' : 'Not accepting'}
            />
          </View>
          {trip.tags.length > 0 && (
            <View style={styles.tags}>
              {trip.tags.map((t) => <Chip key={t} label={t} />)}
            </View>
          )}
        </Section>

        {/* Members */}
        {members.length > 0 && (
          <Section title="MEMBERS">
            <View style={styles.membersRow}>
              {members.slice(0, 5).map((m) => (
                <Avatar
                  key={m.uid}
                  uri={m.photoURL}
                  initials={getUserInitials(m.displayName)}
                  size={38}
                />
              ))}
              {members.length > 5 && (
                <View style={styles.moreMembers}>
                  <Text style={styles.moreMembersText}>+{members.length - 5}</Text>
                </View>
              )}
            </View>
          </Section>
        )}

        {/* Actions */}
        <View style={styles.actionsCard}>
          {isOwner ? (
            <Button
              label="Manage Requests"
              onPress={() => router.push(`/(app)/trips/${tripId}/requests` as never)}
              fullWidth
            />
          ) : isMember ? (
            <Button label="View Trip" variant="secondary" onPress={() => router.push(`/(app)/trips/${tripId}` as never)} fullWidth />
          ) : isPending ? (
            <Button
              label="Request Pending — Cancel?"
              variant="secondary"
              onPress={() => Alert.alert('Cancel request?', undefined, [
                { text: 'Keep it', style: 'cancel' },
                { text: 'Cancel request', style: 'destructive', onPress: onRequestCancelled },
              ])}
              fullWidth
            />
          ) : isFull ? (
            <Button label="Trip is Full" variant="secondary" onPress={() => {}} disabled fullWidth />
          ) : (
            <Button
              label="Request to Join"
              onPress={() => setShowModal(true)}
              fullWidth
            />
          )}
        </View>

        <View style={styles.secondaryActions}>
          <TouchableOpacity style={styles.secondaryBtn} onPress={handleShare} activeOpacity={0.7}>
            <Ionicons name="share-outline" size={18} color={Colors.textSecondary} />
            <Text style={styles.secondaryBtnLabel}>Share</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={handleReport} activeOpacity={0.7}>
            <Ionicons name="flag-outline" size={18} color={Colors.textSecondary} />
            <Text style={styles.secondaryBtnLabel}>Report</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {showModal && profile && (
        <JoinRequestModal
          trip={trip}
          requestor={profile}
          onClose={() => setShowModal(false)}
          onSubmitted={onRequestSubmitted}
        />
      )}
    </SafeAreaView>
  );
}

function NavBar() {
  return (
    <View style={styles.navBar}>
      <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
        <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
      </TouchableOpacity>
      <Text style={styles.navTitle}>Trip Details</Text>
      <View style={{ width: 24 }} />
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

function DetailRow({ icon, label, sublabel }: { icon: string; label: string; sublabel?: string }) {
  return (
    <View style={styles.detailRow}>
      <Ionicons name={icon as never} size={18} color={Colors.primary} />
      <View>
        <Text style={styles.detailLabel}>{label}</Text>
        {sublabel ? <Text style={styles.detailSublabel}>{sublabel}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  navBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  navTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, flex: 1, textAlign: 'center' },
  content: { paddingBottom: Spacing['3xl'] },
  hero: {
    backgroundColor: Colors.primary,
    padding: Spacing['2xl'],
    paddingTop: Spacing['3xl'],
    gap: Spacing.sm,
  },
  heroDestination: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.75)', fontWeight: FontWeight.semibold },
  heroTitle: { fontSize: FontSize['2xl'], fontWeight: FontWeight.bold, color: Colors.white, lineHeight: 32 },
  ownerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: Spacing.lg,
    gap: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  ownerInfo: { flex: 1 },
  ownerName: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  ownerLabel: { fontSize: FontSize.sm, color: Colors.textSecondary },
  section: { marginHorizontal: Spacing.lg, marginTop: Spacing.xl },
  sectionLabel: { fontSize: 11, fontWeight: FontWeight.bold, color: Colors.textSecondary, letterSpacing: 0.7, marginBottom: Spacing.sm },
  sectionCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    gap: Spacing.md,
    ...Shadow.sm,
  },
  bodyText: { fontSize: FontSize.md, color: Colors.textSecondary, lineHeight: 22 },
  detailsGrid: { gap: Spacing.md },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  detailLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.textPrimary },
  detailSublabel: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  membersRow: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  moreMembers: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: Colors.chipBackground,
    alignItems: 'center', justifyContent: 'center',
  },
  moreMembersText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textSecondary },
  actionsCard: { marginHorizontal: Spacing.lg, marginTop: Spacing.xl },
  secondaryActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing['2xl'],
    marginTop: Spacing.lg,
  },
  secondaryBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, padding: Spacing.sm },
  secondaryBtnLabel: { fontSize: FontSize.sm, color: Colors.textSecondary },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
});
