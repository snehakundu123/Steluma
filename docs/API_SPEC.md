# API Specification — Steluma

> RESTful HTTP API + Socket.IO real-time events
> Base URL: `https://api.steluma.xyz` (prod) / `http://localhost:4000` (local)
> API Version: `v1`
> All endpoints prefixed with `/api/v1`

---

## Authentication

### Scheme

All protected endpoints require:
```
Authorization: Bearer <access_token>
```

Access tokens are JWTs (RS256) with:
```json
{
  "sub": "user-uuid",
  "wallet": "G...",
  "role": "ORGANIZER",
  "jti": "session-uuid",
  "iat": 1700000000,
  "exp": 1700003600
}
```

### Rate Limits

| Tier | Limit |
|------|-------|
| Anonymous | 60 req/min |
| Authenticated | 300 req/min |
| Scanner | 600 req/min |
| Admin | unlimited |

Rate limit headers on every response:
```
X-RateLimit-Limit: 300
X-RateLimit-Remaining: 247
X-RateLimit-Reset: 1700000060
```

---

## Error Format

All errors follow:
```json
{
  "error": {
    "code": "TICKET_SOLD_OUT",
    "message": "This ticket tier is sold out",
    "details": { "tier": "VIP", "available": 0 }
  }
}
```

---

## 1. Authentication Endpoints

### `POST /api/v1/auth/challenge`

Request wallet signature challenge.

**Request:**
```json
{
  "walletAddress": "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN"
}
```

**Response `200`:**
```json
{
  "nonce": "steluma-auth-abc123xyz789",
  "expiresAt": "2025-09-01T00:05:00Z",
  "message": "Sign this message to authenticate with Steluma:\n\nsteluma-auth-abc123xyz789\n\nExpires: 2025-09-01T00:05:00Z"
}
```

---

### `POST /api/v1/auth/verify`

Verify wallet signature and issue tokens.

**Request:**
```json
{
  "walletAddress": "G...",
  "signature": "base64-encoded-xdr-signature",
  "nonce": "steluma-auth-abc123xyz789"
}
```

**Response `200`:**
```json
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "expiresIn": 900,
  "user": {
    "id": "uuid",
    "walletAddress": "G...",
    "displayName": null,
    "role": "ATTENDEE",
    "isNewUser": true
  }
}
```

**Errors:** `401 INVALID_SIGNATURE`, `400 NONCE_EXPIRED`, `429 TOO_MANY_ATTEMPTS`

---

### `POST /api/v1/auth/refresh`

**Request:**
```json
{ "refreshToken": "eyJ..." }
```

**Response `200`:**
```json
{
  "accessToken": "eyJ...",
  "expiresIn": 900
}
```

---

### `DELETE /api/v1/auth/logout`

**Headers:** `Authorization: Bearer <token>` (required)

**Response `204`:** No content

---

## 2. User Endpoints

### `GET /api/v1/users/me`

Get current authenticated user profile.

**Response `200`:**
```json
{
  "id": "uuid",
  "walletAddress": "G...",
  "displayName": "Alice Builder",
  "bio": "...",
  "avatarUrl": "https://ipfs.io/ipfs/Qm...",
  "role": "ORGANIZER",
  "createdAt": "2025-01-01T00:00:00Z",
  "organizerProfile": {
    "trustTier": "VERIFIED",
    "reputationScore": 450,
    "totalEventsHosted": 7,
    "successfulEvents": 7,
    "totalAttendeesServed": 1240,
    "averageRating": 4.7,
    "verificationStatus": "VERIFIED"
  }
}
```

---

### `PATCH /api/v1/users/me`

Update user profile.

**Request:**
```json
{
  "displayName": "Alice Builder",
  "bio": "Web3 event organizer",
  "avatarIpfsCid": "Qm..."
}
```

**Response `200`:** Updated user object

---

### `GET /api/v1/users/me/tickets`

List user's tickets.

**Query params:** `status`, `page`, `limit`

**Response `200`:**
```json
{
  "data": [
    {
      "id": "uuid",
      "status": "ACTIVE",
      "ticketNumber": 42,
      "purchasePrice": "50.0000000",
      "purchaseAsset": "XLM",
      "event": {
        "id": "uuid",
        "title": "DevConf 2025",
        "slug": "devconf-2025",
        "startsAt": "2025-09-01T09:00:00Z",
        "bannerUrl": "https://...",
        "locationType": "PHYSICAL",
        "locationCity": "San Francisco"
      },
      "tier": {
        "name": "VIP",
        "perks": ["Front row seating", "Networking dinner"]
      },
      "qrCode": {
        "payload": "encrypted-payload",
        "expiresAt": "2025-09-01T09:00:30Z"
      },
      "onChainTokenId": "42",
      "mintTxHash": "abc..."
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 5
  }
}
```

---

### `GET /api/v1/users/me/badges`

List user's attendance badges.

**Response `200`:**
```json
{
  "data": [
    {
      "id": "uuid",
      "badgeType": "VIP",
      "issuedAt": "2025-09-01T11:30:00Z",
      "event": {
        "id": "uuid",
        "title": "DevConf 2025",
        "startsAt": "2025-09-01T09:00:00Z"
      },
      "metadataUri": "ipfs://Qm...",
      "onChainTokenId": "15",
      "mintTxHash": "abc..."
    }
  ],
  "meta": { "total": 3 }
}
```

---

## 3. Event Endpoints

### `GET /api/v1/events`

Discover events.

**Query params:**
| Param | Type | Default | Description |
|-------|------|---------|------------|
| `q` | string | - | Full-text search |
| `category` | string | - | EventCategory enum |
| `status` | string | ACTIVE | EventStatus |
| `city` | string | - | Filter by city |
| `country` | string | - | Filter by country |
| `trustTier` | string | - | NEW/VERIFIED/TRUSTED/PARTNER |
| `priceMin` | number | - | Min ticket price |
| `priceMax` | number | - | Max ticket price |
| `dateFrom` | ISO8601 | - | Start date from |
| `dateTo` | ISO8601 | - | Start date to |
| `sort` | string | trending | trending/date/price |
| `page` | number | 1 | Page number |
| `limit` | number | 20 | Results per page (max 100) |

**Response `200`:**
```json
{
  "data": [
    {
      "id": "uuid",
      "slug": "devconf-2025",
      "title": "DevConf 2025",
      "description": "...",
      "category": "CONFERENCE",
      "bannerUrl": "https://cdn.steluma.xyz/...",
      "startsAt": "2025-09-01T09:00:00Z",
      "endsAt": "2025-09-01T18:00:00Z",
      "timezone": "America/Los_Angeles",
      "locationCity": "San Francisco",
      "locationCountry": "US",
      "totalTickets": 550,
      "ticketsSold": 423,
      "soldPercentage": 76.9,
      "priceFrom": "50.0000000",
      "priceAsset": "XLM",
      "organizer": {
        "id": "uuid",
        "displayName": "DevDAO",
        "trustTier": "TRUSTED",
        "reputationScore": 720,
        "avatarUrl": "https://..."
      },
      "trendingScore": 8.4
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 147,
    "hasNextPage": true
  }
}
```

---

### `POST /api/v1/events`

Create a new event. **Requires `ORGANIZER` role.**

**Request:**
```json
{
  "title": "DevConf 2025",
  "description": "Annual developer conference...",
  "category": "CONFERENCE",
  "locationType": "PHYSICAL",
  "locationAddress": "747 Howard St, San Francisco, CA",
  "locationCity": "San Francisco",
  "locationCountry": "US",
  "locationLat": 37.7837,
  "locationLng": -122.3985,
  "startsAt": "2025-09-01T09:00:00Z",
  "endsAt": "2025-09-01T18:00:00Z",
  "timezone": "America/Los_Angeles",
  "maxResalePrice": "500.0000000",
  "royaltyBps": 500,
  "refundPolicy": "Full refund 7 days before event",
  "tags": ["blockchain", "developer", "conference"],
  "ticketTiers": [
    {
      "name": "General Admission",
      "description": "Full conference access",
      "price": "50.0000000",
      "priceAsset": "XLM",
      "totalSupply": 500,
      "isTransferable": true,
      "maxPerWallet": 5,
      "saleStartsAt": "2025-07-01T00:00:00Z",
      "badgeType": "ATTENDEE",
      "perks": ["Full conference access", "Lunch included"]
    },
    {
      "name": "VIP",
      "price": "200.0000000",
      "priceAsset": "XLM",
      "totalSupply": 50,
      "badgeType": "VIP",
      "perks": ["Front row", "Speaker dinner", "Exclusive swag"]
    }
  ]
}
```

**Response `201`:**
```json
{
  "id": "uuid",
  "slug": "devconf-2025",
  "status": "DRAFT",
  "stakeRequired": "55.0000000",
  "stakeAsset": "XLM",
  "stakeCalculation": {
    "baseFloor": "100.0000000",
    "revenueEstimate": "27500.0000000",
    "multiplier": 0.10,
    "minimum": "2750.0000000",
    "note": "Stake based on 10% of estimated revenue (Verified tier)"
  },
  "onChainEventId": null,
  "createdAt": "2025-06-01T00:00:00Z"
}
```

---

### `GET /api/v1/events/:slug`

Get full event details. Public.

**Response `200`:**
```json
{
  "id": "uuid",
  "slug": "devconf-2025",
  "title": "DevConf 2025",
  "description": "...",
  "category": "CONFERENCE",
  "bannerUrl": "https://...",
  "startsAt": "2025-09-01T09:00:00Z",
  "endsAt": "2025-09-01T18:00:00Z",
  "timezone": "America/Los_Angeles",
  "status": "ACTIVE",
  "locationAddress": "747 Howard St...",
  "locationCity": "San Francisco",
  "locationLat": 37.7837,
  "locationLng": -122.3985,
  "maxResalePrice": "500.0000000",
  "royaltyBps": 500,
  "refundPolicy": "...",
  "tags": ["blockchain", "developer"],
  "totalTickets": 550,
  "ticketsSold": 423,
  "checkedInCount": 0,
  "ticketTiers": [
    {
      "id": "uuid",
      "name": "General Admission",
      "description": "...",
      "price": "50.0000000",
      "priceAsset": "XLM",
      "totalSupply": 500,
      "sold": 391,
      "available": 109,
      "isTransferable": true,
      "maxPerWallet": 5,
      "saleStartsAt": "2025-07-01T00:00:00Z",
      "perks": ["Full conference access", "Lunch included"],
      "badgeType": "ATTENDEE"
    }
  ],
  "organizer": {
    "id": "uuid",
    "walletAddress": "G...",
    "displayName": "DevDAO",
    "bio": "...",
    "avatarUrl": "https://...",
    "trustTier": "TRUSTED",
    "reputationScore": 720,
    "totalEventsHosted": 15,
    "successfulEvents": 15,
    "verificationStatus": "VERIFIED"
  },
  "stake": {
    "status": "STAKED",
    "amount": "2750.0000000",
    "asset": "XLM"
  },
  "onChainEventId": "1",
  "eventContractAddress": "C..."
}
```

---

### `PATCH /api/v1/events/:id`

Update event. **Organizer only.**

**Request:** Partial event fields (same schema as POST, all optional)

**Response `200`:** Updated event object

---

### `POST /api/v1/events/:id/publish`

Publish event after staking. **Organizer only.**

Validates stake has been deposited, then:
1. Creates event on-chain via EventFactoryContract
2. Updates event status to ACTIVE

**Request:**
```json
{
  "stakeTxHash": "abc123..."
}
```

**Response `200`:**
```json
{
  "status": "ACTIVE",
  "onChainEventId": "1",
  "publishedAt": "2025-06-01T12:00:00Z"
}
```

---

### `DELETE /api/v1/events/:id`

Cancel event. **Organizer or Admin only.**

**Response `200`:**
```json
{ "status": "CANCELLED", "cancelledAt": "..." }
```

---

### `GET /api/v1/events/:id/analytics`

Get event analytics. **Organizer only.**

**Query params:** `from`, `to`, `granularity` (MINUTE/HOURLY/DAILY)

**Response `200`:**
```json
{
  "summary": {
    "totalRevenue": "21150.0000000",
    "ticketsSold": 423,
    "checkedIn": 0,
    "pageViews": 12400,
    "conversionRate": 0.034
  },
  "series": [
    {
      "timestamp": "2025-06-01T00:00:00Z",
      "ticketsSold": 12,
      "revenue": "600.0000000",
      "checkIns": 0
    }
  ],
  "byTier": [
    {
      "tierId": "uuid",
      "name": "General Admission",
      "sold": 391,
      "revenue": "19550.0000000"
    }
  ]
}
```

---

## 4. Ticket Endpoints

### `POST /api/v1/tickets/purchase`

Initiate ticket purchase.

**Request:**
```json
{
  "eventId": "uuid",
  "tierId": "uuid",
  "quantity": 2,
  "buyerWallet": "G..."
}
```

**Response `200`:**
```json
{
  "purchaseId": "uuid",
  "status": "PENDING",
  "expiresAt": "2025-06-01T00:05:00Z",
  "totalAmount": "100.0000000",
  "asset": "XLM",
  "transaction": {
    "xdr": "base64-encoded-stellar-xdr",
    "networkPassphrase": "Test SDF Network ; September 2015",
    "memo": "steluma-purchase-uuid"
  }
}
```

**Errors:** `409 TICKET_SOLD_OUT`, `409 MAX_PER_WALLET_EXCEEDED`, `400 SALE_NOT_STARTED`

---

### `POST /api/v1/tickets/purchase/:purchaseId/confirm`

Confirm purchase after signing and submitting transaction.

**Request:**
```json
{
  "txHash": "abc123..."
}
```

**Response `200`:**
```json
{
  "status": "CONFIRMING",
  "tickets": [
    {
      "id": "uuid",
      "ticketNumber": 424,
      "status": "CONFIRMING",
      "estimatedMintTime": "~30 seconds"
    }
  ]
}
```

---

### `GET /api/v1/tickets/:id`

Get ticket details.

**Response `200`:**
```json
{
  "id": "uuid",
  "status": "ACTIVE",
  "ticketNumber": 424,
  "event": { "...": "..." },
  "tier": { "...": "..." },
  "owner": {
    "walletAddress": "G...",
    "displayName": "Alice"
  },
  "purchasePrice": "50.0000000",
  "onChainTokenId": "424",
  "mintTxHash": "abc...",
  "isResale": false,
  "marketplaceListing": null
}
```

---

### `GET /api/v1/tickets/:id/qr`

Get current QR code payload. **Owner only.**

**Response `200`:**
```json
{
  "payload": "encrypted-base64-payload",
  "qrData": "data:image/png;base64,...",
  "expiresAt": "2025-09-01T09:00:30Z",
  "refreshAt": "2025-09-01T09:00:25Z"
}
```

---

## 5. Scanner Endpoints

### `POST /api/v1/scanner/validate`

Validate a QR code scan. **Organizer only (event-scoped JWT).**

**Request:**
```json
{
  "payload": "encrypted-qr-payload",
  "eventId": "uuid",
  "deviceInfo": "iPhone 15 Pro"
}
```

**Response `200` (valid):**
```json
{
  "valid": true,
  "checkIn": {
    "id": "uuid",
    "checkedInAt": "2025-09-01T09:15:30Z"
  },
  "ticket": {
    "id": "uuid",
    "ticketNumber": 424,
    "tier": "VIP",
    "perks": ["Front row", "Speaker dinner"]
  },
  "attendee": {
    "walletAddress": "G...",
    "displayName": "Alice Builder",
    "avatarUrl": "https://..."
  },
  "badgeStatus": "MINTING"
}
```

**Response `200` (invalid):**
```json
{
  "valid": false,
  "reason": "ALREADY_CHECKED_IN",
  "checkedInAt": "2025-09-01T09:10:00Z"
}
```

**Error codes:**
| Code | Description |
|------|------------|
| `INVALID_SIGNATURE` | QR payload signature mismatch |
| `EXPIRED_QR` | QR code has expired (>30s old) |
| `NONCE_USED` | QR nonce already consumed |
| `WRONG_EVENT` | Ticket belongs to different event |
| `ALREADY_CHECKED_IN` | Ticket already scanned |
| `OWNERSHIP_MISMATCH` | On-chain owner ≠ QR issuer |
| `TICKET_CANCELLED` | Ticket was cancelled |

---

### `GET /api/v1/scanner/checkins/:eventId`

Get recent check-ins for an event. **Organizer only.**

**Query params:** `limit` (default 50), `since` (ISO8601)

**Response `200`:**
```json
{
  "data": [
    {
      "id": "uuid",
      "checkedInAt": "2025-09-01T09:15:30Z",
      "ticket": {
        "ticketNumber": 424,
        "tier": "VIP"
      },
      "attendee": {
        "walletAddress": "G...",
        "displayName": "Alice Builder"
      }
    }
  ],
  "stats": {
    "totalCheckedIn": 87,
    "totalExpected": 423,
    "checkInRate": 20.6
  }
}
```

---

## 6. Organizer Endpoints

### `GET /api/v1/organizers/:walletAddress`

Public organizer profile.

**Response `200`:**
```json
{
  "id": "uuid",
  "walletAddress": "G...",
  "displayName": "DevDAO",
  "bio": "...",
  "avatarUrl": "https://...",
  "website": "https://devdao.xyz",
  "twitterHandle": "@devdao",
  "trustTier": "TRUSTED",
  "reputationScore": 720,
  "verificationStatus": "VERIFIED",
  "totalEventsHosted": 15,
  "successfulEvents": 15,
  "totalAttendeesServed": 8420,
  "averageRating": 4.8,
  "ratingCount": 1240,
  "events": {
    "upcoming": [ { "...": "..." } ],
    "past": [ { "...": "..." } ]
  }
}
```

---

### `GET /api/v1/organizers/me/dashboard`

Organizer dashboard summary. **Auth + organizer role.**

**Response `200`:**
```json
{
  "overview": {
    "totalRevenue": "125000.0000000",
    "revenueAsset": "XLM",
    "activeEvents": 2,
    "upcomingEvents": 3,
    "totalAttendeesServed": 8420
  },
  "activeEvents": [
    {
      "id": "uuid",
      "title": "DevConf 2025",
      "slug": "devconf-2025",
      "startsAt": "2025-09-01T09:00:00Z",
      "ticketsSold": 423,
      "totalTickets": 550,
      "revenue": "21150.0000000",
      "checkedIn": 87,
      "stake": {
        "status": "STAKED",
        "amount": "2750.0000000",
        "releaseAfter": null
      }
    }
  ],
  "reputation": {
    "score": 720,
    "tier": "TRUSTED",
    "recentHistory": [
      {
        "delta": +50,
        "reason": "Successful event completion",
        "createdAt": "2025-05-15T00:00:00Z"
      }
    ]
  }
}
```

---

### `GET /api/v1/organizers/me/stakes`

List organizer's stakes.

**Response `200`:**
```json
{
  "data": [
    {
      "id": "uuid",
      "event": { "title": "DevConf 2025", "slug": "..." },
      "amount": "2750.0000000",
      "asset": "XLM",
      "status": "STAKED",
      "stakedAt": "2025-06-01T12:00:00Z",
      "releaseAfter": null
    }
  ]
}
```

---

## 7. Staking Endpoints

### `GET /api/v1/staking/calculate`

Calculate required stake for an event.

**Query params:** `eventId` OR `ticketRevenue` (estimate)

**Response `200`:**
```json
{
  "minimum": "2750.0000000",
  "recommended": "3000.0000000",
  "asset": "XLM",
  "breakdown": {
    "baseFloor": "100.0000000",
    "revenueEstimate": "27500.0000000",
    "multiplier": 0.10,
    "trustTier": "VERIFIED"
  },
  "stakeTransaction": {
    "contractAddress": "C...",
    "xdr": "base64-xdr"
  }
}
```

---

### `POST /api/v1/staking/stake`

Record a stake transaction. Called after organizer submits stake tx.

**Request:**
```json
{
  "eventId": "uuid",
  "amount": "3000.0000000",
  "asset": "XLM",
  "txHash": "abc123..."
}
```

**Response `200`:**
```json
{
  "id": "uuid",
  "status": "STAKED",
  "stakedAt": "2025-06-01T12:00:00Z"
}
```

---

### `POST /api/v1/staking/:eventId/release`

Trigger stake release (auto-called by backend job, also manual for organizer).

**Response `200`:**
```json
{
  "status": "RELEASED",
  "amount": "3000.0000000",
  "releaseTxHash": "abc...",
  "releasedAt": "..."
}
```

---

## 8. Marketplace Endpoints

### `GET /api/v1/marketplace`

List marketplace listings.

**Query params:** `eventId`, `tierId`, `priceMin`, `priceMax`, `sort` (price_asc/price_desc/newest), `page`, `limit`

**Response `200`:**
```json
{
  "data": [
    {
      "id": "uuid",
      "price": "80.0000000",
      "asset": "XLM",
      "originalPrice": "50.0000000",
      "royaltyBps": 500,
      "listedAt": "2025-07-01T00:00:00Z",
      "seller": {
        "walletAddress": "G...",
        "displayName": "Bob"
      },
      "ticket": {
        "id": "uuid",
        "ticketNumber": 12,
        "status": "LISTED"
      },
      "event": {
        "id": "uuid",
        "title": "DevConf 2025",
        "startsAt": "2025-09-01T09:00:00Z",
        "bannerUrl": "https://..."
      },
      "tier": {
        "name": "General Admission",
        "perks": ["..."]
      }
    }
  ],
  "meta": { "page": 1, "total": 8 }
}
```

---

### `POST /api/v1/marketplace/list`

Create a marketplace listing.

**Request:**
```json
{
  "ticketId": "uuid",
  "price": "80.0000000",
  "asset": "XLM",
  "expiresAt": "2025-08-25T00:00:00Z"
}
```

**Response `201`:**
```json
{
  "id": "uuid",
  "status": "ACTIVE",
  "transaction": {
    "xdr": "base64-xdr",
    "networkPassphrase": "..."
  }
}
```

**Errors:** `409 TICKET_ALREADY_LISTED`, `400 TICKET_CHECKED_IN`, `400 EXCEEDS_MAX_RESALE_PRICE`, `403 TRANSFER_RESTRICTED`

---

### `POST /api/v1/marketplace/:listingId/buy`

Purchase a marketplace listing.

**Request:**
```json
{
  "buyerWallet": "G..."
}
```

**Response `200`:**
```json
{
  "status": "PENDING",
  "transaction": {
    "xdr": "base64-xdr",
    "totalAmount": "80.0000000",
    "royaltyAmount": "4.0000000",
    "sellerAmount": "76.0000000"
  }
}
```

---

### `DELETE /api/v1/marketplace/:listingId`

Cancel a listing. **Seller only.**

**Response `200`:**
```json
{ "status": "CANCELLED", "cancelledAt": "..." }
```

---

## 9. Reputation Endpoints

### `POST /api/v1/events/:id/rate`

Submit event rating. **Attendee only (must have checked-in ticket).**

**Request:**
```json
{
  "rating": 5,
  "review": "Amazing event, well organized!"
}
```

**Response `201`:**
```json
{
  "id": "uuid",
  "rating": 5,
  "createdAt": "..."
}
```

---

### `GET /api/v1/reputation/leaderboard`

Top organizers by reputation.

**Query params:** `trustTier`, `limit` (max 100)

**Response `200`:**
```json
{
  "data": [
    {
      "rank": 1,
      "organizer": {
        "walletAddress": "G...",
        "displayName": "DevDAO",
        "avatarUrl": "https://...",
        "trustTier": "TRUSTED",
        "reputationScore": 720,
        "totalEventsHosted": 15,
        "averageRating": 4.8
      }
    }
  ]
}
```

---

## 10. Notification Endpoints

### `GET /api/v1/notifications`

**Query params:** `unreadOnly` (bool), `page`, `limit`

**Response `200`:**
```json
{
  "data": [
    {
      "id": "uuid",
      "type": "TICKET_PURCHASED",
      "title": "Ticket Confirmed",
      "body": "Your ticket for DevConf 2025 is ready",
      "data": { "eventId": "uuid", "ticketId": "uuid" },
      "isRead": false,
      "createdAt": "..."
    }
  ],
  "meta": { "unreadCount": 3 }
}
```

---

### `POST /api/v1/notifications/read-all`

Mark all notifications read.

**Response `200`:** `{ "markedRead": 3 }`

---

## 11. Upload Endpoints

### `POST /api/v1/upload/image`

Upload image to IPFS. **Auth required.**

**Request:** `multipart/form-data`
- `file`: Image file (max 10MB, jpg/png/webp/gif)
- `type`: `banner` | `avatar`

**Response `200`:**
```json
{
  "cid": "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco",
  "url": "https://gateway.pinata.cloud/ipfs/Qm...",
  "sizeBytes": 245678
}
```

---

## Socket.IO API

### Connection

```javascript
import { io } from 'socket.io-client'

const socket = io('wss://api.steluma.xyz', {
  auth: { token: accessToken },
  transports: ['websocket'],
})
```

---

### Namespace: `/event`

Subscribe to a specific event's real-time updates.

```javascript
const eventSocket = io('wss://api.steluma.xyz/event', {
  auth: { token },
  query: { eventId: 'uuid' },
})

// Events received:
eventSocket.on('ticket_sold', (data) => {
  // data: { tierId, tierName, ticketsSold, available, totalRevenue }
})

eventSocket.on('availability_update', (data) => {
  // data: { tiers: [{ id, sold, available }] }
})

eventSocket.on('event_status_changed', (data) => {
  // data: { status: 'ACTIVE' | 'CANCELLED' | 'COMPLETED' }
})
```

---

### Namespace: `/organizer`

Organizer dashboard real-time updates.

```javascript
const dashSocket = io('wss://api.steluma.xyz/organizer', {
  auth: { token },  // Must be event organizer
  query: { eventId: 'uuid' },
})

dashSocket.on('checkin', (data) => {
  // data: { checkInId, checkedInAt, ticket: {...}, attendee: {...} }
})

dashSocket.on('revenue_update', (data) => {
  // data: { totalRevenue, ticketsSold, revenueByTier: [...] }
})

dashSocket.on('analytics_update', (data) => {
  // data: { checkedIn, totalExpected, checkInRate }
})

dashSocket.on('badge_minted', (data) => {
  // data: { badgeId, badgeType, attendeeWallet }
})
```

---

### Namespace: `/marketplace`

```javascript
const marketSocket = io('wss://api.steluma.xyz/marketplace')

marketSocket.on('listing_created', (data) => {
  // data: { listingId, eventId, price, tierName }
})

marketSocket.on('listing_sold', (data) => {
  // data: { listingId, salePrice, buyerWallet }
})

marketSocket.on('listing_cancelled', (data) => {
  // data: { listingId }
})
```

---

## Webhook Events (Stellar Horizon Polling)

Internal events processed by the backend's Horizon poller:

| Event | Trigger | Action |
|-------|---------|--------|
| `payment_received` | Purchase tx confirmed | Trigger NFT mint |
| `nft_minted` | TicketNFT contract event | Update ticket status, emit socket |
| `badge_minted` | AttendanceBadge contract event | Update badge status |
| `stake_deposited` | EscrowStaking contract event | Update stake status, enable publish |
| `stake_released` | EscrowStaking contract event | Update stake status, update reputation |
| `stake_slashed` | EscrowStaking contract event | Update status, notify organizer |
| `marketplace_sale` | Marketplace contract event | Transfer DB ownership, update listing |

---

## Pagination

All list endpoints use cursor-based pagination:

```json
{
  "data": [...],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 147,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

---

## Versioning

API version is in the URL path: `/api/v1/...`

Breaking changes increment the version. Non-breaking additions (new fields, new endpoints) do not require a version bump. Old versions are supported for 12 months after deprecation notice.
