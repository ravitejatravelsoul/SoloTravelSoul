export interface ChatParticipantInfo {
  name: string;
  initials: string;
}

export interface ChatLastMessage {
  text: string;
  senderId: string;
  senderName?: string;
  sentAt: Date;
}

// ── Direct (1-to-1) chat ──────────────────────────────────────────────

export interface DirectChat {
  id: string;
  /** Two UIDs, sorted lexicographically — determines the stable chatId. */
  participants: string[];
  participantInfo: Record<string, ChatParticipantInfo>;
  lastMessage: ChatLastMessage | null;
  updatedAt: Date;
  /** Per-user unread message count. Reset to 0 when user opens the chat. */
  unreadCounts: Record<string, number>;
}

export interface DirectMessage {
  id: string;
  senderId: string;
  text: string;
  sentAt: Date;
  /** UUID written by client; also used as Firestore doc ID for idempotency. */
  clientId: string;
  /** Client-only — not stored in Firestore. */
  status?: 'pending' | 'sent';
}

// ── Group chat ────────────────────────────────────────────────────────

export interface TravelGroup {
  id: string;
  name: string;
  createdBy: string;
  members: string[];
  memberInfo: Record<string, ChatParticipantInfo>;
  /** Optional link to a PlannedTrip. */
  tripId?: string;
  lastMessage: ChatLastMessage | null;
  updatedAt: Date;
  unreadCounts: Record<string, number>;
  createdAt: Date;
}

export type GroupMessageType = 'user' | 'system';

export interface TravelGroupMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  type: GroupMessageType;
  sentAt: Date;
  clientId: string;
  /** Client-only — not stored in Firestore. */
  status?: 'pending' | 'sent';
}

// ── User lookup ───────────────────────────────────────────────────────
// Written to userLookup/{uid} on profile create/update.
// Any authenticated user can read — used for searching by email.

export interface UserLookup {
  uid: string;
  displayName: string;
  email: string;
  initials: string;
}
