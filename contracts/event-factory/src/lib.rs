#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, contractevent,
    Address, BytesN, Env, Vec,
};

// ── Event Types ──────────────────────────────────────────────────────────────

#[contractevent]
pub struct EventCreated {
    pub event_id: u64,
    pub organizer: Address,
    pub total_tickets: u32,
}

#[contractevent]
pub struct EventUpdated {
    pub event_id: u64,
}

#[contractevent]
pub struct EventCompleted {
    pub event_id: u64,
}

#[contractevent]
pub struct EventCancelled {
    pub event_id: u64,
    pub cancelled_by: Address,
}

#[contractevent]
pub struct TicketSold {
    pub event_id: u64,
    pub tickets_sold: u32,
    pub remaining: u32,
}

// ── Data Types ────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum EventStatus {
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
    TicketContract,
    EventCount,
    Event(u64),
    OrganizerEvents(Address),
}

// ── Ledger TTL constants (in ledgers; ~5s per ledger on mainnet) ──────────────
const PERSISTENT_TTL_BUMP: u32 = 2_628_000; // ~1 year
const INSTANCE_TTL_BUMP: u32 = 525_600;     // ~90 days

// ── Contract ─────────────────────────────────────────────────────────────────

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
        env.storage().instance().extend_ttl(INSTANCE_TTL_BUMP, INSTANCE_TTL_BUMP);
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

        let now = env.ledger().timestamp();
        if starts_at >= ends_at {
            panic!("invalid time range");
        }
        if ends_at <= now {
            panic!("event already ended");
        }
        if total_tickets == 0 {
            panic!("must have tickets");
        }

        let event_id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::EventCount)
            .unwrap_or(0u64)
            .checked_add(1)
            .expect("overflow");

        let event = EventData {
            organizer: organizer.clone(),
            metadata_hash,
            status: EventStatus::Active,
            created_at: now,
            starts_at,
            ends_at,
            total_tickets,
            tickets_sold: 0,
        };

        env.storage()
            .persistent()
            .set(&DataKey::Event(event_id), &event);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::Event(event_id), PERSISTENT_TTL_BUMP, PERSISTENT_TTL_BUMP);

        env.storage()
            .instance()
            .set(&DataKey::EventCount, &event_id);
        env.storage().instance().extend_ttl(INSTANCE_TTL_BUMP, INSTANCE_TTL_BUMP);

        let mut org_events: Vec<u64> = env
            .storage()
            .persistent()
            .get(&DataKey::OrganizerEvents(organizer.clone()))
            .unwrap_or_else(|| Vec::new(&env));
        org_events.push_back(event_id);
        env.storage()
            .persistent()
            .set(&DataKey::OrganizerEvents(organizer.clone()), &org_events);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::OrganizerEvents(organizer.clone()), PERSISTENT_TTL_BUMP, PERSISTENT_TTL_BUMP);

        env.events().publish_event(&EventCreated {
            event_id,
            organizer,
            total_tickets,
        });

        event_id
    }

    pub fn update_event(
        env: Env,
        organizer: Address,
        event_id: u64,
        metadata_hash: BytesN<32>,
    ) {
        organizer.require_auth();

        let mut event: EventData = env
            .storage()
            .persistent()
            .get(&DataKey::Event(event_id))
            .expect("event not found");

        if event.organizer != organizer {
            panic!("not organizer");
        }
        if event.status != EventStatus::Active {
            panic!("event not active");
        }

        event.metadata_hash = metadata_hash;
        env.storage()
            .persistent()
            .set(&DataKey::Event(event_id), &event);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::Event(event_id), PERSISTENT_TTL_BUMP, PERSISTENT_TTL_BUMP);

        env.events().publish_event(&EventUpdated { event_id });
    }

    pub fn complete_event(env: Env, admin: Address, event_id: u64) {
        admin.require_auth();
        Self::require_admin(&env, &admin);

        let mut event: EventData = env
            .storage()
            .persistent()
            .get(&DataKey::Event(event_id))
            .expect("event not found");

        if event.status != EventStatus::Active {
            panic!("event not active");
        }

        event.status = EventStatus::Completed;
        env.storage()
            .persistent()
            .set(&DataKey::Event(event_id), &event);

        env.events().publish_event(&EventCompleted { event_id });
    }

    pub fn cancel_event(env: Env, caller: Address, event_id: u64) {
        caller.require_auth();

        let mut event: EventData = env
            .storage()
            .persistent()
            .get(&DataKey::Event(event_id))
            .expect("event not found");

        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        if caller != event.organizer && caller != admin {
            panic!("unauthorized");
        }
        if event.status == EventStatus::Completed || event.status == EventStatus::Cancelled {
            panic!("cannot cancel in current state");
        }

        event.status = EventStatus::Cancelled;
        env.storage()
            .persistent()
            .set(&DataKey::Event(event_id), &event);

        env.events().publish_event(&EventCancelled {
            event_id,
            cancelled_by: caller,
        });
    }

    /// Called exclusively by the TicketNFTContract to increment ticket sales.
    pub fn record_sale(env: Env, caller: Address, event_id: u64) {
        caller.require_auth();
        let ticket_contract: Address = env
            .storage()
            .instance()
            .get(&DataKey::TicketContract)
            .expect("ticket contract not set");
        if caller != ticket_contract {
            panic!("only ticket contract can record sales");
        }

        let mut event: EventData = env
            .storage()
            .persistent()
            .get(&DataKey::Event(event_id))
            .expect("event not found");

        if event.status != EventStatus::Active {
            panic!("event not active");
        }
        if event.tickets_sold >= event.total_tickets {
            panic!("sold out");
        }

        event.tickets_sold = event.tickets_sold.checked_add(1).expect("overflow");
        let remaining = event.total_tickets - event.tickets_sold;
        env.storage()
            .persistent()
            .set(&DataKey::Event(event_id), &event);

        env.events().publish_event(&TicketSold {
            event_id,
            tickets_sold: event.tickets_sold,
            remaining,
        });
    }

    pub fn get_event(env: Env, event_id: u64) -> EventData {
        env.storage()
            .persistent()
            .get(&DataKey::Event(event_id))
            .expect("event not found")
    }

    pub fn get_event_count(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::EventCount)
            .unwrap_or(0)
    }

    pub fn get_organizer_events(env: Env, organizer: Address) -> Vec<u64> {
        env.storage()
            .persistent()
            .get(&DataKey::OrganizerEvents(organizer))
            .unwrap_or_else(|| Vec::new(&env))
    }

    fn require_admin(env: &Env, caller: &Address) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        if *caller != admin {
            panic!("not admin");
        }
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Address, BytesN, Env};

    fn setup(env: &Env) -> (EventFactoryContractClient, Address, Address, Address) {
        let contract_id = env.register(EventFactoryContract, ());
        let client = EventFactoryContractClient::new(env, &contract_id);
        let admin = Address::generate(env);
        let ticket_contract = Address::generate(env);
        client.initialize(&admin, &ticket_contract);
        (client, admin, ticket_contract, contract_id)
    }

    #[test]
    fn test_create_event() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _admin, _tc, _) = setup(&env);
        let organizer = Address::generate(&env);

        let hash = BytesN::from_array(&env, &[1u8; 32]);
        let now = env.ledger().timestamp();
        let event_id = client.create_event(&organizer, &hash, &(now + 100), &(now + 200), &500u32);

        assert_eq!(event_id, 1);
        assert_eq!(client.get_event_count(), 1);

        let event = client.get_event(&event_id);
        assert_eq!(event.organizer, organizer);
        assert_eq!(event.total_tickets, 500);
        assert_eq!(event.tickets_sold, 0);
        assert_eq!(event.status, EventStatus::Active);
    }

    #[test]
    fn test_cancel_event() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _admin, _tc, _) = setup(&env);
        let organizer = Address::generate(&env);
        let hash = BytesN::from_array(&env, &[1u8; 32]);
        let now = env.ledger().timestamp();
        let event_id = client.create_event(&organizer, &hash, &(now + 100), &(now + 200), &500u32);

        client.cancel_event(&organizer, &event_id);

        let event = client.get_event(&event_id);
        assert_eq!(event.status, EventStatus::Cancelled);
    }

    #[test]
    fn test_complete_event() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, admin, _tc, _) = setup(&env);
        let organizer = Address::generate(&env);
        let hash = BytesN::from_array(&env, &[1u8; 32]);
        let now = env.ledger().timestamp();
        let event_id = client.create_event(&organizer, &hash, &(now + 100), &(now + 200), &100u32);

        client.complete_event(&admin, &event_id);

        let event = client.get_event(&event_id);
        assert_eq!(event.status, EventStatus::Completed);
    }

    #[test]
    fn test_record_sale_increments_counter() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _admin, ticket_contract, _) = setup(&env);
        let organizer = Address::generate(&env);
        let hash = BytesN::from_array(&env, &[2u8; 32]);
        let now = env.ledger().timestamp();
        let event_id = client.create_event(&organizer, &hash, &(now + 100), &(now + 200), &10u32);

        client.record_sale(&ticket_contract, &event_id);
        client.record_sale(&ticket_contract, &event_id);

        let event = client.get_event(&event_id);
        assert_eq!(event.tickets_sold, 2);
    }

    #[test]
    fn test_update_event_metadata() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _admin, _tc, _) = setup(&env);
        let organizer = Address::generate(&env);
        let hash = BytesN::from_array(&env, &[1u8; 32]);
        let new_hash = BytesN::from_array(&env, &[2u8; 32]);
        let now = env.ledger().timestamp();
        let event_id = client.create_event(&organizer, &hash, &(now + 100), &(now + 200), &50u32);

        client.update_event(&organizer, &event_id, &new_hash);

        let event = client.get_event(&event_id);
        assert_eq!(event.metadata_hash, new_hash);
    }

    #[test]
    fn test_sold_out_panics() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _admin, ticket_contract, _) = setup(&env);
        let organizer = Address::generate(&env);
        let hash = BytesN::from_array(&env, &[3u8; 32]);
        let now = env.ledger().timestamp();
        let event_id = client.create_event(&organizer, &hash, &(now + 100), &(now + 200), &1u32);

        client.record_sale(&ticket_contract, &event_id);

        // Second sale should panic (sold out)
        let result = client.try_record_sale(&ticket_contract, &event_id);
        assert!(result.is_err(), "should fail when sold out");
    }

    #[test]
    fn test_get_organizer_events() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _admin, _tc, _) = setup(&env);
        let organizer = Address::generate(&env);
        let hash = BytesN::from_array(&env, &[1u8; 32]);
        let now = env.ledger().timestamp();

        client.create_event(&organizer, &hash, &(now + 100), &(now + 200), &50u32);
        client.create_event(&organizer, &hash, &(now + 300), &(now + 400), &100u32);

        let events = client.get_organizer_events(&organizer);
        assert_eq!(events.len(), 2);
    }
}
