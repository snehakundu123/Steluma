# Steluma — Mainnet Preparation Checklist

**Date:** 2026-06-05  
**Status:** Architecture is mainnet-ready by design. Items below must be completed before go-live.

---

## Network Switching

The codebase already abstracts the network via environment variables:
```env
STELLAR_NETWORK=testnet|mainnet
STELLAR_HORIZON_URL=...
STELLAR_RPC_URL=...
STELLAR_NETWORK_PASSPHRASE=...
```

To switch to mainnet: update the four env vars above and redeploy contracts. No code changes required.

---

## Pre-Mainnet Checklist

### Smart Contracts
- [ ] Full security audit by an external Soroban-specialized auditor
- [ ] Add TTL extension calls in backend poller (bump persistent storage every N ledgers)
- [ ] Implement Soroban-native staking (not Horizon payment bypass)
- [ ] Test all contracts with real XLM amounts on testnet for 30+ days
- [ ] Lock admin key operations behind time-delay multisig for high-value functions
- [ ] Document upgrade path (contract migration strategy)
- [ ] Verify royalty mechanics with real payment flows

### Security
- [ ] Move STELLAR_ADMIN_SECRET to a vault (HashiCorp Vault or AWS Secrets Manager)
- [ ] Separate QR_SIGNING_SECRET from JWT_SECRET
- [ ] Enable HTTPS/TLS for all endpoints (reverse proxy with Let's Encrypt)
- [ ] Enable Content Security Policy headers
- [ ] Security audit of auth flow (professional pentest recommended)
- [ ] Rotate all testnet secrets before mainnet deployment
- [ ] Implement IP allowlisting for admin-tier operations

### Infrastructure
- [ ] PostgreSQL: enable SSL mode (`?sslmode=require` in DATABASE_URL)
- [ ] PostgreSQL: set up read replicas for discovery queries
- [ ] Redis: enable TLS + AUTH password
- [ ] Redis: deploy Redis Sentinel or Redis Cluster for HA
- [ ] Set up daily database backups with retention policy
- [ ] Deploy to at least 2 API instances behind a load balancer
- [ ] Configure Socket.IO with Redis adapter for multi-instance support
- [ ] Set up CDN for static assets and NFT metadata gateway
- [ ] Configure Pinata or NFT.Storage for permanent IPFS pinning

### Monitoring & Observability
- [ ] Set up Sentry for error tracking (frontend + backend)
- [ ] Configure structured log aggregation (e.g., Datadog, Logstash)
- [ ] Set up uptime monitoring and alerts (PagerDuty, Better Uptime)
- [ ] Create Grafana dashboards for: API latency, ticket sales, check-in rate, socket connections
- [ ] Alert on: failed mints, failed staking, dropped blockchain events, Redis/DB downtime
- [ ] Transaction monitoring: alert if Horizon poller falls >2 ledgers behind

### Legal & Compliance
- [ ] Terms of Service and Privacy Policy before launch
- [ ] KYC/AML considerations for organizer staking amounts
- [ ] Token classification review (are tickets securities in your jurisdiction?)
- [ ] GDPR compliance: user data deletion flow (wallet address pseudonymization)

### Financial
- [ ] Set minimum stake amounts appropriate for mainnet XLM value
- [ ] Calculate platform fee structure (royalty split)
- [ ] Set up organizer withdrawal flow for revenue
- [ ] Configure dispute resolution process with human review
- [ ] Determine XLM fee reserve for admin account to pay for contract calls

### Testing
- [ ] Full end-to-end test on mainnet with real XLM (small amounts)
- [ ] Load test: 100 concurrent ticket purchases
- [ ] Failover test: kill API instance mid-purchase and verify recovery
- [ ] Chaos test: simulate Redis failure during check-in
- [ ] 30-day testnet production soak with real users

---

## One-Click Mainnet Deployment

Once all checks above are complete, mainnet deployment is:

```bash
# 1. Update env vars
STELLAR_NETWORK=mainnet
STELLAR_HORIZON_URL=https://horizon.stellar.org
STELLAR_RPC_URL=https://soroban.stellar.org  # or preferred provider
STELLAR_NETWORK_PASSPHRASE="Public Global Stellar Network ; September 2015"

# 2. Deploy contracts (run once)
./scripts/deploy-contracts.sh mainnet

# 3. Set contract IDs from deploy output
EVENT_FACTORY_CONTRACT_ID=C...
TICKET_NFT_CONTRACT_ID=C...
...

# 4. Deploy app
docker-compose -f docker-compose.prod.yml up -d
```

---

## Rollback Strategy

1. **Contracts:** Soroban contracts are immutable once deployed. Upgrade strategy requires deploying new contract versions and migrating state (or running old + new in parallel during transition).
2. **Database:** Run `prisma migrate deploy` with a reversible migration. Keep previous version deployed until verified.
3. **Application:** Use blue-green deployment. Keep previous Docker image tagged. Rollback: `docker-compose down && docker-compose -f docker-compose.prev.yml up -d`.
4. **Redis:** Redis is a cache layer — restart is safe. Auth sessions will require re-login.
