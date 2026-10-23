import { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Share,
  Alert,
  Image,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { PressableScale, Celebration, BackButton } from '@/components/ui';
import { useMediaSource } from '@/hooks/useMediaSource';
import { Text, Avatar, Chip, Button } from '@/components/ui';
import { JoinRequestModal } from '@/components/community/JoinRequestModal';
import { JoinSummary } from '@/components/community/JoinSummary';
import { getPublicTrip, subscribePublicTripMembers, getTripJoinRequestStatus, cancelTripJoinRequest, getNearbyTraveler, leavePublicTrip, getOrCreateDirectChat } from '@solotravelsoul/firebase';
import type { PublicTrip, TripMember, RequestStatus, NearbyTraveler } from '@solotravelsoul/shared';
import { useAuthStore } from '@/stores/authStore';
import { Colors, Gradients, Spacing, Radius, FontSize, FontWeight, Fonts, Shadow, TapTarget } from '@/constants/theme';
import { getUserInitials, preferencesOf, isListed } from '@solotravelsoul/shared';

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
  const [organizer, setOrganizer] = useState<NearbyTraveler | null>(null);
  const [leaving, setLeaving] = useState(false);
  const insets = useSafeAreaInsets();
  const mediaSrc = useMediaSource();
  const [coverFailed, setCoverFailed] = useState(false);
  const [celebrate, setCelebrate] = useState(0);

  useEffect(() => {
    if (!tripId) return;
    let unsub: (() => void) | null = null;

    getPublicTrip(tripId).then((t) => {
      setTrip(t);
      setLoading(false);
      if (t) {
        unsub = subscribePublicTripMembers(tripId, setMembers);
        // The organizer's own answers exist only when they chose to share them (public + discoverable + consent).
        if (t.ownerUid !== uid) getNearbyTraveler(t.ownerUid).then(setOrganizer).catch(() => setOrganizer(null));
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
    setCelebrate((n) => n + 1);
  };

  // Cancels on the server (previously only the screen state changed).
  const onRequestCancelled = async () => {
    if (!tripId || !uid) return;
    try {
      await cancelTripJoinRequest(`${tripId}_${uid}`, uid);
      setRequestStatus('cancelled');
    } catch {
      Alert.alert('Not cancelled', 'Could not cancel your request. Please try again.');
    }
  };

  const messageOrganizer = async () => {
    if (!trip || !uid) return;
    try {
      const myName = profile?.name ?? 'Traveler';
      const chatId = await getOrCreateDirectChat(
        uid,
        { name: myName, initials: getUserInitials(myName) || myName[0]?.toUpperCase() || 'T' },
        trip.ownerUid,
        { name: trip.ownerName, initials: getUserInitials(trip.ownerName) || 'T' },
      );
      router.push(`/chats/${chatId}` as never);
    } catch {
      Alert.alert('Could not open chat', 'Please try again.');
    }
  };

  const confirmLeave = () => {
    if (!trip || !uid) return;
    Alert.alert('Leave this trip?', 'You will no longer be a member. You can ask to join again later if the organizer is accepting requests.', [
      { text: 'Stay', style: 'cancel' },
      {
        text: 'Leave trip',
        style: 'destructive',
        onPress: async () => {
          setLeaving(true);
          try {
            await leavePublicTrip(trip.tripId, uid);
            setRequestStatus(null);
            setTrip({ ...trip, memberCount: Math.max(1, trip.memberCount - 1) });
          } catch {
            Alert.alert('Could not leave', 'Please check your connection and try again.');
          } finally {
            setLeaving(false);
          }
        },
      },
    ]);
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
          <Text style={[styles.bodyText, { textAlign: 'center', marginTop: Spacing.sm, paddingHorizontal: Spacing['2xl'] }]}>This trip is no longer available. The organizer may have deleted it or their account.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isOwner = trip.ownerUid === uid;
  const isMember = members.some((m) => m.uid === uid);
  const isPending = requestStatus === 'pending';
  const isFull = trip.maxMembers != null && trip.memberCount >= trip.maxMembers;
  const unavailable = !isListed(trip);

  return (
    <SafeAreaView style={styles.safe} edges={[]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Hero: cover photo (or a warm gradient), floating round buttons, destination and title over a scrim */}
        <View style={[styles.hero, { paddingTop: insets.top + Spacing.sm }]}>
          {trip.coverPhotoURL && !coverFailed ? (
            <Image source={mediaSrc(trip.coverPhotoURL)} style={StyleSheet.absoluteFill} resizeMode="cover" onError={() => setCoverFailed(true)} accessibilityIgnoresInvertColors />
          ) : (
            <LinearGradient colors={Gradients.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill}>
              <Ionicons name="airplane" size={120} color="rgba(255,255,255,0.14)" style={styles.heroArt} />
            </LinearGradient>
          )}
          <LinearGradient colors={Gradients.scrim} style={styles.heroScrim} />
          <View style={styles.heroBar}>
            <PressableScale onPress={() => router.back()} guardMs={400} style={styles.roundBtn} accessibilityRole="button" accessibilityLabel="Go back" hitSlop={6}>
              <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
            </PressableScale>
            <PressableScale
              onPress={() => Alert.alert('Options', undefined, [
                { text: 'Report', onPress: handleReport },
                { text: 'Cancel', style: 'cancel' },
              ])}
              guardMs={400}
              style={styles.roundBtn}
              accessibilityRole="button"
              accessibilityLabel="More options"
              hitSlop={6}
            >
              <Ionicons name="ellipsis-horizontal" size={22} color={Colors.textPrimary} />
            </PressableScale>
          </View>
          <View style={styles.heroText}>
            <View style={styles.heroChip}>
              <Ionicons name="location" size={13} color={Colors.primaryDark} />
              <Text style={styles.heroChipText} numberOfLines={1}>{trip.destination}</Text>
            </View>
            <Text style={styles.heroTitle} accessibilityRole="header">{trip.title || trip.destination}</Text>
            <Text style={styles.heroDates}>{formatDateRange(trip.startDate, trip.endDate)} · {durationDays(trip.startDate, trip.endDate)} days</Text>
          </View>
        </View>

        {/* The join action sits right under the hero, where the decision is made */}
        <View style={styles.actionsCard}>
          {isOwner && unavailable ? (
            <Text style={styles.memberNote}>Requests are paused while this trip is hidden.</Text>
          ) : isOwner ? (
            <Button
              label="Manage Requests"
              onPress={() => router.push(`/(app)/trips/${tripId}/requests` as never)}
              fullWidth
            />
          ) : isMember ? (
            <View style={{ gap: Spacing.sm }}>
              <Text style={styles.memberNote}>You are a member of this trip.</Text>
              <Button label="Message organizer" onPress={messageOrganizer} fullWidth />
              <Button label="Leave trip" variant="secondary" onPress={confirmLeave} loading={leaving} fullWidth />
            </View>
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
          ) : unavailable ? (
            <Button label="Not available" variant="secondary" onPress={() => {}} disabled fullWidth />
          ) : isFull ? (
            <Button label="Trip is Full" variant="secondary" onPress={() => {}} disabled fullWidth />
          ) : !trip.isAcceptingMembers ? (
            <Button label="Not accepting requests" variant="secondary" onPress={() => {}} disabled fullWidth />
          ) : (
            <Button
              label="Request to Join"
              onPress={() => setShowModal(true)}
              fullWidth
            />
          )}
        </View>


        {unavailable && (
          <View style={styles.noticeBox} accessibilityRole="alert">
            <Text style={styles.noticeText}>
              {isOwner
                ? 'A moderator has hidden this trip. It is not shown to other people, takes no new requests and cannot be edited or restored by you. Members can still leave.'
                : 'This trip is currently not available. It takes no new requests.'}
            </Text>
          </View>
        )}

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
              sublabel={isFull ? 'Trip is full' : trip.isAcceptingMembers ? 'Open to join' : 'Not accepting'}
            />
          </View>
          {trip.tags.length > 0 && (
            <View style={styles.tags}>
              {trip.tags.map((t) => <Chip key={t} label={t} />)}
            </View>
          )}
        </Section>

        {/* What to know before asking to join (organizer's expectations, shared answers, safety reminder) */}
        {!isOwner && (
          <Section title={isMember ? 'ABOUT THIS TRIP' : 'BEFORE YOU REQUEST TO JOIN'}>
            <JoinSummary trip={trip} organizer={organizer} viewer={preferencesOf(profile)} />
          </Section>
        )}

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

      <Celebration trigger={celebrate} />

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
      <BackButton />
      <Text style={styles.navTitle}>Trip Details</Text>
      <View style={{ width: 44 }} />
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel} accessibilityRole="header">{title.charAt(0) + title.slice(1).toLowerCase()}</Text>
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
  noticeBox: { marginHorizontal: Spacing.lg, marginTop: Spacing.md, padding: Spacing.md, borderRadius: Radius.md, backgroundColor: Colors.warning + '22', borderWidth: 1, borderColor: Colors.warning + '66' },
  noticeText: { fontSize: FontSize.sm, color: Colors.textPrimary },
  safe: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  navBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.background,
  },
  navTitle: { fontFamily: Fonts.display, fontSize: FontSize.lg, color: Colors.textPrimary, flex: 1, textAlign: 'center' },
  content: { paddingBottom: Spacing['3xl'] },
  hero: {
    minHeight: 300,
    justifyContent: 'space-between',
    backgroundColor: Colors.primaryDark,
    borderBottomLeftRadius: Radius['2xl'],
    borderBottomRightRadius: Radius['2xl'],
    overflow: 'hidden',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing['2xl'],
  },
  heroArt: { position: 'absolute', right: -10, top: 90 },
  heroScrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 190 },
  heroBar: { flexDirection: 'row', justifyContent: 'space-between' },
  roundBtn: { width: TapTarget, height: TapTarget, borderRadius: TapTarget / 2, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', ...Shadow.md },
  heroText: { gap: Spacing.sm, marginTop: Spacing['3xl'] },
  heroChip: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', backgroundColor: Colors.surface, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 5, maxWidth: '100%' },
  heroChipText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.primaryDark, flexShrink: 1 },
  heroTitle: { fontFamily: Fonts.displayHeavy, fontSize: 32, lineHeight: 38, color: Colors.white },
  heroDates: { fontSize: FontSize.md, color: 'rgba(255,255,255,0.92)', fontWeight: FontWeight.medium },
  ownerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    padding: Spacing.lg,
    gap: Spacing.md,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    ...Shadow.sm,
  },
  ownerInfo: { flex: 1 },
  ownerName: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  ownerLabel: { fontSize: FontSize.sm, color: Colors.textSecondary },
  section: { marginHorizontal: Spacing.lg, marginTop: Spacing.xl },
  sectionLabel: { fontFamily: Fonts.display, fontSize: FontSize.lg, color: Colors.textPrimary, marginBottom: Spacing.sm },
  sectionCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.borderLight,
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
  memberNote: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center' },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
});
