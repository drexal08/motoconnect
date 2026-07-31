export type Role = 'passenger' | 'rider';
export type Tier = 'agahozo' | 'isonga' | 'impuruza';
export type RequestStatus =
  | 'CREATED' | 'VISIBLE' | 'CLAIMED' | 'CONFIRMED' | 'EN_ROUTE' | 'ARRIVED'
  | 'COMPLETED' | 'EXPIRED' | 'EXPIRED_UNCLAIMED'
  | 'CANCELLED_BY_PASSENGER' | 'CANCELLED_BY_RIDER' | 'NO_SHOW';

export interface User {
  id: string;
  phone: string;
  name: string;
  role: Role;
  consent: { granted: boolean; reconfirmRequired: boolean };
}

export interface MeResponse {
  user: User;
  riderProfile: { verificationStatus: VerificationStatus } | null;
}

export type VerificationStatus = 'pending_verification' | 'verified' | 'rejected';

export interface PoolItem {
  id: string;
  lat: number;
  lng: number;
  distanceBandM: number;
  direction: string;
  destinationNote: string | null;
  createdAt: string;
}

export interface PoolResponse {
  pool: PoolItem[];
  locationKnown: boolean;
}

export interface RiderStatusResponse {
  status: {
    verificationStatus: VerificationStatus;
    reliabilityScore: number;
    claimSuspendedUntil: string | null;
    rejectionReason: string | null;
  };
  subscription: Subscription | null;
  unrated: { id: string; completedAt: string; otherName: string } | null;
}

export interface Subscription {
  id: string;
  tier: Tier;
  claimsUsed: number;
  claimsCap: number | null;
  expiresAt: string;
  status: string;
}

export interface ActiveRequest {
  id: string;
  status: RequestStatus;
  claimedAt: string | null;
  confirmDeadline: string | null;
  pickup: { lat: number; lng: number };
  destinationNote: string | null;
  passengerName: string | null;
  rider: { id: string; name: string | null; plate: string | null; rating: number | null } | null;
}

export interface ActiveResponse {
  active: ActiveRequest | null;
  unrated: { id: string; completedAt: string; otherName: string } | null;
}

export interface Payment {
  id: string;
  provider: string;
  amount: number;
  status: 'pending' | 'success' | 'failed';
  tier: Tier | null;
  providerRef: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface DemandIndicator {
  visibleRequests: number;
  nearMe: number | null;
}

export interface RequestEventPayload {
  id: string;
  status: RequestStatus;
  rider?: { id: string; name: string | null; plate: string | null; rating: number | null } | null;
  passengerName?: string | null;
  pickup?: { lat: number; lng: number } | null;
  at: string;
}
