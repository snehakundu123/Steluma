# Steluma Smart Contracts

Soroban smart contracts powering the Steluma Web3 event platform on the Stellar network.

## Contracts

| Contract | Description |
|---|---|
| `event-factory` | Core event registry — create, update, cancel, and complete events; tracks ticket sales |
| `ticket-nft` | Non-fungible event tickets — mint, transfer, and lock tickets; enforces per-event capacity |
| `attendance-badge` | Soulbound attendance badges — mint-only, non-transferable proofs of attendance |
| `staking` | Organizer stake — lock XLM collateral, release on success, slash on dispute |
| `marketplace` | P2P resale marketplace — create listings, purchase tickets, collect royalties |

## Folder Structure

```
contracts/
├── Cargo.toml              # Workspace manifest
├── Cargo.lock              # Locked dependency tree
├── Makefile                # Build, test, lint, and deploy targets
├── event-factory/
│   └── src/lib.rs          # EventFactory contract + inline tests
├── ticket-nft/
│   └── src/lib.rs          # TicketNFT contract + inline tests
├── attendance-badge/
│   └── src/lib.rs          # AttendanceBadge contract + inline tests
├── staking/
│   └── src/lib.rs          # Staking contract + inline tests
└── marketplace/
    └── src/lib.rs          # Marketplace contract + inline tests
```

## Prerequisites

- Rust (stable) with the `wasm32-unknown-unknown` target:
  ```sh
  rustup target add wasm32-unknown-unknown
  ```
- [Stellar CLI](https://developers.stellar.org/docs/tools/developer-tools/cli/install-cli):
  ```sh
  cargo install --locked stellar-cli --features opt
  ```

## Build

```sh
make build
# or directly:
cargo build --target wasm32-unknown-unknown --release
```

WASM artifacts are written to `target/wasm32-unknown-unknown/release/*.wasm`.

## Test

```sh
make test
# or directly:
cargo test --all
```

Each contract includes a `#[cfg(test)]` block using `soroban_sdk::testutils`.

## Lint & Format

```sh
make fmt    # cargo fmt --all
make lint   # cargo clippy -- -D warnings
```

## Deploy

```sh
export STELLAR_SECRET_KEY=S...   # your testnet secret key

make deploy
# or directly:
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/<contract>.wasm \
  --source $STELLAR_SECRET_KEY \
  --network testnet
```

## Environment Variables

| Variable | Description |
|---|---|
| `STELLAR_SECRET_KEY` | Stellar secret key (S…) used for deployment signing |
| `STELLAR_NETWORK` | Target network: `testnet` or `mainnet` |
| `STELLAR_RPC_URL` | Soroban RPC endpoint (e.g. `https://soroban-testnet.stellar.org`) |
| `STELLAR_NETWORK_PASSPHRASE` | Network passphrase (e.g. `Test SDF Network ; September 2015`) |

## Deployed Testnet Contract IDs

| Contract | Contract ID |
|---|---|
| EventFactory | `CDEF2BFQPP47BC24VR2FESSMKZWNHWVZQA42YKFDO5JUBX5PSE5QEQQ7` |
| TicketNFT | `CBXTVOR5OSBLNKONEMG5NUBBBNODPURE2L5APOTUNESW3FZDRNYN77PW` |
| AttendanceBadge | `CCRHB4HG3DHWAI2VQF3QR6F55KOS5VPRXT4QUAP73KIFW7GNKXD3TZQP` |
| Staking | `CDT3OFFHV4CQBPUZ3RTMZZWH7MVWXP5UX3VD55DHC642MSM5FMY3GBAS` |
| Marketplace | `CAPQVDTP3FP4RWQ2CG7N4S32AD7A3TWHJ2PUHR2C6J77YAVVXIKEK5QD` |
