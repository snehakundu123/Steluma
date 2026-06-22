// =====================================================
// Steluma — Shared TypeScript Types
// =====================================================

// --- Enums ---

export type UserRole = 'ATTENDEE' | 'ORGANIZER' | 'ADMIN'

export type TrustTier = 'NEW' | 'VERIFIED' | 'TRUSTED' | 'PARTNER'

export type VerificationStatus = 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'SUSPENDED'

export type EventCategory =
  | 'CONFERENCE'
  | 'CONCERT'
  | 'SPORTS'
  | 'COMMUNITY'
  | 'WORKSHOP'
  | 'HACKATHON'
  | 'NETWORKING'
  | 'FESTIVAL'
  | 'WEBINAR'
  | 'OTHER'

export type EventStatus = 'DRAFT' | 'STAKED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'DISPUTED'

export type EventVisibility = 'PUBLIC' | 'PRIVATE' | 'UNLISTED'

export type LocationType = 'PHYSICAL' | 'VIRTUAL' | 'HYBRID'

export type TicketStatus =
  | 'PENDING'
  | 'CONFIRMING'
  | 'ACTIVE'
  | 'CHECKED_IN'
  | 'CANCELLED'
  | 'LISTED'
  | 'TRANSFERRED'

export type BadgeType = 'ATTENDEE' | 'VIP' | 'SPEAKER' | 'ORGANIZER' | 'VOLUNTEER' | 'EARLY_BIRD'

export type MintStatus = 'PENDING' | 'MINTING' | 'MINTED' | 'FAILED'

export type StakeStatus = 'PENDING' | 'STAKED' | 'COMPLETED' | 'RELEASED' | 'DISPUTED' | 'SLASHED'

export type ListingStatus = 'ACTIVE' | 'SOLD' | 'CANCELLED' | 'EXPIRED'

export type NotificationType =
  | 'TICKET_PURCHASED'
  | 'TICKET_SOLD'
  | 'EVENT_STARTING_SOON'
  | 'CHECK_IN_SUCCESS'
  | 'BADGE_EARNED'
  | 'STAKE_RELEASED'
  | 'DISPUTE_FILED'
  | 'REPUTATION_UPDATE'
  | 'LISTING_SOLD'
  | 'SYSTEM'

// --- Core Entities ---

export interface User {
  id: string
  walletAddress: string
  displayName: string | null
  bio: string | null
  avatarUrl: string | null
  role: UserRole
  isActive: boolean
  createdAt: string
  organizerProfile?: OrganizerProfile
}

export interface OrganizerProfile {
  id: string
  userId: string
  walletAddress: string
  organizationName: string | null
  website: string | null
  twitterHandle: string | null
  verificationStatus: VerificationStatus
  trustTier: TrustTier
  reputationScore: number
  totalEventsHosted: number
  successfulEvents: number
  totalAttendeesServed: number
  totalRevenue: string
  averageRating: number
  ratingCount: number
  disputeCount: number
  createdAt: string
}

export interface Event {
  id: string
  slug: string
  organizerId: string
  title: string
  description: string
  category: EventCategory
  bannerUrl: string | null
  locationType: LocationType
  locationAddress: string | null
  locationCity: string | null
  locationCountry: string | null
  locationLat: number | null
  locationLng: number | null
  virtualLink: string | null
  startsAt: string
  endsAt: string
  timezone: string
  status: EventStatus
  visibility: EventVisibility
  maxResalePrice: string | null
  royaltyBps: number
  refundPolicy: string | null
  tags: string[]
  onChainEventId: string | null
  stakeRequired: string
  totalTickets: number
  ticketsSold: number
  checkedInCount: number
  viewCount: number
  trendingScore: number
  totalRevenue: string
  createdAt: string
  updatedAt: string
  publishedAt: string | null
  organizer?: OrganizerProfile
  ticketTiers?: TicketTier[]
  stake?: OrganizerStake
}

export interface TicketTier {
  id: string
  eventId: string
  name: string
  description: string | null
  price: string
  priceAsset: string
  totalSupply: number
  sold: number
  available: number
  sortOrder: number
  isTransferable: boolean
  maxPerWallet: number
  saleStartsAt: string | null
  saleEndsAt: string | null
  perks: string[]
  badgeType: BadgeType
  isVisible: boolean
}

export interface Ticket {
  id: string
  eventId: string
  tierId: string
  ownerId: string
  ownerWallet: string
  ticketNumber: number
  status: TicketStatus
  onChainTokenId: string | null
  purchasePrice: string
  purchaseAsset: string
  purchaseTxHash: string | null
  mintTxHash: string | null
  isResale: boolean
  createdAt: string
  event?: Event
  tier?: TicketTier
  owner?: User
  checkIn?: CheckIn
}

export interface CheckIn {
  id: string
  ticketId: string
  eventId: string
  userId: string
  scannedBy: string
  checkedInAt: string
  badgeMinted: boolean
  badgeId: string | null
  ticket?: Ticket
  attendee?: User
}

export interface AttendanceBadge {
  id: string
  userId: string
  ownerWallet: string
  eventId: string
  badgeType: BadgeType
  onChainTokenId: string | null
  metadataUri: string | null
  mintStatus: MintStatus
  issuedAt: string
  event?: Event
}

export interface OrganizerStake {
  id: string
  organizerId: string
  eventId: string
  amount: string
  asset: string
  status: StakeStatus
  stakeTxHash: string | null
  stakedAt: string | null
  completedAt: string | null
  releaseAfter: string | null
  releasedAt: string | null
  slashPercentage: number | null
}

export interface MarketplaceListing {
  id: string
  ticketId: string
  eventId: string
  sellerId: string
  sellerWallet: string
  price: string
  asset: string
  royaltyBps: number
  royaltyRecipient: string
  maxPrice: string | null
  status: ListingStatus
  buyerWallet: string | null
  salePrice: string | null
  royaltyPaid: string | null
  listedAt: string
  soldAt: string | null
  ticket?: Ticket
  event?: Event
  seller?: User
}

export interface Notification {
  id: string
  userId: string
  type: NotificationType
  title: string
  body: string
  data: Record<string, unknown> | null
  isRead: boolean
  readAt: string | null
  createdAt: string
}

// --- API Response Wrappers ---

export interface ApiResponse<T> {
  data: T
}

export interface PaginatedResponse<T> {
  data: T[]
  meta: {
    page: number
    limit: number
    total: number
    hasNextPage: boolean
    hasPrevPage: boolean
  }
}

export interface ApiError {
  error: {
    code: string
    message: string
    details?: Record<string, unknown>
  }
}

// --- Auth Types ---

export interface AuthChallenge {
  nonce: string
  expiresAt: string
  message: string
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
  expiresIn: number
  user: User & { isNewUser: boolean }
}

// --- Event Discovery Filters ---

export interface EventFilters {
  q?: string
  category?: EventCategory
  status?: EventStatus
  city?: string
  country?: string
  trustTier?: TrustTier
  priceMin?: number
  priceMax?: number
  dateFrom?: string
  dateTo?: string
  sort?: 'trending' | 'date' | 'price'
  page?: number
  limit?: number
}

// --- Ticket Purchase ---

export interface PurchaseInitiate {
  eventId: string
  tierId: string
  quantity: number
  buyerWallet: string
}

export interface PurchaseResponse {
  purchaseId: string
  status: 'PENDING'
  expiresAt: string
  totalAmount: string
  asset: string
  transaction: {
    xdr: string
    networkPassphrase: string
    memo: string
  }
}

// --- QR Types ---

export interface QrPayload {
  ticketId: string
  eventId: string
  wallet: string
  nonce: string
  issuedAt: number
  expiresAt: number
  signature: string
}

export interface ScanResult {
  valid: boolean
  reason?: string
  checkIn?: CheckIn
  ticket?: Ticket
  attendee?: User
  checkedInAt?: string
}

// --- Socket.IO Events ---

export interface SocketTicketSoldEvent {
  tierId: string
  tierName: string
  ticketsSold: number
  available: number
  totalRevenue: string
}

export interface SocketCheckInEvent {
  checkInId: string
  checkedInAt: string
  ticket: Pick<Ticket, 'id' | 'ticketNumber' | 'tierId'>
  attendee: Pick<User, 'walletAddress' | 'displayName' | 'avatarUrl'>
}

export interface SocketRevenueUpdateEvent {
  totalRevenue: string
  ticketsSold: number
  revenueByTier: Array<{ tierId: string; name: string; revenue: string }>
}

// --- Stellar/Contract Types ---

export interface StellarNetworkConfig {
  network: 'testnet' | 'mainnet'
  horizonUrl: string
  rpcUrl: string
  networkPassphrase: string
}

export interface StakeCalculation {
  minimum: string
  recommended: string
  asset: string
  breakdown: {
    baseFloor: string
    revenueEstimate: string
    multiplier: number
    trustTier: TrustTier
  }
}
