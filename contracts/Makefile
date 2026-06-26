build:
	cargo build --target wasm32-unknown-unknown --release

test:
	cargo test

fmt:
	cargo fmt --all

lint:
	cargo clippy -- -D warnings

deploy:
	stellar contract deploy \
		--wasm target/wasm32-unknown-unknown/release/*.wasm \
		--source $(STELLAR_SECRET_KEY) \
		--network testnet

.PHONY: build test fmt lint deploy
