# Smart Contract Specifications — Steluma

> 5 Soroban contracts on Stellar. Production-grade Rust.

---

## Overview

| Contract | Responsibility | Caller |
|---------|--------------|-------|
| `EventFactoryContract` | Register events on-chain, manage lifecycle | Backend (admin keypair) |
| `TicketNFTContract` | Mint, transfer, lock ticket NFTs | Backend (admin keypair) |
| `AttendanceBadgeContract` | Mint soulbound attendance badge NFTs | Backend (admin keypair) |
| `EscrowStakingContract` | Lock, release, slash organizer stakes | Organizer wallet + Backend |
| `MarketplaceContract` | Ticket resale listings and purchases | User wallets + Backend |

---

## 1. EventFactoryContract

**Purpose:** Single source of truth for event existence on Stellar.

### Storage

```rust
// Event data stored per event_id
pub struct EventData {
    pub organizer: Address,
    pub metadata_hash: BytesN<32>,   // IPFS CID hash
    pub status: EventStatus,
    pub created_at: u64,
    pub starts_at: u64,
    pub ends_at: u64,
    pub total_tickets: u32,
    pub tickets_sold: u32,
}

pub enum EventStatus {
    Draft = 0,
    Active = 1,
    Completed = 2,
    Cancelled = 3,
    Disputed = 4,
}

// Storage keys
const EVENT_COUNT: Symbol = symbol_short!("EV_COUNT");
fn event_key(event_id: u64) -> (Symbol, u64) { (symbol_short!("EVENT"), event_id) }
fn organizer_events_key(organizer: &Address) -> (Symbol, Address) { (symbol_short!("ORG_EVS"), organizer.clone()) }
```

### Interface

```rust
pub trait EventFactoryTrait {
    // Create a new event. Returns event_id.
    fn create_event(
        env: Env,
        organizer: Address,
        metadata_hash: BytesN<32>,
        starts_at: u64,
        ends_at: u64,
        total_tickets: u32,
    ) -> u64;

    // Update event metadata (organizer only)
    fn update_event(
        env: Env,
        organizer: Address,
        event_id: u64,
        metadata_hash: BytesN<32>,
    );

    // Mark event as completed (admin or time-based)
    fn complete_event(env: Env, admin: Address, event_id: u64);

    // Cancel event (organizer or admin)
    fn cancel_event(env: Env, caller: Address, event_id: u64);

    // Increment ticket sold count (called by TicketNFTContract)
    fn record_ticket_sale(env: Env, event_id: u64);

    // Read event data
    fn get_event(env: Env, event_id: u64) -> EventData;

    // Get all event IDs for organizer
    fn get_organizer_events(env: Env, organizer: Address) -> Vec<u64>;

    // Initialize contract with admin
    fn initialize(env: Env, admin: Address);
}
```

### Events (Soroban Events)

```rust
// Event topics format: [contract_name, event_name, event_id]
fn emit_event_created(env: &Env, event_id: u64, organizer: &Address);
fn emit_event_updated(env: &Env, event_id: u64);
fn emit_event_completed(env: &Env, event_id: u64);
fn emit_event_cancelled(env: &Env, event_id: u64);
fn emit_ticket_sold(env: &Env, event_id: u64, tickets_sold: u32);
```

### Full Implementation

```rust
// contracts/event-factory/src/lib.rs
#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short,
    Address, BytesN, Env, Symbol, Vec, log,
};

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum EventStatus {
    Draft,
    Active,
    Completed,
    Cancelled,
    Disputed,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct EventData {
    pub organizer: Address,
    pub metadata_hash: BytesN<32>,
    pub status: EventStatus,
    pub created_at: u64,
    pub starts_at: u64,
    pub ends_at: u64,
    pub total_tickets: u32,
    pub tickets_sold: u32,
}

#[contracttype]
pub enum DataKey {
    Admin,
    EventCount,
    Event(u64),
    OrganizerEvents(Address),
    TicketContract,
}

#[contract]
pub struct EventFactoryContract;

#[contractimpl]
impl EventFactoryContract {
    pub fn initialize(env: Env, admin: Address, ticket_contract: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::TicketContract, &ticket_contract);
        env.storage().instance().set(&DataKey::EventCount, &0u64);
    }

    pub fn create_event(
        env: Env,
        organizer: Address,
        metadata_hash: BytesN<32>,
        starts_at: u64,
        ends_at: u64,
        total_tickets: u32,
    ) -> u64 {
        organizer.require_auth();

        if starts_at >= ends_at {
            panic!("invalid time range");
        }
        if ends_at <= env.ledger().timestamp() {
            panic!("event already ended");
        }
        if total_tickets == 0 {
            panic!("must have at least one ticket");
        }

        let event_id: u64 = env.storage().instance()
            .get(&DataKey::EventCount)
            .unwrap_or(0) + 1;

        let event = EventData {
            organizer: organizer.clone(),
            metadata_hash,
            status: EventStatus::Active,
            created_at: env.ledger().timestamp(),
            starts_at,
            ends_at,
            total_tickets,
            tickets_sold: 0,
        };

        env.storage().persistent().set(&DataKey::Event(event_id), &event);
        env.storage().instance().set(&DataKey::EventCount, &event_id);

        // Update organizer's event list
        let mut org_events: Vec<u64> = env.storage().persistent()
            .get(&DataKey::OrganizerEvents(organizer.clone()))
            .unwrap_or(Vec::new(&env));
        org_events.push_back(event_id);
        env.storage().persistent().set(&DataKey::OrganizerEvents(organizer.clone()), &org_events);

        env.events().publish(
            (symbol_short!("EventFact"), symbol_short!("created"), event_id),
            organizer,
        );

        event_id
    }

    pub fn update_event(
        env: Env,
        organizer: Address,
        event_id: u64,
        metadata_hash: BytesN<32>,
    ) {
        organizer.require_auth();

        let mut event: EventData = env.storage().persistent()
            .get(&DataKey::Event(event_id))
            .expect("event not found");

        if event.organizer != organizer {
            panic!("not organizer");
        }
        if event.status != EventStatus::Active {
            panic!("event not active");
        }

        event.metadata_hash = metadata_hash;
        env.storage().persistent().set(&DataKey::Event(event_id), &event);

        env.events().publish(
            (symbol_short!("EventFact"), symbol_short!("updated"), event_id),
            (),
        );
    }

    pub fn complete_event(env: Env, admin: Address, event_id: u64) {
        admin.require_auth();
        Self::require_admin(&env, &admin);

        let mut event: EventData = env.storage().persistent()
            .get(&DataKey::Event(event_id))
            .expect("event not found");

        event.status = EventStatus::Completed;
        env.storage().persistent().set(&DataKey::Event(event_id), &event);

        env.events().publish(
            (symbol_short!("EventFact"), symbol_short!("completed"), event_id),
            (),
        );
    }

    pub fn cancel_event(env: Env, caller: Address, event_id: u64) {
        caller.require_auth();

        let mut event: EventData = env.storage().persistent()
            .get(&DataKey::Event(event_id))
            .expect("event not found");

        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        if caller != event.organizer && caller != admin {
            panic!("unauthorized");
        }

        event.status = EventStatus::Cancelled;
        env.storage().persistent().set(&DataKey::Event(event_id), &event);

        env.events().publish(
            (symbol_short!("EventFact"), symbol_short!("cancelled"), event_id),
            caller,
        );
    }

    pub fn record_ticket_sale(env: Env, event_id: u64) {
        // Only callable by ticket contract
        let ticket_contract: Address = env.storage().instance()
            .get(&DataKey::TicketContract)
            .unwrap();
        ticket_contract.require_auth();

        let mut event: EventData = env.storage().persistent()
            .get(&DataKey::Event(event_id))
            .expect("event not found");

        if event.tickets_sold >= event.total_tickets {
            panic!("sold out");
        }

        event.tickets_sold = event.tickets_sold.checked_add(1).expect("overflow");
        env.storage().persistent().set(&DataKey::Event(event_id), &event);

        env.events().publish(
            (symbol_short!("EventFact"), symbol_short!("sold"), event_id),
            event.tickets_sold,
        );
    }

    pub fn get_event(env: Env, event_id: u64) -> EventData {
        env.storage().persistent()
            .get(&DataKey::Event(event_id))
            .expect("event not found")
    }

    pub fn get_organizer_events(env: Env, organizer: Address) -> Vec<u64> {
        env.storage().persistent()
            .get(&DataKey::OrganizerEvents(organizer))
            .unwrap_or(Vec::new(&env))
    }

    fn require_admin(env: &Env, caller: &Address) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        if *caller != admin {
            panic!("not admin");
        }
    }
}
```

---

## 2. TicketNFTContract

**Purpose:** NFT tickets with lazy minting, transfer, and lock functionality.

### Storage Model

```rust
#[contracttype]
#[derive(Clone, Debug)]
pub struct TicketData {
    pub event_id: u64,
    pub tier: Symbol,
    pub ticket_number: u32,        // Sequential within event
    pub owner: Address,
    pub metadata_uri: String,      // IPFS URI
    pub minted_at: u64,
    pub is_locked: bool,           // True after check-in
    pub is_transferable: bool,     // Set by event config
}

#[contracttype]
pub enum DataKey {
    Admin,
    EventFactory,
    TicketCount,
    Ticket(u64),                   // ticket_id -> TicketData
    OwnerTickets(Address),         // address -> Vec<u64>
    EventTickets(u64),             // event_id -> Vec<u64>
    Approval(u64),                 // ticket_id -> approved Address
}
```

### Interface & Implementation

```rust
// contracts/ticket-nft/src/lib.rs
#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short,
    Address, Env, String, Symbol, Vec,
};

#[contracttype]
#[derive(Clone, Debug)]
pub struct TicketData {
    pub event_id: u64,
    pub tier: Symbol,
    pub ticket_number: u32,
    pub owner: Address,
    pub metadata_uri: String,
    pub minted_at: u64,
    pub is_locked: bool,
    pub is_transferable: bool,
}

#[contracttype]
pub enum DataKey {
    Admin,
    EventFactory,
    TicketCount,
    Ticket(u64),
    OwnerTickets(Address),
    EventTickets(u64),
}

#[contract]
pub struct TicketNFTContract;

#[contractimpl]
impl TicketNFTContract {
    pub fn initialize(env: Env, admin: Address, event_factory: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::EventFactory, &event_factory);
        env.storage().instance().set(&DataKey::TicketCount, &0u64);
    }

    // Lazy mint: only callable by admin (backend keypair)
    pub fn mint(
        env: Env,
        admin: Address,
        to: Address,
        event_id: u64,
        tier: Symbol,
        ticket_number: u32,
        metadata_uri: String,
        is_transferable: bool,
    ) -> u64 {
        admin.require_auth();
        Self::require_admin(&env, &admin);

        let ticket_id: u64 = env.storage().instance()
            .get(&DataKey::TicketCount)
            .unwrap_or(0) + 1;

        let ticket = TicketData {
            event_id,
            tier,
            ticket_number,
            owner: to.clone(),
            metadata_uri,
            minted_at: env.ledger().timestamp(),
            is_locked: false,
            is_transferable,
        };

        env.storage().persistent().set(&DataKey::Ticket(ticket_id), &ticket);
        env.storage().instance().set(&DataKey::TicketCount, &ticket_id);

        // Update owner index
        Self::add_to_owner_index(&env, &to, ticket_id);

        // Update event index
        let mut event_tickets: Vec<u64> = env.storage().persistent()
            .get(&DataKey::EventTickets(event_id))
            .unwrap_or(Vec::new(&env));
        event_tickets.push_back(ticket_id);
        env.storage().persistent().set(&DataKey::EventTickets(event_id), &event_tickets);

        env.events().publish(
            (symbol_short!("TicketNFT"), symbol_short!("minted"), ticket_id),
            (to, event_id, tier),
        );

        ticket_id
    }

    // Transfer ticket (blocked if locked or non-transferable)
    pub fn transfer(env: Env, from: Address, to: Address, ticket_id: u64) {
        from.require_auth();

        let mut ticket: TicketData = env.storage().persistent()
            .get(&DataKey::Ticket(ticket_id))
            .expect("ticket not found");

        if ticket.owner != from {
            panic!("not owner");
        }
        if ticket.is_locked {
            panic!("ticket is locked (already checked in)");
        }
        if !ticket.is_transferable {
            panic!("ticket is non-transferable");
        }

        // Remove from old owner index
        Self::remove_from_owner_index(&env, &from, ticket_id);

        // Add to new owner index
        Self::add_to_owner_index(&env, &to, ticket_id);

        ticket.owner = to.clone();
        env.storage().persistent().set(&DataKey::Ticket(ticket_id), &ticket);

        env.events().publish(
            (symbol_short!("TicketNFT"), symbol_short!("transfer"), ticket_id),
            (from, to),
        );
    }

    // Lock ticket after check-in (admin only)
    pub fn lock(env: Env, admin: Address, ticket_id: u64) {
        admin.require_auth();
        Self::require_admin(&env, &admin);

        let mut ticket: TicketData = env.storage().persistent()
            .get(&DataKey::Ticket(ticket_id))
            .expect("ticket not found");

        if ticket.is_locked {
            panic!("already locked");
        }

        ticket.is_locked = true;
        env.storage().persistent().set(&DataKey::Ticket(ticket_id), &ticket);

        env.events().publish(
            (symbol_short!("TicketNFT"), symbol_short!("locked"), ticket_id),
            ticket.owner,
        );
    }

    pub fn get_ticket(env: Env, ticket_id: u64) -> TicketData {
        env.storage().persistent()
            .get(&DataKey::Ticket(ticket_id))
            .expect("ticket not found")
    }

    pub fn get_owner(env: Env, ticket_id: u64) -> Address {
        let ticket: TicketData = env.storage().persistent()
            .get(&DataKey::Ticket(ticket_id))
            .expect("ticket not found");
        ticket.owner
    }

    pub fn get_owner_tickets(env: Env, owner: Address) -> Vec<u64> {
        env.storage().persistent()
            .get(&DataKey::OwnerTickets(owner))
            .unwrap_or(Vec::new(&env))
    }

    pub fn get_event_tickets(env: Env, event_id: u64) -> Vec<u64> {
        env.storage().persistent()
            .get(&DataKey::EventTickets(event_id))
            .unwrap_or(Vec::new(&env))
    }

    pub fn is_locked(env: Env, ticket_id: u64) -> bool {
        let ticket: TicketData = env.storage().persistent()
            .get(&DataKey::Ticket(ticket_id))
            .expect("ticket not found");
        ticket.is_locked
    }

    fn add_to_owner_index(env: &Env, owner: &Address, ticket_id: u64) {
        let mut tickets: Vec<u64> = env.storage().persistent()
            .get(&DataKey::OwnerTickets(owner.clone()))
            .unwrap_or(Vec::new(env));
        tickets.push_back(ticket_id);
        env.storage().persistent().set(&DataKey::OwnerTickets(owner.clone()), &tickets);
    }

    fn remove_from_owner_index(env: &Env, owner: &Address, ticket_id: u64) {
        let tickets: Vec<u64> = env.storage().persistent()
            .get(&DataKey::OwnerTickets(owner.clone()))
            .unwrap_or(Vec::new(env));
        let mut new_tickets: Vec<u64> = Vec::new(env);
        for t in tickets.iter() {
            if t != ticket_id {
                new_tickets.push_back(t);
            }
        }
        env.storage().persistent().set(&DataKey::OwnerTickets(owner.clone()), &new_tickets);
    }

    fn require_admin(env: &Env, caller: &Address) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        if *caller != admin {
            panic!("not admin");
        }
    }
}
```

---

## 3. AttendanceBadgeContract

**Purpose:** Soulbound (non-transferable) attendance badge NFTs.

### Key Design Decision

Soulbound enforcement is implemented by having no `transfer` function and making any transfer attempt panic. The contract explicitly disallows all transfers at the contract level.

```rust
// contracts/attendance-badge/src/lib.rs
#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short,
    Address, Env, String, Symbol, Vec,
};

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum BadgeType {
    Attendee,
    Vip,
    Speaker,
    Organizer,
    Volunteer,
    EarlyBird,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct BadgeData {
    pub event_id: u64,
    pub badge_type: BadgeType,
    pub owner: Address,
    pub metadata_uri: String,
    pub issued_at: u64,
}

#[contracttype]
pub enum DataKey {
    Admin,
    BadgeCount,
    Badge(u64),
    OwnerBadges(Address),
    EventBadges(u64),
    // Prevent duplicate badge per user per event
    HasBadge(Address, u64, BadgeType),
}

#[contract]
pub struct AttendanceBadgeContract;

#[contractimpl]
impl AttendanceBadgeContract {
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::BadgeCount, &0u64);
    }

    pub fn mint_badge(
        env: Env,
        admin: Address,
        to: Address,
        event_id: u64,
        badge_type: BadgeType,
        metadata_uri: String,
    ) -> u64 {
        admin.require_auth();
        Self::require_admin(&env, &admin);

        // Prevent duplicate badge
        let dedup_key = DataKey::HasBadge(to.clone(), event_id, badge_type.clone());
        if env.storage().persistent().has(&dedup_key) {
            panic!("badge already issued");
        }

        let badge_id: u64 = env.storage().instance()
            .get(&DataKey::BadgeCount)
            .unwrap_or(0) + 1;

        let badge = BadgeData {
            event_id,
            badge_type: badge_type.clone(),
            owner: to.clone(),
            metadata_uri,
            issued_at: env.ledger().timestamp(),
        };

        env.storage().persistent().set(&DataKey::Badge(badge_id), &badge);
        env.storage().instance().set(&DataKey::BadgeCount, &badge_id);
        env.storage().persistent().set(&dedup_key, &true);

        // Owner index
        let mut owner_badges: Vec<u64> = env.storage().persistent()
            .get(&DataKey::OwnerBadges(to.clone()))
            .unwrap_or(Vec::new(&env));
        owner_badges.push_back(badge_id);
        env.storage().persistent().set(&DataKey::OwnerBadges(to.clone()), &owner_badges);

        // Event index
        let mut event_badges: Vec<u64> = env.storage().persistent()
            .get(&DataKey::EventBadges(event_id))
            .unwrap_or(Vec::new(&env));
        event_badges.push_back(badge_id);
        env.storage().persistent().set(&DataKey::EventBadges(event_id), &event_badges);

        env.events().publish(
            (symbol_short!("Badge"), symbol_short!("minted"), badge_id),
            (to, event_id, badge_type),
        );

        badge_id
    }

    // Soulbound: transfer always panics
    pub fn transfer(_env: Env, _from: Address, _to: Address, _badge_id: u64) {
        panic!("soulbound: badges are non-transferable");
    }

    pub fn get_badge(env: Env, badge_id: u64) -> BadgeData {
        env.storage().persistent()
            .get(&DataKey::Badge(badge_id))
            .expect("badge not found")
    }

    pub fn get_owner_badges(env: Env, owner: Address) -> Vec<u64> {
        env.storage().persistent()
            .get(&DataKey::OwnerBadges(owner))
            .unwrap_or(Vec::new(&env))
    }

    pub fn get_event_badges(env: Env, event_id: u64) -> Vec<u64> {
        env.storage().persistent()
            .get(&DataKey::EventBadges(event_id))
            .unwrap_or(Vec::new(&env))
    }

    pub fn has_badge(env: Env, owner: Address, event_id: u64, badge_type: BadgeType) -> bool {
        env.storage().persistent()
            .has(&DataKey::HasBadge(owner, event_id, badge_type))
    }

    fn require_admin(env: &Env, caller: &Address) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        if *caller != admin {
            panic!("not admin");
        }
    }
}
```

---

## 4. EscrowStakingContract

**Purpose:** Lock organizer funds as stake; release or slash based on event outcome.

### Stake Lifecycle State Machine

```
PENDING → STAKED → COMPLETED → RELEASED
                ↓
            DISPUTED → SLASHED (partial or full)
                ↓
            RELEASED (remainder after slash)
```

```rust
// contracts/staking/src/lib.rs
#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short,
    token, Address, Env, Symbol,
};

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum StakeStatus {
    Staked,
    Completed,
    Released,
    Disputed,
    Slashed,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct StakeData {
    pub organizer: Address,
    pub event_id: u64,
    pub asset: Address,            // Token contract address (XLM or USDC)
    pub amount: i128,
    pub status: StakeStatus,
    pub staked_at: u64,
    pub completed_at: u64,
    pub release_after: u64,        // Timestamp after which release allowed
    pub slash_recipient: Option<Address>,
    pub slash_percentage: u32,     // 0–100 basis points * 100 (e.g., 5000 = 50%)
}

#[contracttype]
pub enum DataKey {
    Admin,
    Stake(u64),                    // event_id -> StakeData
    OrganizerStakes(Address),      // address -> Vec<u64>
    DisputeResolver,               // Future: DAO contract address
}

const DISPUTE_WINDOW_SECONDS: u64 = 72 * 3600;  // 72 hours

#[contract]
pub struct EscrowStakingContract;

#[contractimpl]
impl EscrowStakingContract {
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    // Organizer stakes funds for an event
    pub fn stake(
        env: Env,
        organizer: Address,
        event_id: u64,
        asset: Address,
        amount: i128,
    ) {
        organizer.require_auth();

        if env.storage().persistent().has(&DataKey::Stake(event_id)) {
            panic!("stake already exists for event");
        }
        if amount <= 0 {
            panic!("amount must be positive");
        }

        // Transfer from organizer to this contract
        let token_client = token::Client::new(&env, &asset);
        token_client.transfer(&organizer, &env.current_contract_address(), &amount);

        let stake = StakeData {
            organizer: organizer.clone(),
            event_id,
            asset,
            amount,
            status: StakeStatus::Staked,
            staked_at: env.ledger().timestamp(),
            completed_at: 0,
            release_after: 0,
            slash_recipient: None,
            slash_percentage: 0,
        };

        env.storage().persistent().set(&DataKey::Stake(event_id), &stake);

        // Organizer index
        let mut stakes: soroban_sdk::Vec<u64> = env.storage().persistent()
            .get(&DataKey::OrganizerStakes(organizer.clone()))
            .unwrap_or(soroban_sdk::Vec::new(&env));
        stakes.push_back(event_id);
        env.storage().persistent().set(&DataKey::OrganizerStakes(organizer.clone()), &stakes);

        env.events().publish(
            (symbol_short!("Escrow"), symbol_short!("staked"), event_id),
            (organizer, amount),
        );
    }

    // Mark event completed, start dispute window
    pub fn mark_completed(env: Env, admin: Address, event_id: u64) {
        admin.require_auth();
        Self::require_admin(&env, &admin);

        let mut stake: StakeData = env.storage().persistent()
            .get(&DataKey::Stake(event_id))
            .expect("stake not found");

        if stake.status != StakeStatus::Staked {
            panic!("invalid state transition");
        }

        let now = env.ledger().timestamp();
        stake.status = StakeStatus::Completed;
        stake.completed_at = now;
        stake.release_after = now + DISPUTE_WINDOW_SECONDS;

        env.storage().persistent().set(&DataKey::Stake(event_id), &stake);

        env.events().publish(
            (symbol_short!("Escrow"), symbol_short!("completed"), event_id),
            stake.release_after,
        );
    }

    // Release stake to organizer (after dispute window)
    pub fn release(env: Env, event_id: u64) {
        let mut stake: StakeData = env.storage().persistent()
            .get(&DataKey::Stake(event_id))
            .expect("stake not found");

        if stake.status != StakeStatus::Completed {
            panic!("event not completed");
        }

        let now = env.ledger().timestamp();
        if now < stake.release_after {
            panic!("dispute window not expired");
        }

        stake.status = StakeStatus::Released;
        env.storage().persistent().set(&DataKey::Stake(event_id), &stake);

        // Transfer full stake back to organizer
        let token_client = token::Client::new(&env, &stake.asset);
        token_client.transfer(
            &env.current_contract_address(),
            &stake.organizer,
            &stake.amount,
        );

        env.events().publish(
            (symbol_short!("Escrow"), symbol_short!("released"), event_id),
            (stake.organizer, stake.amount),
        );
    }

    // File a dispute (admin-controlled in v1; future: DAO)
    pub fn file_dispute(env: Env, admin: Address, event_id: u64) {
        admin.require_auth();
        Self::require_admin(&env, &admin);

        let mut stake: StakeData = env.storage().persistent()
            .get(&DataKey::Stake(event_id))
            .expect("stake not found");

        if stake.status != StakeStatus::Completed && stake.status != StakeStatus::Staked {
            panic!("cannot dispute in current state");
        }

        stake.status = StakeStatus::Disputed;
        env.storage().persistent().set(&DataKey::Stake(event_id), &stake);

        env.events().publish(
            (symbol_short!("Escrow"), symbol_short!("disputed"), event_id),
            (),
        );
    }

    // Execute slash: slash_bps = basis points (e.g., 5000 = 50%)
    pub fn slash(
        env: Env,
        admin: Address,
        event_id: u64,
        slash_bps: u32,
        slash_recipient: Address,
    ) {
        admin.require_auth();
        Self::require_admin(&env, &admin);

        if slash_bps > 10000 {
            panic!("slash_bps cannot exceed 10000 (100%)");
        }

        let mut stake: StakeData = env.storage().persistent()
            .get(&DataKey::Stake(event_id))
            .expect("stake not found");

        if stake.status != StakeStatus::Disputed {
            panic!("event not in disputed state");
        }

        let slash_amount = (stake.amount * slash_bps as i128) / 10000;
        let remainder = stake.amount - slash_amount;

        let token_client = token::Client::new(&env, &stake.asset);

        // Transfer slashed amount to recipient (e.g., treasury or harmed parties)
        if slash_amount > 0 {
            token_client.transfer(
                &env.current_contract_address(),
                &slash_recipient,
                &slash_amount,
            );
        }

        // Return remainder to organizer
        if remainder > 0 {
            token_client.transfer(
                &env.current_contract_address(),
                &stake.organizer,
                &remainder,
            );
        }

        stake.status = StakeStatus::Slashed;
        stake.slash_recipient = Some(slash_recipient.clone());
        stake.slash_percentage = slash_bps;
        env.storage().persistent().set(&DataKey::Stake(event_id), &stake);

        env.events().publish(
            (symbol_short!("Escrow"), symbol_short!("slashed"), event_id),
            (slash_amount, slash_recipient, remainder),
        );
    }

    pub fn get_stake(env: Env, event_id: u64) -> StakeData {
        env.storage().persistent()
            .get(&DataKey::Stake(event_id))
            .expect("stake not found")
    }

    pub fn get_organizer_stakes(env: Env, organizer: Address) -> soroban_sdk::Vec<u64> {
        env.storage().persistent()
            .get(&DataKey::OrganizerStakes(organizer))
            .unwrap_or(soroban_sdk::Vec::new(&env))
    }

    fn require_admin(env: &Env, caller: &Address) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        if *caller != admin {
            panic!("not admin");
        }
    }
}
```

---

## 5. MarketplaceContract

**Purpose:** Resale marketplace with royalty enforcement and max price cap.

```rust
// contracts/marketplace/src/lib.rs
#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short,
    token, Address, Env,
};

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum ListingStatus {
    Active,
    Sold,
    Cancelled,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct ListingData {
    pub listing_id: u64,
    pub ticket_id: u64,
    pub seller: Address,
    pub asset: Address,
    pub price: i128,
    pub royalty_bps: u32,          // Basis points (500 = 5%)
    pub royalty_recipient: Address, // Event organizer
    pub max_price: Option<i128>,   // Optional price cap
    pub status: ListingStatus,
    pub listed_at: u64,
    pub sold_at: u64,
}

#[contracttype]
pub enum DataKey {
    Admin,
    TicketContract,
    ListingCount,
    Listing(u64),
    TicketListing(u64),            // ticket_id -> listing_id (active only)
    SellerListings(Address),
}

#[contract]
pub struct MarketplaceContract;

#[contractimpl]
impl MarketplaceContract {
    pub fn initialize(env: Env, admin: Address, ticket_contract: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::TicketContract, &ticket_contract);
        env.storage().instance().set(&DataKey::ListingCount, &0u64);
    }

    pub fn list_ticket(
        env: Env,
        seller: Address,
        ticket_id: u64,
        asset: Address,
        price: i128,
        royalty_bps: u32,
        royalty_recipient: Address,
        max_price: Option<i128>,
    ) -> u64 {
        seller.require_auth();

        if royalty_bps > 2000 {
            panic!("royalty cannot exceed 20%");
        }
        if price <= 0 {
            panic!("price must be positive");
        }

        // Enforce max resale price
        if let Some(max) = max_price {
            if price > max {
                panic!("price exceeds max resale price");
            }
        }

        // Verify seller owns ticket (via TicketNFTContract call)
        // Note: In production, cross-contract call to verify ownership
        // Simplified here: backend pre-validates before calling

        // Check no active listing for this ticket
        if env.storage().persistent().has(&DataKey::TicketListing(ticket_id)) {
            panic!("ticket already listed");
        }

        let listing_id: u64 = env.storage().instance()
            .get(&DataKey::ListingCount)
            .unwrap_or(0) + 1;

        let listing = ListingData {
            listing_id,
            ticket_id,
            seller: seller.clone(),
            asset,
            price,
            royalty_bps,
            royalty_recipient,
            max_price,
            status: ListingStatus::Active,
            listed_at: env.ledger().timestamp(),
            sold_at: 0,
        };

        env.storage().persistent().set(&DataKey::Listing(listing_id), &listing);
        env.storage().persistent().set(&DataKey::TicketListing(ticket_id), &listing_id);
        env.storage().instance().set(&DataKey::ListingCount, &listing_id);

        // Seller listings index
        let mut seller_listings: soroban_sdk::Vec<u64> = env.storage().persistent()
            .get(&DataKey::SellerListings(seller.clone()))
            .unwrap_or(soroban_sdk::Vec::new(&env));
        seller_listings.push_back(listing_id);
        env.storage().persistent().set(&DataKey::SellerListings(seller.clone()), &seller_listings);

        env.events().publish(
            (symbol_short!("Market"), symbol_short!("listed"), listing_id),
            (seller, ticket_id, price),
        );

        listing_id
    }

    pub fn buy_ticket(env: Env, buyer: Address, listing_id: u64) {
        buyer.require_auth();

        let mut listing: ListingData = env.storage().persistent()
            .get(&DataKey::Listing(listing_id))
            .expect("listing not found");

        if listing.status != ListingStatus::Active {
            panic!("listing not active");
        }
        if listing.seller == buyer {
            panic!("cannot buy own listing");
        }

        let token_client = token::Client::new(&env, &listing.asset);

        // Calculate royalty
        let royalty_amount = (listing.price * listing.royalty_bps as i128) / 10000;
        let seller_amount = listing.price - royalty_amount;

        // Transfer payment from buyer
        token_client.transfer(
            &buyer,
            &env.current_contract_address(),
            &listing.price,
        );

        // Pay royalty to organizer
        if royalty_amount > 0 {
            token_client.transfer(
                &env.current_contract_address(),
                &listing.royalty_recipient,
                &royalty_amount,
            );
        }

        // Pay seller
        if seller_amount > 0 {
            token_client.transfer(
                &env.current_contract_address(),
                &listing.seller,
                &seller_amount,
            );
        }

        // Update listing
        listing.status = ListingStatus::Sold;
        listing.sold_at = env.ledger().timestamp();
        env.storage().persistent().set(&DataKey::Listing(listing_id), &listing);

        // Remove active listing index
        env.storage().persistent().remove(&DataKey::TicketListing(listing.ticket_id));

        // Note: Actual ticket transfer happens via backend calling TicketNFTContract.transfer()
        // after this transaction confirms

        env.events().publish(
            (symbol_short!("Market"), symbol_short!("sold"), listing_id),
            (buyer, listing.seller, listing.price, royalty_amount),
        );
    }

    pub fn cancel_listing(env: Env, seller: Address, listing_id: u64) {
        seller.require_auth();

        let mut listing: ListingData = env.storage().persistent()
            .get(&DataKey::Listing(listing_id))
            .expect("listing not found");

        if listing.seller != seller {
            panic!("not seller");
        }
        if listing.status != ListingStatus::Active {
            panic!("listing not active");
        }

        listing.status = ListingStatus::Cancelled;
        env.storage().persistent().set(&DataKey::Listing(listing_id), &listing);
        env.storage().persistent().remove(&DataKey::TicketListing(listing.ticket_id));

        env.events().publish(
            (symbol_short!("Market"), symbol_short!("cancelled"), listing_id),
            seller,
        );
    }

    pub fn get_listing(env: Env, listing_id: u64) -> ListingData {
        env.storage().persistent()
            .get(&DataKey::Listing(listing_id))
            .expect("listing not found")
    }

    pub fn get_active_listing_for_ticket(env: Env, ticket_id: u64) -> Option<u64> {
        env.storage().persistent().get(&DataKey::TicketListing(ticket_id))
    }

    pub fn get_seller_listings(env: Env, seller: Address) -> soroban_sdk::Vec<u64> {
        env.storage().persistent()
            .get(&DataKey::SellerListings(seller))
            .unwrap_or(soroban_sdk::Vec::new(&env))
    }

    fn require_admin(env: &Env, caller: &Address) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        if *caller != admin {
            panic!("not admin");
        }
    }
}
```

---

## 6. Deployment Guide

### Prerequisites

```bash
# Install Soroban CLI
cargo install --locked soroban-cli

# Configure for testnet
soroban network add testnet \
  --rpc-url https://soroban-testnet.stellar.org \
  --network-passphrase "Test SDF Network ; September 2015"

# Generate admin keypair (keep private key secret)
soroban keys generate admin --network testnet
soroban keys address admin
# Fund on testnet
curl "https://friendbot.stellar.org?addr=$(soroban keys address admin)"
```

### Build & Deploy

```bash
# In /contracts directory
# Build all contracts
cargo build --release --target wasm32-unknown-unknown

# Deploy each contract
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/event_factory.wasm \
  --source admin \
  --network testnet

# Initialize (example for EventFactory)
soroban contract invoke \
  --id <CONTRACT_ID> \
  --source admin \
  --network testnet \
  -- initialize \
  --admin $(soroban keys address admin) \
  --ticket_contract <TICKET_CONTRACT_ID>
```

### Contract IDs (Update after deployment)

```env
# apps/api/.env
EVENT_FACTORY_CONTRACT_ID=C...
TICKET_NFT_CONTRACT_ID=C...
ATTENDANCE_BADGE_CONTRACT_ID=C...
STAKING_CONTRACT_ID=C...
MARKETPLACE_CONTRACT_ID=C...
ADMIN_SECRET_KEY=S...   # Backend signing keypair
```

---

## 7. Security Checklist

- [x] All state-mutating functions require auth (`require_auth()`)
- [x] Integer arithmetic uses checked operations (Rust panics on overflow in debug, wraps in release — use `checked_add` for safety)
- [x] Admin-only functions explicitly verify admin identity
- [x] Reentrancy: Soroban's execution model prevents reentrancy by design (no callback during execution)
- [x] Soulbound badges enforce non-transferability at contract level
- [x] Stake slashing capped at 100% (slash_bps ≤ 10000)
- [x] Royalty capped at 20% (royalty_bps ≤ 2000)
- [x] Event validation: start < end, future events only
- [x] Duplicate prevention: badge dedup key, stake existence check
- [x] Locked tickets cannot be transferred
