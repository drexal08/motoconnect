/** Shared shapes for the ops console. Mirrors the server's admin services. */

export type AdminRole = 'super_admin' | 'support' | 'finance_ops';

export interface AdminSession {
  id: string;
  email: string;
  role: AdminRole;
  mfaEnabled: boolean;
  lastLoginAt: string | null;
  sessionExpiresAt: string | null;
}

export interface Paged<T> {
  total: number;
  page: number;
  pageSize: number;
  rows: T[];
}

export interface QueueRow {
  riderId: string;
  name: string;
  phone: string;
  nationalIdMasked: string;
  plateNumber: string;
  licenseNumber: string;
  verificationStatus: 'pending_verification' | 'verified' | 'rejected';
  submittedAt: string;
  daysPending: number;
  hoursPending: number;
  overSla: boolean;
  infoRequestedAt: string | null;
  rejectionCode: string | null;
  rejectionReason: string | null;
  decidedAt: string | null;
  documentCount: number;
}

export interface RiderReview {
  riderId: string;
  name: string;
  phone: string;
  accountCreatedAt: string;
  accountStatus: string;
  nationalId: string;
  licenseNumber: string;
  plateNumber: string;
  verificationStatus: 'pending_verification' | 'verified' | 'rejected';
  submittedAt: string;
  verifiedAt: string | null;
  decidedAt: string | null;
  decidedByEmail: string | null;
  rejectionReason: string | null;
  rejectionCode: string | null;
  infoRequestedAt: string | null;
  infoRequestNote: string | null;
  reliabilityScore: number;
  /** No URL: the bytes come from an authenticated endpoint, per document. */
  documents: {
    id: string;
    kind: string;
    mimeType: string | null;
    byteSize: number | null;
    uploadedAt: string;
  }[];
  documentsMissing: boolean;
  missingRequiredKinds: string[];
  possibleDuplicates: {
    riderId: string;
    name: string;
    phone: string;
    verificationStatus: string;
    sameNationalId: boolean;
    samePlate: boolean;
  }[];
}

export type RideStatus =
  | 'CREATED' | 'VISIBLE' | 'CLAIMED' | 'CONFIRMED' | 'EN_ROUTE' | 'ARRIVED' | 'COMPLETED'
  | 'EXPIRED' | 'EXPIRED_UNCLAIMED' | 'CANCELLED_BY_PASSENGER' | 'CANCELLED_BY_RIDER' | 'NO_SHOW';

export interface LiveRide {
  id: string;
  status: RideStatus;
  createdAt: string;
  claimedAt: string | null;
  confirmedAt: string | null;
  riderArrivedAt: string | null;
  confirmDeadline: string | null;
  destinationNote: string | null;
  pickup: { lat: number; lng: number };
  passenger: { id: string; name: string; phone: string };
  rider: {
    id: string;
    name: string;
    phone: string;
    plate: string | null;
    reliabilityScore: number | null;
    position: { lat: number; lng: number } | null;
    lastSeenAt: string | null;
  } | null;
}

export interface RideDetail {
  id: string;
  status: RideStatus;
  destinationNote: string | null;
  pickup: { lat: number; lng: number };
  pickupAccuracyM: number | null;
  claimAttempts: number;
  cancelReason: string | null;
  timestamps: Record<string, string | null>;
  passenger: { id: string; name: string; phone: string; accountStatus: string };
  rider: {
    id: string; name: string; phone: string; accountStatus: string;
    plate: string | null; reliabilityScore: number | null;
  } | null;
  events: {
    id: string; fromStatus: string | null; toStatus: string;
    actorName: string | null; createdAt: string; meta: unknown;
  }[];
  ratings: {
    stars: number; comment: string | null; created_at: string;
    rated_by_name: string | null; rated_user_name: string | null;
  }[];
  track: { lat: number; lng: number; recordedAt: string; userId: string }[];
  disputeReview: {
    outcome: string; reason_code: string | null; note: string;
    resolved_at: string; resolved_by_email: string | null;
  } | null;
}

export interface Dispute {
  rideId: string;
  trigger: 'no_show' | 'low_rating';
  flaggedAt: string;
  status: RideStatus;
  destinationNote: string | null;
  passenger: { id: string; name: string; phone: string };
  rider: { id: string; name: string; phone: string } | null;
  lowestRating: number | null;
  lowestComment: string | null;
  resolved: boolean;
  outcome: string | null;
  resolvedAt: string | null;
  resolvedByEmail: string | null;
}

export interface UserRow {
  id: string;
  name: string;
  phone: string;
  role: 'passenger' | 'rider';
  accountStatus: 'active' | 'suspended' | 'banned';
  suspendedUntil: string | null;
  reviewFlag: boolean;
  verificationStatus: string | null;
  reliabilityScore: number | null;
  activeTier: string | null;
  rideCount: number;
  createdAt: string;
}

export interface UserDetail {
  id: string;
  name: string;
  phone: string;
  role: 'passenger' | 'rider';
  accountStatus: 'active' | 'suspended' | 'banned';
  suspendedUntil: string | null;
  statusReason: string | null;
  adminNotes: string | null;
  reviewFlag: boolean;
  disabled: boolean;
  createdAt: string;
  consent: { granted: boolean; reconfirmAt: string | null };
  rider: {
    verificationStatus: string;
    nationalIdMasked: string;
    licenseNumber: string;
    plateNumber: string;
    reliabilityScore: number;
    claimSuspendedUntil: string | null;
    rejectionReason: string | null;
    rejectionCode: string | null;
  } | null;
  subscriptions: {
    id: string; tier: string; claimsUsed: number; claimsCap: number | null;
    status: string; startsAt: string; expiresAt: string;
  }[];
  rides: {
    id: string; status: RideStatus; createdAt: string; completedAt: string | null;
    destinationNote: string | null; role: 'passenger' | 'rider'; counterparty: string | null;
  }[];
  ratingsGiven: { stars: number; comment: string | null; created_at: string; ride_request_id: string }[];
  ratingsReceived: { stars: number; comment: string | null; created_at: string; ride_request_id: string }[];
  counts: { no_shows: number; passenger_cancels: number; rider_cancels: number; completed: number };
  reliabilityEvents: { id: string; toStatus: string; createdAt: string; rideRequestId: string; meta: unknown }[];
  strikes: { id: string; reason_code: string; note: string; created_at: string; admin_email: string | null }[];
  adminTrail: {
    id: string; actionType: string; reasonCode: string | null; reasonFreetext: string | null;
    adminEmail: string | null; createdAt: string; beforeState: unknown; afterState: unknown;
  }[];
}

export interface SubscriptionRow {
  id: string;
  tier: string;
  tierLabel: string;
  claimsUsed: number;
  claimsCap: number | null;
  status: string;
  startsAt: string;
  expiresAt: string;
  rider: { id: string; name: string; phone: string };
  quotaBlocks30d: number;
}

export interface PaymentRow {
  id: string;
  provider: string;
  providerRef: string | null;
  amount: number;
  refunded: number;
  status: 'pending' | 'success' | 'failed';
  tier: string | null;
  kind: string;
  subscriptionId: string | null;
  reconcileState: 'resolved' | 'void' | null;
  createdAt: string;
  completedAt: string | null;
  user: { id: string; name: string; phone: string };
}

export interface ReconciliationExceptions {
  orphanPayments: {
    paymentId: string; amount: number; tier: string | null; providerRef: string | null;
    createdAt: string; completedAt: string | null; user: { id: string; name: string; phone: string };
  }[];
  unpaidSubscriptions: {
    subscriptionId: string; tier: string; claimsUsed: number; claimsCap: number | null;
    startsAt: string; expiresAt: string; rider: { id: string; name: string; phone: string };
  }[];
  stalePendingPayments: {
    paymentId: string; amount: number; tier: string | null; createdAt: string;
    user: { id: string; name: string; phone: string };
  }[];
  total: number;
}

export interface RefundRow {
  id: string;
  paymentId: string;
  rideRequestId: string | null;
  amount: number;
  paymentAmount: number;
  tier: string | null;
  reasonCode: string;
  reasonFreetext: string;
  settlement: 'manual_offline' | 'provider_api' | 'provider_failed';
  providerRef: string | null;
  settledAt: string | null;
  createdAt: string;
  adminEmail: string | null;
  user: { id: string; name: string; phone: string };
}

export interface DashboardSummary {
  activeRides: number;
  waitingRequests: number;
  pendingVerification: { count: number; overSla: number; oldestSubmittedAt: string | null };
  revenue: {
    todayRwf: number; todayCount: number; weekRwf: number; monthRwf: number;
    allTimeRwf: number; refundedTodayRwf: number; refundedMonthRwf: number;
  };
  openDisputes: number;
  verificationThroughput: {
    windowDays: number; approved: number; rejected: number;
    approvalRate: number | null; medianHoursToDecision: number | null;
  };
  reconciliationExceptions: number;
}

export interface AuditRow {
  id: string;
  adminUserId: string | null;
  adminEmail: string | null;
  actionType: string;
  targetType: string;
  targetId: string | null;
  reasonCode: string | null;
  reasonFreetext: string | null;
  beforeState: unknown;
  afterState: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface AdminAccount {
  id: string;
  email: string;
  role: AdminRole;
  status: 'active' | 'suspended';
  mfaEnabled: boolean;
  passwordSet: boolean;
  setupTokenExpiresAt: string | null;
  activeSessions: number;
  createdAt: string;
  lastLoginAt: string | null;
}
