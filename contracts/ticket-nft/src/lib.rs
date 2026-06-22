#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, contractevent,
    Address, Env, String, Symbol, Vec,
};

// ── Event Types ──────────────────────────────────────────────────────────────

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

// ── Data Types ────────────────────────────────────────────────────────────────

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
    TicketCount,
    Ticket(u64),
    OwnerTickets(Address),
    EventTickets(u64),
}

const PERSISTENT_TTL_BUMP: u32 = 2_628_000;
const INSTANCE_TTL_BUMP: u32 = 525_600;

// ── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct TicketNFTContract;

#[contractimpl]
impl TicketNFTContract {
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::TicketCount, &0u64);
        env.storage().instance().extend_ttl(INSTANCE_TTL_BUMP, INSTANCE_TTL_BUMP);
    }

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

        let ticket_id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::TicketCount)
            .unwrap_or(0u64)
            .checked_add(1)
            .expect("overflow");

        let ticket = TicketData {
            event_id,
            tier: tier.clone(),
            ticket_number,
            owner: to.clone(),
            metadata_uri,
            minted_at: env.ledger().timestamp(),
            is_locked: false,
            is_transferable,
        };

        env.storage()
            .persistent()
            .set(&DataKey::Ticket(ticket_id), &ticket);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::Ticket(ticket_id), PERSISTENT_TTL_BUMP, PERSISTENT_TTL_BUMP);

        env.storage()
            .instance()
            .set(&DataKey::TicketCount, &ticket_id);
        env.storage().instance().extend_ttl(INSTANCE_TTL_BUMP, INSTANCE_TTL_BUMP);

        Self::add_to_owner_index(&env, &to, ticket_id);

        let mut event_tickets: Vec<u64> = env
            .storage()
            .persistent()
            .get(&DataKey::EventTickets(event_id))
            .unwrap_or_else(|| Vec::new(&env));
        event_tickets.push_back(ticket_id);
        env.storage()
            .persistent()
            .set(&DataKey::EventTickets(event_id), &event_tickets);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::EventTickets(event_id), PERSISTENT_TTL_BUMP, PERSISTENT_TTL_BUMP);

        env.events().publish_event(&TicketMinted {
            ticket_id,
            event_id,
            owner: to,
            tier,
        });

        ticket_id
    }

    pub fn transfer(env: Env, from: Address, to: Address, ticket_id: u64) {
        from.require_auth();

        let mut ticket: TicketData = env
            .storage()
            .persistent()
            .get(&DataKey::Ticket(ticket_id))
            .expect("ticket not found");

        if ticket.owner != from {
            panic!("not owner");
        }
        if ticket.is_locked {
            panic!("ticket is locked");
        }
        if !ticket.is_transferable {
            panic!("ticket is non-transferable");
        }

        Self::remove_from_owner_index(&env, &from, ticket_id);
        Self::add_to_owner_index(&env, &to, ticket_id);

        ticket.owner = to.clone();
        env.storage()
            .persistent()
            .set(&DataKey::Ticket(ticket_id), &ticket);

        env.events().publish_event(&TicketTransferred {
            ticket_id,
            from,
            to,
        });
    }

    pub fn lock(env: Env, admin: Address, ticket_id: u64) {
        admin.require_auth();
        Self::require_admin(&env, &admin);

        let mut ticket: TicketData = env
            .storage()
            .persistent()
            .get(&DataKey::Ticket(ticket_id))
            .expect("ticket not found");

        if ticket.is_locked {
            panic!("already locked");
        }

        let owner = ticket.owner.clone();
        ticket.is_locked = true;
        env.storage()
            .persistent()
            .set(&DataKey::Ticket(ticket_id), &ticket);

        env.events().publish_event(&TicketLocked { ticket_id, owner });
    }

    pub fn get_ticket(env: Env, ticket_id: u64) -> TicketData {
        env.storage()
            .persistent()
            .get(&DataKey::Ticket(ticket_id))
            .expect("ticket not found")
    }

    pub fn get_owner(env: Env, ticket_id: u64) -> Address {
        let ticket: TicketData = env
            .storage()
            .persistent()
            .get(&DataKey::Ticket(ticket_id))
            .expect("ticket not found");
        ticket.owner
    }

    pub fn get_owner_tickets(env: Env, owner: Address) -> Vec<u64> {
        env.storage()
            .persistent()
            .get(&DataKey::OwnerTickets(owner))
            .unwrap_or_else(|| Vec::new(&env))
    }

    pub fn get_event_tickets(env: Env, event_id: u64) -> Vec<u64> {
        env.storage()
            .persistent()
            .get(&DataKey::EventTickets(event_id))
            .unwrap_or_else(|| Vec::new(&env))
    }

    pub fn is_locked(env: Env, ticket_id: u64) -> bool {
        let ticket: TicketData = env
            .storage()
            .persistent()
            .get(&DataKey::Ticket(ticket_id))
            .expect("ticket not found");
        ticket.is_locked
    }

    pub fn ticket_count(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::TicketCount)
            .unwrap_or(0)
    }

    fn add_to_owner_index(env: &Env, owner: &Address, ticket_id: u64) {
        let mut tickets: Vec<u64> = env
            .storage()
            .persistent()
            .get(&DataKey::OwnerTickets(owner.clone()))
            .unwrap_or_else(|| Vec::new(env));
        tickets.push_back(ticket_id);
        env.storage()
            .persistent()
            .set(&DataKey::OwnerTickets(owner.clone()), &tickets);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::OwnerTickets(owner.clone()), PERSISTENT_TTL_BUMP, PERSISTENT_TTL_BUMP);
    }

    fn remove_from_owner_index(env: &Env, owner: &Address, ticket_id: u64) {
        let tickets: Vec<u64> = env
            .storage()
            .persistent()
            .get(&DataKey::OwnerTickets(owner.clone()))
            .unwrap_or_else(|| Vec::new(env));
        let mut new_tickets: Vec<u64> = Vec::new(env);
        for t in tickets.iter() {
            if t != ticket_id {
                new_tickets.push_back(t);
            }
        }
        env.storage()
            .persistent()
            .set(&DataKey::OwnerTickets(owner.clone()), &new_tickets);
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
    use soroban_sdk::{testutils::Address as _, symbol_short, Address, Env, String};

    fn setup(env: &Env) -> (TicketNFTContractClient, Address) {
        let contract_id = env.register(TicketNFTContract, ());
        let client = TicketNFTContractClient::new(env, &contract_id);
        let admin = Address::generate(env);
        client.initialize(&admin);
        (client, admin)
    }

    #[test]
    fn test_mint_and_transfer() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, admin) = setup(&env);
        let buyer = Address::generate(&env);
        let buyer2 = Address::generate(&env);

        let tier = symbol_short!("GA");
        let uri = String::from_str(&env, "ipfs://QmTest");

        let ticket_id = client.mint(&admin, &buyer, &1u64, &tier, &1u32, &uri, &true);
        assert_eq!(ticket_id, 1);

        let ticket = client.get_ticket(&ticket_id);
        assert_eq!(ticket.owner, buyer);
        assert!(!ticket.is_locked);

        client.transfer(&buyer, &buyer2, &ticket_id);
        assert_eq!(client.get_owner(&ticket_id), buyer2);
    }

    #[test]
    fn test_lock_prevents_transfer() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, admin) = setup(&env);
        let buyer = Address::generate(&env);
        let buyer2 = Address::generate(&env);

        let tier = symbol_short!("VIP");
        let uri = String::from_str(&env, "ipfs://QmTest");
        let ticket_id = client.mint(&admin, &buyer, &1u64, &tier, &1u32, &uri, &true);

        client.lock(&admin, &ticket_id);
        assert!(client.is_locked(&ticket_id));

        let result = client.try_transfer(&buyer, &buyer2, &ticket_id);
        assert!(result.is_err(), "transfer should fail when locked");
    }

    #[test]
    fn test_non_transferable_ticket() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, admin) = setup(&env);
        let buyer = Address::generate(&env);
        let buyer2 = Address::generate(&env);

        let tier = symbol_short!("SOUL");
        let uri = String::from_str(&env, "ipfs://QmSoul");
        let ticket_id = client.mint(&admin, &buyer, &1u64, &tier, &1u32, &uri, &false);

        let result = client.try_transfer(&buyer, &buyer2, &ticket_id);
        assert!(result.is_err(), "non-transferable ticket should not transfer");
    }

    #[test]
    fn test_owner_index_tracks_multiple_tickets() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, admin) = setup(&env);
        let buyer = Address::generate(&env);

        let tier = symbol_short!("GA");
        let uri = String::from_str(&env, "ipfs://QmMulti");
        client.mint(&admin, &buyer, &1u64, &tier, &1u32, &uri, &true);
        client.mint(&admin, &buyer, &1u64, &tier, &2u32, &uri, &true);
        client.mint(&admin, &buyer, &2u64, &tier, &1u32, &uri, &true);

        let owned = client.get_owner_tickets(&buyer);
        assert_eq!(owned.len(), 3);
    }

    #[test]
    fn test_event_ticket_index() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, admin) = setup(&env);
        let buyer = Address::generate(&env);

        let tier = symbol_short!("GA");
        let uri = String::from_str(&env, "ipfs://QmEvent");
        client.mint(&admin, &buyer, &42u64, &tier, &1u32, &uri, &true);
        client.mint(&admin, &buyer, &42u64, &tier, &2u32, &uri, &true);

        let event_tickets = client.get_event_tickets(&42u64);
        assert_eq!(event_tickets.len(), 2);
    }

    #[test]
    fn test_transfer_updates_owner_index() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, admin) = setup(&env);
        let buyer = Address::generate(&env);
        let buyer2 = Address::generate(&env);

        let tier = symbol_short!("GA");
        let uri = String::from_str(&env, "ipfs://QmIdx");
        let ticket_id = client.mint(&admin, &buyer, &1u64, &tier, &1u32, &uri, &true);

        client.transfer(&buyer, &buyer2, &ticket_id);

        let buyer_tickets = client.get_owner_tickets(&buyer);
        let buyer2_tickets = client.get_owner_tickets(&buyer2);
        assert_eq!(buyer_tickets.len(), 0, "original owner should have 0 tickets");
        assert_eq!(buyer2_tickets.len(), 1, "new owner should have 1 ticket");
    }
}
