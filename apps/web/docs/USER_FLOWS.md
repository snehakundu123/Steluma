# Steluma User Flows

## Flow 1: Attendee — Discover & Purchase Ticket

```
Landing Page
  → Browse Events (discovery grid)
    → Filter by category / location / date
      → Event Detail Page
        → View event info, organizer, tiers
          → Select ticket tier + quantity
            → [Not connected] → Connect Wallet flow
            → [Connected] → Purchase Panel
              → Confirm quantity + price
                → Sign transaction (Freighter)
                  → [Success] → Purchase Success Screen
                    → View ticket in QR → Share
                  → [Failed] → Error state + retry
```

**Edge cases handled:**
- Sold out tier → show "Waitlist" CTA
- Wallet disconnected mid-flow → reconnect prompt
- Insufficient balance → show balance + fund instructions
- Network timeout → retry with spinner
- Ticket sold between load and purchase → graceful "sold out" message

## Flow 2: Attendee — QR Check-in

```
User tickets page
  → Select active ticket
    → Full-screen QR view
      → QR rotates every 30s (countdown ring)
        → At venue: organizer scans
          → [Valid] → Green success screen + badge mint
          → [Invalid] → Red error + help link
          → [Already used] → Warning: already checked in
```

## Flow 3: Organizer — Create Event

```
Dashboard (or landing CTA)
  → Create Event Wizard

  Step 1: Event Basics
    → Title, description (markdown), category, dates, capacity
  Step 2: Banner Upload
    → Drag/drop image → IPFS upload → preview
  Step 3: Ticket Tiers
    → Add tiers (General, VIP, Early Bird...)
    → Set name, price, supply per tier
  Step 4: Advanced Settings
    → Resale enabled/disabled, max resale price, transfer lock
  Step 5: Venue / Location
    → Online vs. in-person, address, map
  Step 6: Blockchain Staking
    → Stake XLM to unlock publishing
    → Show current trust tier + required stake
  Step 7: Preview + Publish
    → Full event page preview
    → Confirm on-chain registration → publish

**Edge cases:**
- Unsaved changes → browser leave warning
- Upload failure → retry + manual URL fallback
- Insufficient stake → link to funding
- Draft autosave every 60s
```

## Flow 4: Organizer — QR Scanner

```
Scanner page (/scanner/[eventId])
  → Select event
    → Camera permission request
      → [Granted] → Live camera view
        → Point at attendee QR
          → [Valid] → Green flash + attendee name
          → [Already scanned] → Amber warning
          → [Invalid/expired] → Red flash
        → Live counter updates
      → [Denied] → Manual code entry fallback
```

## Flow 5: User — Resale Listing

```
My Tickets
  → Select ticket
    → "List for Resale" (if enabled)
      → Set price (with max resale limit displayed)
        → Sign listing transaction
          → Ticket appears in marketplace
            → [Sold] → Proceeds to wallet, ticket NFT transfers
            → [Cancel] → Delist, ticket returns to wallet
```

## Flow 6: Attendance Badge

```
Check-in success
  → "You earned a badge!" celebration screen
    → Confetti animation
      → Badge reveal (animated)
        → "Add to profile" or "Share"
          → Badge appears in user's badge gallery
```

## Flow 7: Organizer Staking

```
Dashboard → Staking tab
  → View current stake, required stake, trust tier
    → [Stake more] → Input XLM amount
      → Preview new trust tier
        → Confirm + sign
          → Trust tier updates
            → Events now show upgraded trust badge
```

## Error States

| Scenario | UI Response |
|----------|-------------|
| API timeout | Skeleton → error state with retry button |
| Wallet disconnected | Modal prompt to reconnect |
| Transaction failed | Red toast + expand for details |
| Invalid ticket | Red flash + help text |
| Sold out (mid-purchase) | Graceful "just sold out" modal |
| Network offline | Offline banner + disabled actions |
| Image upload failed | Inline error + retry |
| Insufficient gas | Balance warning with top-up link |
| Event cancelled | Banner warning on event page |
| QR expired | Auto-refresh, countdown visible |
