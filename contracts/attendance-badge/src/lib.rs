#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, contractevent,
    Address, Env, String, Vec,
};

// ── Event Types ──────────────────────────────────────────────────────────────

#[contractevent]
pub struct BadgeMinted {
    pub badge_id: u64,
    pub event_id: u64,
    pub owner: Address,
    pub badge_type: BadgeType,
}

// ── Data Types ────────────────────────────────────────────────────────────────

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
    HasBadge(Address, u64, BadgeType),
}

const PERSISTENT_TTL_BUMP: u32 = 2_628_000;
const INSTANCE_TTL_BUMP: u32 = 525_600;

// ── Contract ─────────────────────────────────────────────────────────────────

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
        env.storage().instance().extend_ttl(INSTANCE_TTL_BUMP, INSTANCE_TTL_BUMP);
    }

    /// Mint a soulbound attendance badge — one per (attendee, event, badge_type).
    /// Transfer is intentionally omitted: soulbound badges cannot be moved.
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

        let dedup_key = DataKey::HasBadge(to.clone(), event_id, badge_type.clone());
        if env.storage().persistent().has(&dedup_key) {
            panic!("badge already issued");
        }

        let badge_id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::BadgeCount)
            .unwrap_or(0u64)
            .checked_add(1)
            .expect("overflow");

        let badge = BadgeData {
            event_id,
            badge_type: badge_type.clone(),
            owner: to.clone(),
            metadata_uri,
            issued_at: env.ledger().timestamp(),
        };

        env.storage()
            .persistent()
            .set(&DataKey::Badge(badge_id), &badge);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::Badge(badge_id), PERSISTENT_TTL_BUMP, PERSISTENT_TTL_BUMP);

        env.storage()
            .instance()
            .set(&DataKey::BadgeCount, &badge_id);
        env.storage().instance().extend_ttl(INSTANCE_TTL_BUMP, INSTANCE_TTL_BUMP);

        env.storage().persistent().set(&dedup_key, &true);
        env.storage().persistent().extend_ttl(&dedup_key, PERSISTENT_TTL_BUMP, PERSISTENT_TTL_BUMP);

        let mut owner_badges: Vec<u64> = env
            .storage()
            .persistent()
            .get(&DataKey::OwnerBadges(to.clone()))
            .unwrap_or_else(|| Vec::new(&env));
        owner_badges.push_back(badge_id);
        env.storage()
            .persistent()
            .set(&DataKey::OwnerBadges(to.clone()), &owner_badges);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::OwnerBadges(to.clone()), PERSISTENT_TTL_BUMP, PERSISTENT_TTL_BUMP);

        let mut event_badges: Vec<u64> = env
            .storage()
            .persistent()
            .get(&DataKey::EventBadges(event_id))
            .unwrap_or_else(|| Vec::new(&env));
        event_badges.push_back(badge_id);
        env.storage()
            .persistent()
            .set(&DataKey::EventBadges(event_id), &event_badges);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::EventBadges(event_id), PERSISTENT_TTL_BUMP, PERSISTENT_TTL_BUMP);

        env.events().publish_event(&BadgeMinted {
            badge_id,
            event_id,
            owner: to,
            badge_type,
        });

        badge_id
    }

    pub fn get_badge(env: Env, badge_id: u64) -> BadgeData {
        env.storage()
            .persistent()
            .get(&DataKey::Badge(badge_id))
            .expect("badge not found")
    }

    pub fn get_owner_badges(env: Env, owner: Address) -> Vec<u64> {
        env.storage()
            .persistent()
            .get(&DataKey::OwnerBadges(owner))
            .unwrap_or_else(|| Vec::new(&env))
    }

    pub fn get_event_badges(env: Env, event_id: u64) -> Vec<u64> {
        env.storage()
            .persistent()
            .get(&DataKey::EventBadges(event_id))
            .unwrap_or_else(|| Vec::new(&env))
    }

    pub fn has_badge(env: Env, owner: Address, event_id: u64, badge_type: BadgeType) -> bool {
        env.storage()
            .persistent()
            .has(&DataKey::HasBadge(owner, event_id, badge_type))
    }

    pub fn badge_count(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::BadgeCount)
            .unwrap_or(0)
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
    use soroban_sdk::{testutils::Address as _, Address, Env, String};

    fn setup(env: &Env) -> (AttendanceBadgeContractClient, Address) {
        let contract_id = env.register(AttendanceBadgeContract, ());
        let client = AttendanceBadgeContractClient::new(env, &contract_id);
        let admin = Address::generate(env);
        client.initialize(&admin);
        (client, admin)
    }

    #[test]
    fn test_mint_badge() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, admin) = setup(&env);
        let attendee = Address::generate(&env);

        let uri = String::from_str(&env, "ipfs://QmBadge");
        let badge_id = client.mint_badge(&admin, &attendee, &1u64, &BadgeType::Attendee, &uri);

        assert_eq!(badge_id, 1);

        let badge = client.get_badge(&badge_id);
        assert_eq!(badge.owner, attendee);
        assert_eq!(badge.badge_type, BadgeType::Attendee);
        assert_eq!(badge.event_id, 1);
    }

    #[test]
    fn test_no_duplicate_badge() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, admin) = setup(&env);
        let attendee = Address::generate(&env);

        let uri = String::from_str(&env, "ipfs://QmBadge");
        client.mint_badge(&admin, &attendee, &1u64, &BadgeType::Attendee, &uri);

        // Second mint for same (attendee, event, type) should panic
        let result = client.try_mint_badge(&admin, &attendee, &1u64, &BadgeType::Attendee, &uri);
        assert!(result.is_err(), "duplicate badge should be rejected");
    }

    #[test]
    fn test_has_badge_query() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, admin) = setup(&env);
        let attendee = Address::generate(&env);

        assert!(!client.has_badge(&attendee, &1u64, &BadgeType::Speaker));

        let uri = String::from_str(&env, "ipfs://QmSpeaker");
        client.mint_badge(&admin, &attendee, &1u64, &BadgeType::Speaker, &uri);

        assert!(client.has_badge(&attendee, &1u64, &BadgeType::Speaker));
        assert!(!client.has_badge(&attendee, &1u64, &BadgeType::Vip), "different type should not match");
    }

    #[test]
    fn test_different_badge_types_same_event() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, admin) = setup(&env);
        let attendee = Address::generate(&env);

        let uri = String::from_str(&env, "ipfs://Qm1");
        client.mint_badge(&admin, &attendee, &1u64, &BadgeType::Attendee, &uri);
        client.mint_badge(&admin, &attendee, &1u64, &BadgeType::EarlyBird, &uri);

        let badges = client.get_owner_badges(&attendee);
        assert_eq!(badges.len(), 2, "attendee should hold both badge types");
    }

    #[test]
    fn test_event_badge_index() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, admin) = setup(&env);
        let a1 = Address::generate(&env);
        let a2 = Address::generate(&env);

        let uri = String::from_str(&env, "ipfs://QmEvent");
        client.mint_badge(&admin, &a1, &7u64, &BadgeType::Attendee, &uri);
        client.mint_badge(&admin, &a2, &7u64, &BadgeType::Attendee, &uri);

        let event_badges = client.get_event_badges(&7u64);
        assert_eq!(event_badges.len(), 2);
    }

    #[test]
    fn test_badge_count() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, admin) = setup(&env);
        let a = Address::generate(&env);

        let uri = String::from_str(&env, "ipfs://QmCount");
        client.mint_badge(&admin, &a, &1u64, &BadgeType::Organizer, &uri);
        client.mint_badge(&admin, &a, &2u64, &BadgeType::Organizer, &uri);

        assert_eq!(client.badge_count(), 2);
    }
}
