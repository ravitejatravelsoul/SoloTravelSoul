import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text, Avatar } from '@/components/ui';
import type { TripJoinRequest, RequestStatus } from '@solotravelsoul/shared';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';

const STATUS_CONFIG: Record<RequestStatus, { label: string; color: string; icon: string }> = {
  pending: { label: 'Pending', color: Colors.warning, icon: 'time-outline' },
  approved: { label: 'Approved', color: Colors.success, icon: 'checkmark-circle' },
  rejected: { label: 'Rejected', color: Colors.error, icon: 'close-circle' },
  cancelled: { label: 'Cancelled', color: Colors.placeholder, icon: 'ban-outline' },
};

function timeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface SentCardProps {
  request: TripJoinRequest;
  onCancel?: () => void;
  onViewTrip?: () => void;
}

export function SentRequestCard({ request, onCancel, onViewTrip }: SentCardProps) {
  const config = STATUS_CONFIG[request.status];
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="map-outline" size={16} color={Colors.primary} />
          <Text style={styles.tripTitle} numberOfLines={1}>{request.tripTitle}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: config.color + '18' }]}>
          <Ionicons name={config.icon as never} size={12} color={config.color} />
          <Text style={[styles.statusLabel, { color: config.color }]}>{config.label}</Text>
        </View>
      </View>
      <Text style={styles.destination}>{request.tripDestination}</Text>
      <Text style={styles.timeAgo}>Sent {timeAgo(request.createdAt)}</Text>
      {request.status === 'pending' && onCancel && (
        <TouchableOpacity style={styles.actionBtn} onPress={onCancel} activeOpacity={0.7}>
          <Text style={styles.actionBtnLabel}>Cancel request</Text>
        </TouchableOpacity>
      )}
      {request.status === 'approved' && onViewTrip && (
        <TouchableOpacity style={[styles.actionBtn, styles.actionBtnPrimary]} onPress={onViewTrip} activeOpacity={0.7}>
          <Text style={[styles.actionBtnLabel, styles.actionBtnPrimaryLabel]}>View Trip</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

interface ReceivedCardProps {
  request: TripJoinRequest;
  onApprove: () => void;
  onReject: () => void;
}

export function ReceivedRequestCard({ request, onApprove, onReject }: ReceivedCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.requesterRow}>
        <Avatar uri={request.requestorPhotoURL} initials={request.requestorName[0] ?? '?'} size={40} />
        <View style={styles.requesterInfo}>
          <Text style={styles.requesterName}>{request.requestorName}</Text>
          <Text style={styles.requesterTrip} numberOfLines={1}>{request.tripTitle}</Text>
          <Text style={styles.timeAgo}>{timeAgo(request.createdAt)}</Text>
        </View>
      </View>
      {request.message ? (
        <Text style={styles.message} numberOfLines={3}>"{request.message}"</Text>
      ) : null}
      {request.status === 'pending' && (
        <View style={styles.actionsRow}>
          <TouchableOpacity style={[styles.actionBtn, styles.rejectBtn]} onPress={onReject} activeOpacity={0.7}>
            <Text style={[styles.actionBtnLabel, styles.rejectLabel]}>Reject</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, styles.approveBtn]} onPress={onApprove} activeOpacity={0.7}>
            <Text style={[styles.actionBtnLabel, styles.approveLabel]}>Approve</Text>
          </TouchableOpacity>
        </View>
      )}
      {request.status !== 'pending' && (
        <View style={[styles.statusBadge, { backgroundColor: STATUS_CONFIG[request.status].color + '18', alignSelf: 'flex-start' }]}>
          <Text style={[styles.statusLabel, { color: STATUS_CONFIG[request.status].color }]}>
            {STATUS_CONFIG[request.status].label}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  headerLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  tripTitle: { flex: 1, fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
  },
  statusLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold },
  destination: { fontSize: FontSize.sm, color: Colors.textSecondary },
  timeAgo: { fontSize: FontSize.xs, color: Colors.placeholder },
  actionBtn: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  actionBtnLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textSecondary },
  actionBtnPrimary: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  actionBtnPrimaryLabel: { color: Colors.white },
  requesterRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  requesterInfo: { flex: 1 },
  requesterName: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textPrimary },
  requesterTrip: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 1 },
  message: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20, fontStyle: 'italic' },
  actionsRow: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.sm },
  rejectBtn: { flex: 1, borderColor: Colors.error + '40' },
  rejectLabel: { color: Colors.error },
  approveBtn: { flex: 1, backgroundColor: Colors.success, borderColor: Colors.success },
  approveLabel: { color: Colors.white },
});
