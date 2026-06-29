# Steluma — Architecture Issues

**Date:** 2026-06-05

---

## AR-01: Socket.IO Namespace/Event Name Mismatch

### Problem
The backend creates three named Socket.IO namespaces: `/event`, `/organizer`, `/marketplace`.
The frontend's `useRealtime` hook connects to `io(apiUrl)` — the root namespace.

Backend emits (via socket.service.ts):
- `emitToOrganizer(eventId, 'checkin', ...)` → `/organizer` namespace, room `organizer:${eventId}`
- `emitToEvent(eventId, 'ticket_sold', ...)` → `/event` namespace, room `event:${eventId}`
- `emitToMarketplace('listing_created', ...)` → `/marketplace` namespace, room `marketplace`

Frontend listens (use-realtime.ts):
- `socket.on('ticket:sold', ...)` — wrong namespace, wrong event name
- `socket.on('checkin:complete', ...)` — wrong namespace, wrong event name
- `socket.on('listing:created', ...)` — wrong namespace, wrong event name

**Result:** Zero realtime events are ever received by the frontend.

### Fix
Either: (a) consolidate to a single namespace with room-based routing, OR (b) connect the frontend to each namespace separately using different socket connections for public/organizer/marketplace contexts.

---

## AR-02: Ticket ID Format Breaks UUID Contract

### Problem
Tickets are created with IDs like `${purchaseId}-0`, `${purchaseId}-1`. The Prisma schema declares `@id @default(uuid())` but these IDs override the default. They are valid strings but fail UUID format validation (e.g., `z.string().uuid()` in any route that accepts ticketId). They also break the `confirmPurchase` query which does `id: { startsWith: purchaseId }` — a fragile string prefix scan instead of a proper lookup.

### Fix
Assign proper UUIDs at purchase initiation. Store the `purchaseId` as a separate indexed column `purchase_batch_id` on the Ticket table, then query by that field in `confirmPurchase`.

---

## AR-03: Soroban BadgeType Enum XDR Encoding

### Problem
The scanner service encodes the Soroban `BadgeType` enum as:
```typescript
StellarSdk.xdr.ScVal.scvVec([
  StellarSdk.xdr.ScVal.scvSymbol(badgeTypeSymbol),
])
```
Soroban `contracttype` enums compile to `scvMap` with a single key (the variant name) mapping to `Void`. A Vec encoding will fail the contract call.

### Correct encoding
```typescript
StellarSdk.xdr.ScVal.scvMap([
  new StellarSdk.xdr.ScMapEntry({
    key: StellarSdk.xdr.ScVal.scvSymbol(variantName),
    val: StellarSdk.xdr.ScVal.scvVoid(),
  }),
])
```

---

## AR-04: Marketplace Horizon Poller Non-Deterministic

### Problem
`handleMarketplaceSale` does:
```typescript
const listing = await prisma.marketplaceListing.findFirst({
  where: { status: 'ACTIVE' },
})
```
It finds ANY active listing. If 10 listings are active and any marketplace sale event fires, it marks the first listing as sold regardless of which listing actually sold on-chain.

### Fix
Parse the on-chain event topic to extract the listing_id (topics[2] in the marketplace contract), then find the listing by `onChainListingId`. This requires storing the on-chain listing_id when a listing is created.

---

## AR-05: Staking Flow Uses Horizon Payment (Not Soroban EscrowContract)

### Problem
The stake flow builds a Horizon-layer XLM payment to the admin wallet:
```typescript
StellarSdk.Operation.payment({
  destination: escrowDestination,  // = adminKeypair.publicKey()
  asset: StellarSdk.Asset.native(),
  amount: parseFloat(amount).toFixed(7),
})
```
The Soroban `EscrowStakingContract` is never invoked for staking. Funds go to the admin wallet, not the smart contract. The dispute/slash/release mechanisms in the Soroban contract are completely bypassed.

### Fix
Build a Soroban transaction that calls `EscrowStakingContract.stake()` directly. The organizer (as tx source) authorizes the token transfer to the contract. This is a significant architectural change that makes the staking trustless.

---

## AR-06: Realtime Socket Connection in useRealtime Doesn't Join Rooms

### Problem
Even if the namespace issue is fixed, the `useRealtime` hook doesn't emit `join:event` or `join:organizer` events to subscribe to specific rooms. It connects globally and receives nothing specific.

### Fix
Pass `eventId` to `useRealtime` and emit a room-join event on connect.

---

## AR-07: No Database-Level Constraint for Ticket Availability

### Problem
Overselling is prevented only at the application layer with a lock:
```typescript
if (tier.sold + quantity > tier.totalSupply) throw new Error('TICKET_SOLD_OUT')
```
If the Redis lock fails, is unavailable, or the check-then-set window has a race, tickets can be oversold. The database has no CHECK constraint.

### Fix
Add a PostgreSQL check constraint or use `UPDATE ... WHERE sold + quantity <= total_supply RETURNING id` with a count check.

---

## AR-08: confirmPurchase Uses String Prefix Scan

### Problem
```typescript
await prisma.ticket.findMany({
  where: { id: { startsWith: purchaseId }, status: 'PENDING' },
})
```
`startsWith` translates to `id LIKE 'uuid%'` which is not indexed on the primary key (though it may use the index prefix scan). With non-UUID IDs this is brittle and could match wrong records if UUID prefix collision occurs.

### Fix
Store `purchaseBatchId` as a separate indexed column and query by that.
