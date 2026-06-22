# Steluma Component Map

## Component Hierarchy

```
App
├── RootLayout
│   ├── Providers (Query, Socket, Notifications)
│   ├── Navbar
│   │   ├── Logo
│   │   ├── NavLinks
│   │   ├── SearchTrigger
│   │   ├── NotificationBell
│   │   └── UserMenu / ConnectWalletButton
│   ├── [page content]
│   ├── Footer (marketing pages)
│   └── MobileNav (mobile bottom bar)
```

## Shared Components

### EventCard
Props: `event`, `index` (for stagger), `variant: 'default' | 'featured' | 'compact'`
- Default: image header + content + price
- Featured: larger image, prominent display
- Compact: horizontal layout for lists

### TicketCard
Props: `ticket`, `variant: 'wallet' | 'detail' | 'checkin'`
- Wallet: shows QR preview, event name, seat info
- Detail: full ticket with QR code, transfer/resale actions
- Checkin: large QR for scanning, animated rotation

### BadgeCard
Props: `badge`, `variant: 'gallery' | 'featured'`
- Hexagonal or circular design
- Animated glow on hover
- Event metadata below

### OrganizerCard
Props: `organizer`, `variant: 'card' | 'inline' | 'featured'`
- Shows trust tier, verified badge
- Event count, attendee count
- Rating stars

### StatsCounter
Props: `value`, `label`, `prefix?`, `suffix?`, `live?: boolean`
- Animates count-up on mount
- Pulses when value changes (live mode)

### LiveIndicator
Props: `label?`, `count?`
- Green pulsing dot
- Optional count badge

### TrustBadge
Props: `tier: 'NEW' | 'VERIFIED' | 'TRUSTED' | 'PARTNER'`
- Color-coded pill
- Icon per tier

### Skeleton
Props: `variant: 'card' | 'event-card' | 'ticket' | 'badge' | 'text' | 'avatar'`
- Shimmer animation
- Matches exact component dimensions

### EmptyState
Props: `title`, `description`, `action?`, `icon?`
- Centered illustration + text
- Optional CTA button

## Feature Components

### EventPurchasePanel (Sticky sidebar)
- Ticket tier selector
- Quantity input with availability
- Wallet connect guard
- Transaction state machine
- Success/failure states

### EventHero
- Full-bleed banner image
- Gradient overlay
- Event title + date chip
- Share button
- Back navigation

### AttendeeList
- Avatar stack (first 5)
- "+N more" overflow
- Real-time count badge

### OrganizerSection
- Organizer card inline
- Verified badge
- Quick stats

### TicketTierCard
- Tier name + price
- Availability bar
- Select button
- Sold out state

### MultiStepWizard
Steps: basics → banner → tickets → pricing → venue → staking → preview
- Progress indicator
- Navigation (back/next/save draft)
- Step validation
- Animated transitions

### QRDisplay
- qrcode.react wrapper
- Auto-rotation every 30s countdown
- Anti-screenshot overlay
- Fullscreen mode

### DashboardChart
- Recharts wrapper (or placeholder)
- Revenue over time
- Ticket sales
- Attendee demographics

### ActivityFeed
- Real-time purchase/checkin events
- Slide-in animation
- Relative timestamps

### NotificationBell
- Unread count badge
- Dropdown inbox
- Mark all read

## Layout Components

### DashboardSidebar
- Nav items with icons
- Active state
- Collapsible (desktop)
- Sheet overlay (mobile)

### PageHeader
Props: `title`, `description?`, `actions?`
- Consistent page titles across dashboard

### SectionHeader
Props: `title`, `subtitle?`, `action?`
- Section headings in content areas

## UI Primitives (shadcn + custom)

Existing: Button, Card, Input, Textarea, Select, Label, Avatar,
Badge, Dialog, DropdownMenu, Tooltip, Tabs, Progress, Separator, Toast

Added:
- ImageUpload (drag & drop with preview)
- NumberInput (with increment/decrement)
- DateTimePicker (event scheduling)
- MarkdownEditor (event description)
- AddressInput (wallet address with validation)
- PriceInput (with currency selector)
- ProgressRing (circular progress)
- Accordion (FAQ sections)
- Timeline (event schedule)
- Sheet (mobile overlays)
- Drawer (mobile panels)
