#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, contractevent, token,
    Address, Env, Vec,
};

const DISPUTE_WINDOW: u64 = 72 * 3600; // 72 hours

const PERSISTENT_TTL_BUMP: u32 = 2_628_000;
const INSTANCE_TTL_BUMP: u32 = 525_600;

// ── Event Types ──────────────────────────────────────────────────────────────

#[contractevent]
pub struct Staked {
    pub event_id: u64,
    pub organizer: Address,
    pub amount: i128,
}

#[contractevent]
pub struct StakeCompleted {
    pub event_id: u64,
    pub release_after: u64,
}

#[contractevent]
pub struct StakeReleased {
    pub event_id: u64,
    pub organizer: Address,
    pub amount: i128,
}

#[contractevent]
pub struct DisputeFiled {
    pub event_id: u64,
}

#[contractevent]
pub struct StakeSlashed {
    pub event_id: u64,
    pub slash_amount: i128,
    pub slash_bps: u32,
}

// ── Data Types ────────────────────────────────────────────────────────────────

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
    pub asset: Address,
    pub amount: i128,
    pub status: StakeStatus,
    pub staked_at: u64,
    pub completed_at: u64,
    pub release_after: u64,
    pub slash_bps: u32,
}

#[contracttype]
pub enum DataKey {
    Admin,
    Stake(u64),
    OrganizerStakes(Address),
}

// ── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct EscrowStakingContract;

#[contractimpl]
impl EscrowStakingContract {
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().extend_ttl(INSTANCE_TTL_BUMP, INSTANCE_TTL_BUMP);
    }

    pub fn stake(
        env: Env,
        organizer: Address,
        event_id: u64,
        asset: Address,
        amount: i128,
    ) {
        organizer.require_auth();

        if env.storage().persistent().has(&DataKey::Stake(event_id)) {
            panic!("stake already exists");
        }
        if amount <= 0 {
            panic!("amount must be positive");
        }

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
            slash_bps: 0,
        };

        env.storage().persistent().set(&DataKey::Stake(event_id), &stake);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::Stake(event_id), PERSISTENT_TTL_BUMP, PERSISTENT_TTL_BUMP);

        let mut stakes: Vec<u64> = env
            .storage()
            .persistent()
            .get(&DataKey::OrganizerStakes(organizer.clone()))
            .unwrap_or_else(|| Vec::new(&env));
        stakes.push_back(event_id);
        env.storage()
            .persistent()
            .set(&DataKey::OrganizerStakes(organizer.clone()), &stakes);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::OrganizerStakes(organizer.clone()), PERSISTENT_TTL_BUMP, PERSISTENT_TTL_BUMP);

        env.events().publish_event(&Staked {
            event_id,
            organizer,
            amount,
        });
    }

    pub fn mark_completed(env: Env, admin: Address, event_id: u64) {
        admin.require_auth();
        Self::require_admin(&env, &admin);

        let mut stake: StakeData = env
            .storage()
            .persistent()
            .get(&DataKey::Stake(event_id))
            .expect("stake not found");

        if stake.status != StakeStatus::Staked {
            panic!("invalid state");
        }

        let now = env.ledger().timestamp();
        stake.status = StakeStatus::Completed;
        stake.completed_at = now;
        stake.release_after = now.checked_add(DISPUTE_WINDOW).expect("overflow");

        env.storage().persistent().set(&DataKey::Stake(event_id), &stake);

        env.events().publish_event(&StakeCompleted {
            event_id,
            release_after: stake.release_after,
        });
    }

    pub fn release(env: Env, event_id: u64) {
        let mut stake: StakeData = env
            .storage()
            .persistent()
            .get(&DataKey::Stake(event_id))
            .expect("stake not found");

        if stake.status != StakeStatus::Completed {
            panic!("not completed");
        }

        let now = env.ledger().timestamp();
        if now < stake.release_after {
            panic!("dispute window not expired");
        }

        let organizer = stake.organizer.clone();
        let amount = stake.amount;
        stake.status = StakeStatus::Released;
        env.storage().persistent().set(&DataKey::Stake(event_id), &stake);

        let token_client = token::Client::new(&env, &stake.asset);
        token_client.transfer(&env.current_contract_address(), &organizer, &amount);

        env.events().publish_event(&StakeReleased {
            event_id,
            organizer,
            amount,
        });
    }

    pub fn file_dispute(env: Env, admin: Address, event_id: u64) {
        admin.require_auth();
        Self::require_admin(&env, &admin);

        let mut stake: StakeData = env
            .storage()
            .persistent()
            .get(&DataKey::Stake(event_id))
            .expect("stake not found");

        if stake.status != StakeStatus::Staked && stake.status != StakeStatus::Completed {
            panic!("cannot dispute in current state");
        }

        stake.status = StakeStatus::Disputed;
        env.storage().persistent().set(&DataKey::Stake(event_id), &stake);

        env.events().publish_event(&DisputeFiled { event_id });
    }

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
            panic!("slash_bps cannot exceed 10000");
        }

        let mut stake: StakeData = env
            .storage()
            .persistent()
            .get(&DataKey::Stake(event_id))
            .expect("stake not found");

        if stake.status != StakeStatus::Disputed {
            panic!("not disputed");
        }

        let slash_amount = stake
            .amount
            .checked_mul(slash_bps as i128)
            .expect("overflow")
            / 10000;
        let remainder = stake.amount.checked_sub(slash_amount).expect("underflow");

        let token_client = token::Client::new(&env, &stake.asset);

        if slash_amount > 0 {
            token_client.transfer(
                &env.current_contract_address(),
                &slash_recipient,
                &slash_amount,
            );
        }

        if remainder > 0 {
            token_client.transfer(
                &env.current_contract_address(),
                &stake.organizer,
                &remainder,
            );
        }

        stake.status = StakeStatus::Slashed;
        stake.slash_bps = slash_bps;
        env.storage().persistent().set(&DataKey::Stake(event_id), &stake);

        env.events().publish_event(&StakeSlashed {
            event_id,
            slash_amount,
            slash_bps,
        });
    }

    pub fn get_stake(env: Env, event_id: u64) -> StakeData {
        env.storage()
            .persistent()
            .get(&DataKey::Stake(event_id))
            .expect("stake not found")
    }

    pub fn get_organizer_stakes(env: Env, organizer: Address) -> Vec<u64> {
        env.storage()
            .persistent()
            .get(&DataKey::OrganizerStakes(organizer))
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
    use soroban_sdk::{
        testutils::Address as _,
        token::StellarAssetClient,
        Address, Env,
    };

    fn setup_token(env: &Env, admin: &Address) -> Address {
        let token_contract = env.register_stellar_asset_contract_v2(admin.clone());
        let token_admin = StellarAssetClient::new(env, &token_contract.address());
        token_admin.mint(admin, &1_000_000_000_i128);
        token_contract.address()
    }

    fn setup(env: &Env) -> (EscrowStakingContractClient, Address, Address) {
        let contract_id = env.register(EscrowStakingContract, ());
        let client = EscrowStakingContractClient::new(env, &contract_id);
        let admin = Address::generate(env);
        let asset = setup_token(env, &admin);
        client.initialize(&admin);
        (client, admin, asset)
    }

    #[test]
    fn test_stake_lifecycle() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, admin, asset) = setup(&env);
        let organizer = Address::generate(&env);

        let token = StellarAssetClient::new(&env, &asset);
        token.mint(&organizer, &100_000_i128);

        let amount: i128 = 10_000;
        client.stake(&organizer, &1u64, &asset, &amount);

        let stake = client.get_stake(&1u64);
        assert_eq!(stake.status, StakeStatus::Staked);
        assert_eq!(stake.amount, amount);

        client.mark_completed(&admin, &1u64);
        let stake = client.get_stake(&1u64);
        assert_eq!(stake.status, StakeStatus::Completed);
        assert!(stake.release_after > 0);
    }

    #[test]
    fn test_dispute_and_slash() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, admin, asset) = setup(&env);
        let organizer = Address::generate(&env);
        let slash_recipient = Address::generate(&env);

        let token = StellarAssetClient::new(&env, &asset);
        token.mint(&organizer, &100_000_i128);

        client.stake(&organizer, &2u64, &asset, &10_000_i128);
        client.file_dispute(&admin, &2u64);

        let stake = client.get_stake(&2u64);
        assert_eq!(stake.status, StakeStatus::Disputed);

        // Slash 50%
        client.slash(&admin, &2u64, &5000u32, &slash_recipient);

        let stake = client.get_stake(&2u64);
        assert_eq!(stake.status, StakeStatus::Slashed);
        assert_eq!(stake.slash_bps, 5000);
    }

    #[test]
    fn test_duplicate_stake_rejected() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _admin, asset) = setup(&env);
        let organizer = Address::generate(&env);

        let token = StellarAssetClient::new(&env, &asset);
        token.mint(&organizer, &200_000_i128);

        client.stake(&organizer, &3u64, &asset, &10_000_i128);

        let result = client.try_stake(&organizer, &3u64, &asset, &10_000_i128);
        assert!(result.is_err(), "duplicate stake should be rejected");
    }

    #[test]
    fn test_negative_amount_rejected() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _admin, asset) = setup(&env);
        let organizer = Address::generate(&env);

        let result = client.try_stake(&organizer, &4u64, &asset, &-1_i128);
        assert!(result.is_err(), "negative stake amount should be rejected");
    }

    #[test]
    fn test_organizer_stakes_index() {
        let env = Env::default();
        env.mock_all_auths();

        let (client, _admin, asset) = setup(&env);
        let organizer = Address::generate(&env);

        let token = StellarAssetClient::new(&env, &asset);
        token.mint(&organizer, &500_000_i128);

        client.stake(&organizer, &10u64, &asset, &1_000_i128);
        client.stake(&organizer, &11u64, &asset, &1_000_i128);

        let stakes = client.get_organizer_stakes(&organizer);
        assert_eq!(stakes.len(), 2);
    }
}
