// ── Phase 2 types — ported from GroupTrip.swift + GroupMessage.swift ──
// Not used in MVP. Kept here so the schema is documented and types
// are ready when Phase 2 development begins.

export interface GroupTrip {
  id: string;
  name: string;
  destination: string;
  startDate: Date;
  endDate: Date;
  description: string;
  activities: string[];
  languages: string[];
  creatorId: string;
  members: string[];      // UIDs
  admins: string[];       // UIDs
  joinRequests: string[]; // UIDs
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface GroupMessage {
  id: string;
  groupId: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: Date;
  isReadBy: string[];     // UIDs
}
