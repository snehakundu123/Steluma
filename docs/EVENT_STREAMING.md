# Steluma Event Streaming Architecture

## Overview

Steluma uses a dual-layer event streaming architecture:
1. **On-chain events**: Soroban contract events (typed via `#[contractevent]`)
2. **Application-layer events**: Socket.IO namespaces for real-time UI updates

---

## Layer 1: Soroban Contract Events

All 5 contracts emit typed events using the `#[contractevent]` macro (Soroban SDK v26+).

### Why `#[contractevent]` vs `events().publish()`

The older `events().publish()` API required manually constructing topics as Symbol tuples, which:
- Had no type safety
- Made filtering from Horizon difficult
- Was deprecated in SDK v26

The `#[contractevent]` macro generates:
- Properly typed event structs
- Automatic XDR encoding
- Cleaner Horizon filtering by contract event type

### Event Schema

#### EventFactoryContract

```rust
#[contractevent]
pub struct EventCreated {
    pub event_id: u64,
    pub organizer: Address,
    pub total_tickets: u32,
}

#[contractevent]
pub struct TicketSold {
    pub event_id: u64,
    pub tickets_sold: u32,
    pub remaining: u32,
}

#[contractevent]
pub struct EventCancelled {
    pub event_id: u64,
    pub cancelled_by: Address,
}

#[contractevent]
pub struct EventCompleted { pub event_id: u64 }
#[contractevent]
pub struct EventUpdated { pub event_id: u64 }
```

#### TicketNFTContract

```rust
#[contractevent]
pub struct TicketMinted {
    pub ticket_id: u64,
    pub event_id: u64,
    pub owner: Address,
    pub tier: Symbol,
}

#[contractevent]
pub struct TicketTransferred {
    pub ticket_id: u64,
    pub from: Address,
    pub to: Address,
}

#[contractevent]
pub struct TicketLocked {
    pub ticket_id: u64,
    pub owner: Address,
}
```

#### AttendanceBadgeContract

```rust
#[contractevent]
pub struct BadgeMinted {
    pub badge_id: u64,
    pub event_id: u64,
    pub owner: Address,
    pub badge_type: BadgeType,
}
```

#### EscrowStakingContract

```rust
#[contractevent]
pub struct Staked { pub event_id: u64, pub organizer: Address, pub amount: i128 }
#[contractevent]
pub struct StakeCompleted { pub event_id: u64, pub release_after: u64 }
#[contractevent]
pub struct StakeReleased { pub event_id: u64, pub organizer: Address, pub amount: i128 }
#[contractevent]
pub struct DisputeFiled { pub event_id: u64 }
#[contractevent]
pub struct StakeSlashed { pub event_id: u64, pub slash_amount: i128, pub slash_bps: u32 }
```

#### MarketplaceContract

```rust
#[contractevent]
pub struct ListingCreated { pub listing_id: u64, pub ticket_id: u64, pub seller: Address, pub price: i128 }
#[contractevent]
pub struct ListingSold { pub listing_id: u64, pub buyer: Address, pub seller: Address, pub price: i128, pub royalty_amount: i128 }
#[contractevent]
pub struct ListingCancelled { pub listing_id: u64, pub seller: Address }
```

---

## Layer 2: Socket.IO Application Events

### Namespace Design

Three namespaces with different authorization requirements:

| Namespace | Auth | Purpose |
|-----------|------|---------|
| `/event` | None | Public event feed (ticket sales, marketplace activity) |
| `/organizer` | JWT required | Private organizer dashboard (check-ins, revenue) |
| `/marketplace` | None | Global marketplace feed (new listings, sales) |

### Room Strategy

```
/event namespace:
  Room: "event:{eventId}"  — all events for a specific event

/organizer namespace:
  Room: "organizer:{eventId}" — dashboard for a specific event

/marketplace namespace:
  Room: "marketplace" — single global room
```

### Event Name Conventions

All event names use colon-separated namespacing:

| Socket Event | Namespace | Trigger |
|-------------|-----------|---------|
| `ticket:sold` | /event | Ticket purchase confirmed |
| `marketplace:activity` | /event | Listing created/sold for this event |
| `checkin:complete` | /organizer | QR code scanned at door |
| `revenue:update` | /organizer | New ticket sale revenue |
| `badge:minted` | /organizer | Attendance badge issued |
| `listing:created` | /marketplace | New resale listing |
| `listing:sold` | /marketplace | Resale listing purchased |

---

## Horizon Polling → Socket.IO Bridge

Since Stellar doesn't push events, the API polls Horizon's `/operations` endpoint:

```typescript
class HorizonPollerService {
  private cursor: string = 'now'
  private readonly POLL_INTERVAL = 5000 // ms

  async poll() {
    const ops = await horizon.operations()
      .forContract(EVENT_FACTORY_CONTRACT_ID)
      .cursor(this.cursor)
      .limit(200)
      .call()

    for (const op of ops.records) {
      this.cursor = op.paging_token
      await this.processOperation(op)
    }
  }
}
```

The bridge translates on-chain events to Socket.IO emissions:

```
Horizon: TicketSold event detected
  ↓
HorizonPollerService.processOperation()
  ↓
emitTicketSold(eventId, tierId, tierName, ticketsSold, available, totalRevenue)
  ↓
/event room "event:{eventId}" ← ticket:sold payload
/organizer room "organizer:{eventId}" ← revenue:update payload
```

---

## Frontend Integration

### useEventRealtime Hook

```typescript
export function useEventRealtime(eventId: string | null) {
  const socketRef = useRef<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [lastEvent, setLastEvent] = useState<unknown>(null)

  useEffect(() => {
    if (!eventId) return
    const socket = io(`${API_URL}/event`, {
      query: { eventId },
      reconnection: true,
      reconnectionAttempts: Infinity,  // never give up
      reconnectionDelayMax: 10_000,
    })

    socket.on('ticket:sold', (data) => setLastEvent({ type: 'ticket:sold', data }))
    socket.on('marketplace:activity', (data) => setLastEvent({ type: 'marketplace:activity', data }))

    return () => socket.disconnect()
  }, [eventId])

  return { isConnected, lastEvent }
}
```

### Reconnection Guarantees

- **Infinite reconnection**: `reconnectionAttempts: Infinity` — the hook never permanently disconnects
- **Exponential backoff**: starts at 1s, caps at 10s
- **State reset**: `isConnected` set to `false` during disconnection; UI can show "Reconnecting..." indicator
- **No stale closures**: `useEffect` deps include `eventId` so socket reconnects if event changes

---

## Testing Event Emissions

Soroban testutils capture all events emitted during test execution. Verify with snapshot tests:

```rust
#[test]
fn test_event_emitted_on_sale() {
    let env = Env::default();
    env.mock_all_auths();
    // ... setup ...
    
    client.record_sale(&ticket_contract, &event_id);
    
    // Events are captured in test_snapshots/ directory
    // via Soroban's built-in snapshot mechanism
}
```

The `test_snapshots/` directory under each contract stores golden snapshots of emitted events, enabling regression detection if event schemas change.
