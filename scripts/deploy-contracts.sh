#!/usr/bin/env bash
set -e

echo "🚀 Deploying Steluma Contracts to Stellar Testnet"
echo "=================================================="

# Check soroban CLI
command -v soroban >/dev/null 2>&1 || {
  echo "❌ soroban CLI not found. Install with:"
  echo "   cargo install --locked soroban-cli"
  exit 1
}

# Load .env
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

if [ -z "$STELLAR_ADMIN_SECRET" ] || [ "$STELLAR_ADMIN_SECRET" = "S..." ]; then
  echo "⚠️  No admin keypair found. Generating new one for testnet..."
  KEYPAIR=$(soroban keys generate admin-deploy --network testnet 2>&1)
  ADMIN_ADDRESS=$(soroban keys address admin-deploy)
  echo "   Admin address: $ADMIN_ADDRESS"
  echo "   Funding via Friendbot..."
  curl -s "https://friendbot.stellar.org?addr=$ADMIN_ADDRESS" > /dev/null
  echo "   ✅ Funded"
  ADMIN_KEY_NAME="admin-deploy"
else
  echo "📋 Using existing admin keypair from .env"
  soroban keys add admin-deploy --secret-key "$STELLAR_ADMIN_SECRET" 2>/dev/null || true
  ADMIN_KEY_NAME="admin-deploy"
fi

NETWORK="testnet"
RPC="https://soroban-testnet.stellar.org"
PASSPHRASE="Test SDF Network ; September 2015"

# Build contracts
echo ""
echo "🔨 Building contracts..."
rustup target add wasm32v1-none 2>/dev/null || true
cd contracts
cargo build --release --target wasm32v1-none --quiet
cd ..

WASM_DIR="contracts/target/wasm32v1-none/release"

deploy_contract() {
  local name=$1
  local wasm=$2
  echo ""
  echo "📦 Deploying $name..."
  CONTRACT_ID=$(soroban contract deploy \
    --wasm "$WASM_DIR/$wasm" \
    --source "$ADMIN_KEY_NAME" \
    --network "$NETWORK" 2>&1 | tail -1)
  echo "   Contract ID: $CONTRACT_ID"
  echo "$CONTRACT_ID"
}

# Deploy all contracts
EVENT_FACTORY=$(deploy_contract "EventFactoryContract" "event_factory.wasm")
TICKET_NFT=$(deploy_contract "TicketNFTContract" "ticket_nft.wasm")
ATTENDANCE_BADGE=$(deploy_contract "AttendanceBadgeContract" "attendance_badge.wasm")
STAKING=$(deploy_contract "EscrowStakingContract" "staking.wasm")
MARKETPLACE=$(deploy_contract "MarketplaceContract" "marketplace.wasm")

echo ""
echo "🔧 Initializing contracts..."

# Initialize EventFactory
soroban contract invoke \
  --id "$EVENT_FACTORY" \
  --source "$ADMIN_KEY_NAME" \
  --network "$NETWORK" \
  -- initialize \
  --admin "$(soroban keys address $ADMIN_KEY_NAME)" \
  --ticket_contract "$TICKET_NFT" 2>/dev/null && echo "   ✅ EventFactory initialized"

# Initialize TicketNFT
soroban contract invoke \
  --id "$TICKET_NFT" \
  --source "$ADMIN_KEY_NAME" \
  --network "$NETWORK" \
  -- initialize \
  --admin "$(soroban keys address $ADMIN_KEY_NAME)" 2>/dev/null && echo "   ✅ TicketNFT initialized"

# Initialize AttendanceBadge
soroban contract invoke \
  --id "$ATTENDANCE_BADGE" \
  --source "$ADMIN_KEY_NAME" \
  --network "$NETWORK" \
  -- initialize \
  --admin "$(soroban keys address $ADMIN_KEY_NAME)" 2>/dev/null && echo "   ✅ AttendanceBadge initialized"

# Initialize Staking
soroban contract invoke \
  --id "$STAKING" \
  --source "$ADMIN_KEY_NAME" \
  --network "$NETWORK" \
  -- initialize \
  --admin "$(soroban keys address $ADMIN_KEY_NAME)" 2>/dev/null && echo "   ✅ Staking initialized"

# Initialize Marketplace
soroban contract invoke \
  --id "$MARKETPLACE" \
  --source "$ADMIN_KEY_NAME" \
  --network "$NETWORK" \
  -- initialize \
  --admin "$(soroban keys address $ADMIN_KEY_NAME)" 2>/dev/null && echo "   ✅ Marketplace initialized"

echo ""
echo "✅ All contracts deployed!"
echo ""
echo "Add these to your .env:"
echo "========================================="
echo "EVENT_FACTORY_CONTRACT_ID=$EVENT_FACTORY"
echo "TICKET_NFT_CONTRACT_ID=$TICKET_NFT"
echo "ATTENDANCE_BADGE_CONTRACT_ID=$ATTENDANCE_BADGE"
echo "STAKING_CONTRACT_ID=$STAKING"
echo "MARKETPLACE_CONTRACT_ID=$MARKETPLACE"
echo "========================================="
echo ""
echo "View on Stellar Expert:"
echo "https://stellar.expert/explorer/testnet/contract/$EVENT_FACTORY"

# Auto-update .env
if [ -f .env ]; then
  sed -i.bak "s|EVENT_FACTORY_CONTRACT_ID=.*|EVENT_FACTORY_CONTRACT_ID=$EVENT_FACTORY|" .env
  sed -i.bak "s|TICKET_NFT_CONTRACT_ID=.*|TICKET_NFT_CONTRACT_ID=$TICKET_NFT|" .env
  sed -i.bak "s|ATTENDANCE_BADGE_CONTRACT_ID=.*|ATTENDANCE_BADGE_CONTRACT_ID=$ATTENDANCE_BADGE|" .env
  sed -i.bak "s|STAKING_CONTRACT_ID=.*|STAKING_CONTRACT_ID=$STAKING|" .env
  sed -i.bak "s|MARKETPLACE_CONTRACT_ID=.*|MARKETPLACE_CONTRACT_ID=$MARKETPLACE|" .env
  rm -f .env.bak
  echo "✅ .env updated with contract IDs"
fi
