import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { u64ToScVal, addressToScVal, stellarServer, sorobanRpc, networkPassphrase, adminKeypair } from '../lib/stellar.js'
import { env } from '../config/env.js'
import { logger } from '../lib/logger.js'
import * as StellarSdk from '@stellar/stellar-sdk'

const stakeSchema = z.object({
  eventId: z.string().uuid(),
  amount: z.number().positive(),
  asset: z.string().default('XLM'),
  txHash: z.string().min(1),
})

export async function stakingRoutes(app: FastifyInstance) {
  app.get('/calculate', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as any
    const { eventId } = req.query as { eventId?: string }

    const organizer = await prisma.organizerProfile.findUnique({ where: { userId: user.sub } })
    if (!organizer) return reply.status(403).send({ error: { code: 'NOT_ORGANIZER', message: 'Not an organizer' } })

    let revenueEstimate = 0
    if (eventId) {
      const tiers = await prisma.ticketTier.findMany({ where: { eventId } })
      revenueEstimate = tiers.reduce((s, t) => s + Number(t.price) * t.totalSupply, 0)
    }

    const multipliers: Record<string, number> = { NEW: 0.15, VERIFIED: 0.1, TRUSTED: 0.05, PARTNER: 0.02 }
    const multiplier = multipliers[organizer.trustTier] ?? 0.15
    const minimum = Math.max(100, revenueEstimate * multiplier)

    return reply.send({
      minimum: minimum.toFixed(7),
      recommended: (minimum * 1.1).toFixed(7),
      asset: 'XLM',
      breakdown: {
        baseFloor: '100.0000000',
        revenueEstimate: revenueEstimate.toFixed(7),
        multiplier,
        trustTier: organizer.trustTier,
      },
    })
  })

  app.post('/stake', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as any
    try {
      const { eventId, amount, asset, txHash } = stakeSchema.parse(req.body)

      const organizer = await prisma.organizerProfile.findUnique({ where: { userId: user.sub } })
      if (!organizer) return reply.status(403).send({ error: { code: 'NOT_ORGANIZER', message: 'Not an organizer' } })

      const event = await prisma.event.findFirst({
        where: { id: eventId, organizerId: organizer.id },
      })
      if (!event) return reply.status(404).send({ error: { code: 'EVENT_NOT_FOUND', message: 'Event not found' } })

      const existingStake = await prisma.organizerStake.findUnique({ where: { eventId } })

      // Idempotent: if stake already recorded as STAKED, return it so publish can proceed
      if (existingStake && existingStake.status === 'STAKED') {
        return reply.send({ id: existingStake.id, status: existingStake.status, stakedAt: existingStake.stakedAt?.toISOString() })
      }

      if (existingStake) {
        return reply.status(409).send({ error: { code: 'STAKE_EXISTS', message: 'Stake already exists with status: ' + existingStake.status } })
      }

      const stake = await prisma.organizerStake.create({
        data: {
          organizerId: organizer.id,
          eventId,
          amount,
          asset,
          status: 'STAKED',
          stakeTxHash: txHash,
          stakedAt: new Date(),
        },
      })

      await prisma.event.update({ where: { id: eventId }, data: { status: 'STAKED' } })

      logger.info('[Staking] stake recorded', { eventId, amount, organizerId: organizer.id })

      return reply.send({ id: stake.id, status: stake.status, stakedAt: stake.stakedAt?.toISOString() })
    } catch (err: any) {
      logger.error('[Staking] stake error', { err: err.message })
      return reply.status(400).send({ error: { code: 'STAKE_FAILED', message: err.message ?? 'Failed to record stake' } })
    }
  })

  // Build EventFactory.create_event Soroban XDR — the ORGANIZER must sign it.
  // The contract calls organizer.require_auth(); when the organizer is the tx source,
  // the auth entry is a SourceAccount credential, satisfied by the organizer's Freighter
  // signature on the whole transaction (no separate auth-entry signing needed).
  app.post('/build-register-tx', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { eventId, fromWallet } = req.body as { eventId: string; fromWallet: string }
    if (!env.EVENT_FACTORY_CONTRACT_ID) {
      return reply.status(400).send({ error: { code: 'NO_CONTRACT', message: 'EventFactory contract not configured' } })
    }

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { ticketTiers: true },
    })
    if (!event) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Event not found' } })

    // Pre-flight date validation — the on-chain contract panics (WasmVm/InvalidAction)
    // on invalid ranges, which surfaces as a cryptic error. Catch it here with a clear message.
    const startsSec = Math.floor(event.startsAt.getTime() / 1000)
    const endsSec = Math.floor(event.endsAt.getTime() / 1000)
    const nowSec = Math.floor(Date.now() / 1000)
    if (startsSec >= endsSec) {
      return reply.status(400).send({ error: { code: 'INVALID_DATES', message: 'Event end time must be after the start time. Please edit the event dates and try again.' } })
    }
    if (endsSec <= nowSec) {
      return reply.status(400).send({ error: { code: 'INVALID_DATES', message: 'Event end time is in the past. Please edit the event dates and try again.' } })
    }

    try {
      // Organizer is the tx source — satisfies organizer.require_auth() via source-account auth
      const account = await sorobanRpc.getAccount(fromWallet)
      const contract = new StellarSdk.Contract(env.EVENT_FACTORY_CONTRACT_ID)
      const metadataHash = Buffer.alloc(32)
      Buffer.from(event.id.replace(/-/g, ''), 'hex').copy(metadataHash)

      const totalTickets = event.ticketTiers.reduce((s, t) => s + t.totalSupply, 0)

      const tx = new StellarSdk.TransactionBuilder(account, {
        fee: '1000000',
        networkPassphrase,
      })
        .addOperation(
          contract.call(
            'create_event',
            addressToScVal(fromWallet),
            StellarSdk.xdr.ScVal.scvBytes(metadataHash),
            u64ToScVal(BigInt(startsSec)),
            u64ToScVal(BigInt(endsSec)),
            StellarSdk.nativeToScVal(totalTickets || 1, { type: 'u32' }),
          ),
        )
        .setTimeout(120)
        .build()

      // Simulate to get auth entries + resource limits
      const sim = await sorobanRpc.simulateTransaction(tx)
      if (!StellarSdk.rpc.Api.isSimulationSuccess(sim)) {
        const raw = JSON.stringify(sim.error ?? sim)
        // Map the contract's panic traps to human-readable messages
        let message = 'On-chain validation failed. Please check the event details and try again.'
        if (raw.includes('InvalidAction')) {
          message = 'The Stellar contract rejected the event — usually invalid dates (end before start, or in the past) or zero tickets. Please edit the event and try again.'
        }
        logger.error('[Staking] build-register-tx simulation failed', { eventId, raw: raw.slice(0, 300) })
        return reply.status(400).send({ error: { code: 'SIMULATION_FAILED', message } })
      }
      const prepared = StellarSdk.rpc.assembleTransaction(tx, sim).build()

      return reply.send({ xdr: prepared.toXDR(), networkPassphrase })
    } catch (err: any) {
      logger.error('[Staking] build-register-tx failed', { err: err.message })
      return reply.status(400).send({ error: { code: 'BUILD_FAILED', message: err.message } })
    }
  })

  // Read the on-chain event ID after the frontend has already confirmed the tx.
  // The frontend polls Soroban RPC directly and only calls this once the tx is SUCCESS,
  // so we skip polling here and go straight to reading get_event_count.
  app.post('/extract-event-id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { txHash, organizerWallet } = req.body as { txHash: string; organizerWallet?: string }
    if (!txHash) return reply.status(400).send({ error: { code: 'MISSING_HASH', message: 'txHash required' } })
    if (!env.EVENT_FACTORY_CONTRACT_ID) {
      return reply.status(400).send({ error: { code: 'NO_CONTRACT', message: 'EventFactory not configured' } })
    }

    try {
      // Quick confirmation check (3 attempts, 2s apart) — tx should already be confirmed
      const rpcUrl = env.STELLAR_RPC_URL
      let confirmed = false
      for (let i = 0; i < 3; i++) {
        await new Promise((r) => setTimeout(r, 2000))
        const res = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTransaction', params: { hash: txHash } }),
        })
        const data = (await res.json()) as any
        const status = data.result?.status
        logger.info('[Staking] verifying confirmed tx', { txHash, attempt: i + 1, status })
        if (status === 'SUCCESS') { confirmed = true; break }
        if (status === 'FAILED') {
          const errXdr = data.result?.resultXdr || data.result?.errorResultXdr || ''
          logger.error('[Staking] tx failed on-chain', { txHash, resultXdr: errXdr })
          return reply.status(400).send({
            error: { code: 'TX_FAILED', message: `Transaction failed on-chain. resultXdr: ${errXdr}` },
          })
        }
      }
      if (!confirmed) {
        return reply.status(400).send({ error: { code: 'NOT_CONFIRMED', message: 'Transaction not yet confirmed — frontend should confirm before calling this endpoint' } })
      }

      // Simulate get_event_count — returns the total event count (= the ID of the just-created event)
      const contract = new StellarSdk.Contract(env.EVENT_FACTORY_CONTRACT_ID)
      const adminAccount = await sorobanRpc.getAccount(adminKeypair.publicKey())
      const countTx = new StellarSdk.TransactionBuilder(adminAccount, {
        fee: '1000000',
        networkPassphrase,
      })
        .addOperation(contract.call('get_event_count'))
        .setTimeout(30)
        .build()

      const sim = await sorobanRpc.simulateTransaction(countTx)
      if (!StellarSdk.rpc.Api.isSimulationSuccess(sim)) {
        throw new Error('Failed to simulate get_event_count')
      }

      const retval = sim.result?.retval
      if (!retval) throw new Error('No return value from get_event_count')

      // Parse u64 from hex XDR — avoids scValToNative which fails on some SDK/protocol combos
      const hex = retval.toXDR('hex') as string
      const typeDiscriminant = parseInt(hex.slice(0, 8), 16)
      let eventId: bigint
      if (typeDiscriminant === 5 || typeDiscriminant === 6) {
        // scvU64: next 8 bytes are the big-endian uint64
        const hi = parseInt(hex.slice(8, 16), 16)
        const lo = parseInt(hex.slice(16, 24), 16)
        eventId = BigInt(hi >>> 0) * BigInt(0x100000000) + BigInt(lo >>> 0)
      } else {
        throw new Error(`Unexpected ScVal type ${typeDiscriminant} from get_event_count`)
      }

      logger.info('[Staking] on-chain event_id', { txHash, eventId: eventId.toString() })
      return reply.send({ onChainEventId: eventId.toString() })
    } catch (err: any) {
      logger.error('[Staking] extract-event-id error', { err: err.message })
      return reply.status(400).send({ error: { code: 'EXTRACT_FAILED', message: err.message } })
    }
  })

  // Build stake payment XDR for frontend (Freighter) signing.
  // Returns a Horizon-compatible XLM payment transaction.
  // The organizer wallet is the source AND must sign it in Freighter.
  app.post('/build-tx', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as any
    const { fromWallet, amount } = req.body as { fromWallet: string; amount: string }

    if (!fromWallet || !amount) {
      return reply.status(400).send({ error: { code: 'MISSING_PARAMS', message: 'fromWallet and amount required' } })
    }

    // Verify the fromWallet matches the authenticated user's wallet
    if (fromWallet !== user.wallet) {
      return reply.status(403).send({ error: { code: 'WALLET_MISMATCH', message: 'Wallet does not match authenticated user' } })
    }

    try {
      // Escrow destination = admin/platform wallet (in prod: the staking contract itself)
      const escrowDestination = adminKeypair.publicKey()

      // Load account from Horizon so we have the correct sequence number
      const account = await stellarServer.loadAccount(fromWallet)

      const tx = new StellarSdk.TransactionBuilder(account, {
        fee: '10000', // 0.001 XLM — generous for testnet
        networkPassphrase,
      })
        .addOperation(
          StellarSdk.Operation.payment({
            destination: escrowDestination,
            asset: StellarSdk.Asset.native(),
            amount: parseFloat(amount).toFixed(7),
          }),
        )
        .setTimeout(300) // 5 minutes for user to sign
        .build()

      return reply.send({
        xdr: tx.toXDR(),
        networkPassphrase,
        // Tell frontend to submit this to Horizon, not Soroban RPC
        submitTo: 'horizon',
      })
    } catch (err: any) {
      logger.error('[Staking] build-tx failed', { err: err.message })
      return reply.status(400).send({ error: { code: 'TX_BUILD_FAILED', message: err.message } })
    }
  })

  // Get my stakes
  app.get('/me/stakes', { onRequest: [app.authenticate] }, async (req, reply) => {
    const user = req.user as any
    const organizer = await prisma.organizerProfile.findUnique({ where: { userId: user.sub } })
    if (!organizer) return reply.send({ data: [] })

    const stakes = await prisma.organizerStake.findMany({
      where: { organizerId: organizer.id },
      orderBy: { createdAt: 'desc' },
      include: { event: { select: { id: true, title: true, slug: true, status: true, endsAt: true } } },
    })

    return reply.send({
      data: stakes.map((s) => ({
        ...s,
        amount: s.amount.toString(),
        canRelease: s.status === 'COMPLETED' && (!s.releaseAfter || new Date() >= s.releaseAfter),
      })),
    })
  })

  app.post('/:eventId/release', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { eventId } = req.params as { eventId: string }
    const user = req.user as any

    const stake = await prisma.organizerStake.findFirst({
      where: { eventId, organizer: { userId: user.sub } },
    })
    if (!stake) return reply.status(404).send({ error: { code: 'STAKE_NOT_FOUND', message: 'Stake not found' } })

    // Allow release if event is cancelled or completed + past dispute window
    const event = await prisma.event.findUnique({ where: { id: eventId } })
    const eventEnded = event?.status === 'CANCELLED' || (event?.endsAt && new Date() > event.endsAt)
    if (!eventEnded) {
      return reply.status(400).send({ error: { code: 'EVENT_NOT_ENDED', message: 'Event has not ended yet' } })
    }

    await prisma.organizerStake.update({
      where: { id: stake.id },
      data: { status: 'RELEASED', releasedAt: new Date() },
    })

    return reply.send({ status: 'RELEASED', amount: stake.amount.toString(), releasedAt: new Date().toISOString() })
  })
}
