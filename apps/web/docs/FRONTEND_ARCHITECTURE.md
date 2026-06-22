# Steluma Frontend Architecture

## Overview

Steluma's frontend is a production-grade Next.js 15 App Router application powering a blockchain-native event platform. The UI deliberately hides blockchain complexity behind a consumer-friendly product surface — users experience a premium event platform; Stellar is the trust layer underneath.

## Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Framework | Next.js 15 (App Router) | RSC, streaming, layouts, parallel routes |
| Language | TypeScript 5.7 strict | End-to-end type safety |
| Styling | Tailwind CSS 3 + CSS variables | Design token system, responsive utilities |
| Components | shadcn/ui + Radix UI | Accessible, composable primitives |
| Animation | Framer Motion 11 | Production-grade animation system |
| State | Zustand 5 | Auth, UI, real-time state slices |
| Server State | TanStack Query v5 | Data fetching, caching, optimistic updates |
| Real-time | Socket.IO client | Live ticket counts, check-ins, notifications |
| Forms | React Hook Form + Zod | Type-safe form validation |
| Icons | Lucide React | Consistent, tree-shakeable icon system |
| QR | qrcode.react | Dynamic QR generation |

## Directory Structure

```
apps/web/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── (marketing)/              # Route group: public marketing pages
│   │   │   └── page.tsx              # Landing page
│   │   ├── events/                   # Event discovery + detail
│   │   │   ├── page.tsx              # Discovery browse
│   │   │   ├── create/page.tsx       # Multi-step creation wizard
│   │   │   └── [slug]/
│   │   │       ├── page.tsx          # Event detail
│   │   │       ├── manage/page.tsx   # Organizer event management
│   │   │       └── stake/page.tsx    # Staking flow
│   │   ├── organizer/                # Organizer dashboard
│   │   │   ├── page.tsx              # Dashboard overview
│   │   │   ├── events/page.tsx       # Event management
│   │   │   └── stakes/page.tsx       # Staking management
│   │   ├── user/                     # User profile + tickets
│   │   │   ├── page.tsx              # Ticket wallet + badges
│   │   │   └── settings/page.tsx     # Profile settings
│   │   ├── marketplace/page.tsx      # Resale marketplace
│   │   ├── scanner/[eventId]/page.tsx # QR check-in scanner
│   │   ├── connect/page.tsx          # Wallet connection
│   │   ├── leaderboard/page.tsx      # Organizer leaderboard
│   │   ├── organizers/[wallet]/page.tsx # Public organizer profile
│   │   ├── layout.tsx                # Root layout (fonts, metadata)
│   │   ├── globals.css               # Design tokens, base styles
│   │   └── providers.tsx             # Client-side provider tree
│   │
│   ├── components/
│   │   ├── ui/                       # shadcn/ui primitives
│   │   ├── layout/
│   │   │   ├── navbar.tsx            # Top navigation
│   │   │   ├── footer.tsx            # Site footer
│   │   │   ├── sidebar.tsx           # Dashboard sidebar
│   │   │   └── mobile-nav.tsx        # Bottom nav (mobile)
│   │   ├── shared/                   # Cross-feature shared components
│   │   │   ├── event-card.tsx        # Event discovery card
│   │   │   ├── ticket-card.tsx       # NFT ticket display
│   │   │   ├── badge-card.tsx        # Attendance badge
│   │   │   ├── organizer-card.tsx    # Organizer profile card
│   │   │   ├── stats-counter.tsx     # Animated live counter
│   │   │   ├── live-indicator.tsx    # Pulsing live badge
│   │   │   ├── trust-badge.tsx       # Organizer trust tier
│   │   │   ├── skeleton.tsx          # Loading skeletons
│   │   │   └── empty-state.tsx       # Empty state illustrations
│   │   └── events/
│   │       ├── ticket-purchase-panel.tsx
│   │       ├── event-hero.tsx
│   │       ├── attendee-list.tsx
│   │       └── event-rating.tsx
│   │
│   ├── hooks/
│   │   ├── use-auth.ts               # Auth store selector hook
│   │   ├── use-realtime.ts           # Socket.IO connection manager
│   │   ├── use-events.ts             # Event queries
│   │   ├── use-tickets.ts            # Ticket queries + mutations
│   │   ├── use-notifications.ts      # Notification stream
│   │   └── use-wallet.ts             # Freighter wallet integration
│   │
│   ├── lib/
│   │   ├── api.ts                    # API client
│   │   ├── freighter.ts              # Stellar/Freighter helpers
│   │   └── utils.ts                  # Formatting utilities
│   │
│   ├── store/
│   │   ├── auth.store.ts             # Authentication + wallet state
│   │   ├── notification.store.ts     # In-app notifications
│   │   └── ui.store.ts               # UI preferences, modals
│   │
│   ├── providers/
│   │   ├── query.provider.tsx        # TanStack Query + devtools
│   │   ├── realtime.provider.tsx     # Socket.IO context
│   │   └── notification.provider.tsx # Toast + inbox notifications
│   │
│   └── types/
│       └── index.ts                  # Frontend-specific types
```

## Rendering Strategy

| Route | Strategy | Reason |
|-------|----------|--------|
| Landing page | Server Component (RSC) | SEO, stats from API |
| Events browse | Client Component | Filtering, search, infinite scroll |
| Event detail | RSC + Client islands | SEO for event, client for purchase |
| Dashboard | Client (auth-gated) | Real-time data, charts |
| Scanner | Client | Camera access, WebSocket |
| Ticket wallet | Client (auth-gated) | Dynamic QR, wallet data |

## Data Flow

```
Stellar Network (source of truth)
    ↕ Horizon API polling (5s)
Backend PostgreSQL (cache + enrichment)
    ↕ REST API + Socket.IO
TanStack Query (server state)
    ↕ React Query cache
React Components (UI)
    ↕ Zustand (client state)
User interactions
```

## Error Handling Architecture

1. **Route-level error.tsx** — catches RSC errors, shows branded error UI
2. **Query-level** — TanStack Query `onError` + retry logic
3. **Form-level** — Zod validation before submission
4. **Transaction-level** — Optimistic update with rollback
5. **WebSocket** — Auto-reconnect with backoff, offline indicator

## Performance Strategy

- **Images**: Next.js Image component with blur placeholders
- **Fonts**: Variable Inter via next/font (self-hosted)
- **Code splitting**: Route-based + dynamic imports for heavy components
- **Prefetching**: Link hover prefetch, query prefetch on hover
- **Skeletons**: Matching layout skeletons for all data-dependent UI
- **Memoization**: React.memo for expensive list items, useMemo for derived data
