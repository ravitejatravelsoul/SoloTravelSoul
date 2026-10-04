
// ── Post Types ────────────────────────────────────────────────────────────────

export type PostType =
  | 'photo'
  | 'carousel'
  | 'hidden_gem'
  | 'food'
  | 'hotel'
  | 'memory'
  | 'story';

export type PostVisibility = 'public' | 'followers';

// ── Travel Post ───────────────────────────────────────────────────────────────

export interface TravelPost {
  postId: string;
  authorId: string;
  authorName: string;
  authorPhoto: string | null;
  caption: string;           // ≤ 500 chars
  body: string;              // long-form markdown; empty for photo-only posts
  location: string;          // user-entered city/place name
  country: string;
  tripId: string | null;     // optional link to a PlannedTrip
  images: string[];          // up to 10 R2 URLs
  hashtags: string[];
  postType: PostType;
  likeCount: number;         // denormalized counter
  commentCount: number;      // denormalized counter
  saveCount: number;         // denormalized counter
  visibility: PostVisibility;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ── Post Like ─────────────────────────────────────────────────────────────────
// docId = `{postId}___{userId}` — composite ID prevents duplicate likes

export interface PostLike {
  postId: string;
  userId: string;
  createdAt: Date;
}

// ── Post Comment ──────────────────────────────────────────────────────────────

export interface PostComment {
  commentId: string;
  postId: string;
  authorId: string;
  authorName: string;
  authorPhoto: string | null;
  text: string;
  parentCommentId: string | null;  // null = top-level reply; set = reply to a comment
  replyCount: number;
  isDeleted: boolean;              // soft delete — preserves thread structure
  moderationRemoved?: boolean;     // text removed by a moderator
  createdAt: Date;
  updatedAt: Date;
}

// ── Saved Post ────────────────────────────────────────────────────────────────
// docId = `{userId}___{postId}` — composite ID

export interface SavedPost {
  postId: string;
  userId: string;
  collectionName: string;  // user-defined label, default 'Saved'
  savedAt: Date;
}

// ── Travel Journal ────────────────────────────────────────────────────────────
// Standalone long-form content — completely separate from trip JournalEntry.

export interface TravelJournal {
  journalId: string;
  authorId: string;
  authorName: string;
  authorPhoto: string | null;
  title: string;
  subtitle: string;
  coverImageURL: string | null;
  body: string;              // markdown
  images: string[];          // gallery images referenced in body or standalone
  location: string;
  country: string;
  tripId: string | null;
  hashtags: string[];
  readTimeMinutes: number;   // Math.ceil(wordCount / 200)
  likeCount: number;
  commentCount: number;
  saveCount: number;
  visibility: 'public' | 'private';
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ── Follow ────────────────────────────────────────────────────────────────────
// Asymmetric (Twitter-style). docId = `{followerId}___{followingId}`

export interface Follow {
  followerId: string;
  followingId: string;
  createdAt: Date;
}

// ── Follow Counts ─────────────────────────────────────────────────────────────

export interface FollowCounts {
  followersCount: number;
  followingCount: number;
}

// ── Story (architecture only — feature-flagged) ───────────────────────────────
// EXPO_PUBLIC_STORIES_ENABLED=false disables all story UI.

export interface TravelStory {
  storyId: string;
  authorId: string;
  authorName: string;
  authorPhoto: string | null;
  images: string[];        // R2 URLs
  viewerIds: string[];     // uids who have viewed
  expiresAt: Date;         // createdAt + 24h
  createdAt: Date;
}

// FirestoreTimestamp is exported from Community.ts — not duplicated here
