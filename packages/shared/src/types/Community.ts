import type { Timestamp } from 'firebase/firestore';

export type TravelStyle =
  | 'solo'
  | 'budget'
  | 'luxury'
  | 'adventure'
  | 'cultural'
  | 'food'
  | 'digital-nomad'
  | 'eco';

export type Interest =
  | 'hiking'
  | 'photography'
  | 'food'
  | 'nightlife'
  | 'history'
  | 'beach'
  | 'languages'
  | 'volunteering'
  | 'yoga'
  | 'art'
  | 'sports'
  | 'music';

export type ProfileVisibility = 'public' | 'private';
export type TripVisibility = 'private' | 'public';
export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export type FeedItemType =
  | 'trip_created'
  | 'group_created'
  | 'joined_group'
  | 'memory_added'
  | 'place_saved';

export interface PublicProfile {
  uid: string;
  displayName: string;
  photoURL: string | null;
  bio: string;
  currentCity: string;
  homeCountry: string;
  languages: string[];
  travelStyles: TravelStyle[];
  countriesVisited: string[];
  dreamDestinations: string[];
  interests: Interest[];
  tripCount: number;
  memberSince: Date;
  updatedAt: Date;
}

export interface PublicTrip {
  tripId: string;
  ownerUid: string;
  ownerName: string;
  ownerPhotoURL: string | null;
  title: string;
  destination: string;
  startDate: Date;
  endDate: Date;
  description: string;
  tags: string[];
  memberCount: number;
  maxMembers: number | null;
  isAcceptingMembers: boolean;
  coverPhotoURL: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TripMember {
  uid: string;
  displayName: string;
  photoURL: string | null;
  role: 'owner' | 'member';
  joinedAt: Date;
}

export interface TripJoinRequest {
  requestId: string;
  tripId: string;
  tripTitle: string;
  tripDestination: string;
  ownerUid: string;
  requestorUid: string;
  requestorName: string;
  requestorPhotoURL: string | null;
  requestorBio: string;
  message: string;
  status: RequestStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface CommunityGroup {
  groupId: string;
  ownerUid: string;
  ownerName: string;
  ownerPhotoURL: string | null;
  name: string;
  description: string;
  destination: string;
  startDate: Date | null;
  endDate: Date | null;
  capacity: number;
  memberCount: number;
  visibility: 'public' | 'private';
  tags: string[];
  rules: string;
  chatGroupId: string | null;
  isAcceptingMembers: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CommunityGroupMember {
  uid: string;
  displayName: string;
  photoURL: string | null;
  role: 'owner' | 'admin' | 'member';
  joinedAt: Date;
}

export interface CommunityGroupJoinRequest {
  requestId: string;
  groupId: string;
  groupName: string;
  ownerUid: string;
  requestorUid: string;
  requestorName: string;
  requestorPhotoURL: string | null;
  message: string;
  status: RequestStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface FeedItem {
  feedItemId: string;
  type: FeedItemType;
  actorUid: string;
  actorName: string;
  actorPhotoURL: string | null;
  targetId: string;
  targetType: 'trip' | 'group' | 'memory';
  targetTitle: string;
  targetDestination: string | null;
  visibility: 'public';
  createdAt: Date;
}

export interface Report {
  reporterUid: string;
  targetType: 'user' | 'trip' | 'group' | 'message';
  targetId: string;
  reason: 'spam' | 'inappropriate' | 'harassment' | 'fake' | 'safety' | 'other';
  details: string;
  status: 'pending';
  createdAt: Date;
}

export interface Block {
  blockedUid: string;
  blockedAt: Date;
}

export interface NearbyTraveler {
  uid: string;
  displayName: string;
  photoURL: string | null;
  currentCity: string;
  travelStyles: TravelStyle[];
  destination: string | null;
  destinationStartDate: Date | null;
  destinationEndDate: Date | null;
  updatedAt: Date;
}

// Firestore raw types (with Timestamp instead of Date) — used only inside firebase package
export type FirestoreTimestamp = Timestamp;
