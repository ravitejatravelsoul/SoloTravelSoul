// Ported from NotificationItem.swift

export type NotificationType =
  | 'join_request'
  | 'join_approved'
  | 'join_denied'
  | 'group_chat';

export interface AppNotification {
  id: string;
  userId: string;
  type: NotificationType;
  groupId: string | null;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: Date;
}
