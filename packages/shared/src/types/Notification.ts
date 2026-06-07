// Ported from NotificationItem.swift

export type NotificationType =
  | 'join_request'
  | 'join_approved'
  | 'join_denied'
  | 'group_chat'
  // ── Phase 2: Social notifications ──
  | 'liked_post'
  | 'commented_post'
  | 'replied_comment'
  | 'followed_you'
  | 'saved_post';

export interface AppNotification {
  id: string;
  userId: string;
  type: NotificationType;
  groupId: string | null;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: Date;
  // ── Phase 2 social fields (optional — only present on social notification types) ──
  actorId?: string;
  actorName?: string;
  actorPhoto?: string | null;
  targetId?: string;
  targetTitle?: string;
}
