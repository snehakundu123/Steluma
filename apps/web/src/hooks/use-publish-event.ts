'use client'

import { useState } from 'react'
import { api } from '@/lib/api'
import { signXdr } from '@/lib/freighter'
import { useAuthStore } from '@/store/auth.store'

export type PublishStep =
  | 'idle'
  | 'calculating'
  | 'building-stake-tx'
  | 'awaiting-stake-signature'
  | 'submitting-stake'
  | 'recording-stake'
  | 'building-register-tx'
  | 'awaiting-register-signature'
  | 'submitting-register'
  | 'extracting-event-id'
  | 'publishing'
  | 'done'
  | 'error'

export interface PublishState {
  step: PublishStep
  error: string | null
  stakeAmount: number | null
  stakeTxHash: string | null
  onChainEventId: string | null
  eventSlug: string | null
}

const NETWORK_PASSPHRASE =
  process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE ?? 'Test SDF Network ; September 2015'
const HORIZON_URL = 'https://horizon-testnet.stellar.org'
const SOROBAN_URL = 'https://soroban-testnet.stellar.org'

export const STEP_LABELS: Record<PublishStep, string> = {
  idle: 'Ready to publish',
  calculating: 'Calculating required stake…',
  'building-stake-tx': 'Preparing stake transaction…',
  'awaiting-stake-signature': 'Approve the stake payment in Freighter',
  'submitting-stake': 'Submitting stake to Stellar…',
  'recording-stake': 'Recording stake…',
  'building-register-tx': 'Building on-chain event registration…',
  'awaiting-register-signature': 'Approve the event registration in Freighter',
  'submitting-register': 'Registering event on Stellar…',
  'extracting-event-id': 'Waiting for blockchain confirmation… (up to 2 min)',
  publishing: 'Activating event…',
  done: 'Event is live on Stellar! 🎉',
  error: 'Something went wrong',
}

// Poll Soroban RPC until the transaction is confirmed (max 120s)
async function pollSorobanTransaction(hash: string, maxMs = 120_000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < maxMs) {
    await new Promise((r) => setTimeout(r, 2000))
    const res = await fetch(SOROBAN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTransaction', params: { hash } }),
    })
    const data = (await res.json()) as any
    const status = data.result?.status
    if (status === 'SUCCESS') return
    if (status === 'FAILED') {
      const errXdr = data.result?.resultXdr ?? data.result?.errorResultXdr ?? ''
      throw new Error(`Transaction failed on-chain${errXdr ? ` (${errXdr.slice(0, 40)}…)` : ''}`)
    }
    // NOT_FOUND = still pending — keep polling
  }
  throw new Error(`Transaction not confirmed after ${maxMs / 1000}s — testnet may be congested, please retry.`)
}

// Submit a signed XDR to Horizon (for regular payments)
async function submitToHorizon(signedXdr: string): Promise<string> {
  const params = new URLSearchParams({ tx: signedXdr })
  const res = await fetch(`${HORIZON_URL}/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  const data = await res.json() as any
  if (!res.ok || data.status >= 400) {
    // Extract the Horizon extras for a clearer error message
    const extras = data.extras?.result_codes
    const opCode = extras?.operations?.[0] ?? ''
    const txCode = extras?.transaction ?? data.title ?? ''
    throw new Error(`Stake payment failed: ${txCode}${opCode ? ` (${opCode})` : ''}`)
  }
  return data.hash as string
}

// Submit a signed Soroban XDR to the RPC
async function submitToSoroban(signedXdr: string): Promise<string> {
  const res = await fetch(SOROBAN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'sendTransaction', params: { transaction: signedXdr } }),
  })
  const data = await res.json() as any
  if (data.error) throw new Error(`Soroban RPC error: ${data.error.message}`)
  if (data.result?.status === 'ERROR') {
    const xdr = data.result.errorResultXdr ?? ''
    throw new Error(`Contract transaction rejected by network. ${xdr ? `(errorXdr: ${xdr})` : 'Check contract and account balance.'}`)
  }
  if (!data.result?.hash) throw new Error('No transaction hash returned from network')
  return data.result.hash as string
}

export function usePublishEvent() {
  const { wallet } = useAuthStore()
  const [state, setState] = useState<PublishState>({
    step: 'idle',
    error: null,
    stakeAmount: null,
    stakeTxHash: null,
    onChainEventId: null,
    eventSlug: null,
  })

  function setStep(step: PublishStep, extra: Partial<PublishState> = {}) {
    setState((prev) => ({ ...prev, step, error: null, ...extra }))
  }

  function setError(error: string) {
    setState((prev) => ({ ...prev, step: 'error', error }))
  }

  async function publish(eventId: string, eventSlug: string) {
    if (!wallet) { setError('Wallet not connected. Please reconnect.'); return }

    try {
      // ── 1. Calculate required stake ─────────────────────────────────
      setStep('calculating')
      const calc = await api.get<{ minimum: string; recommended: string }>(
        `/staking/calculate?eventId=${eventId}`,
      )
      const stakeAmount = Math.ceil(Number(calc.minimum))

      // ── 2. Build stake payment XDR (Horizon transaction) ─────────────
      setStep('building-stake-tx', { stakeAmount })
      const stakeBuild = await api.post<{ xdr: string; networkPassphrase: string; submitTo: string }>(
        '/staking/build-tx',
        { fromWallet: wallet, amount: stakeAmount.toFixed(7) },
      )

      // ── 3. Freighter signs the stake payment ──────────────────────────
      setStep('awaiting-stake-signature')
      let signedStakeXdr: string
      try {
        signedStakeXdr = await signXdr(stakeBuild.xdr, stakeBuild.networkPassphrase ?? NETWORK_PASSPHRASE)
      } catch (e: any) {
        if (e.message?.toLowerCase().includes('declin') || e.message?.toLowerCase().includes('reject') || e.message?.toLowerCase().includes('cancel')) {
          setError('Stake payment was cancelled. Your draft is saved — click "Stake & Publish" to try again.')
          return
        }
        throw e
      }

      // ── 4. Submit stake payment to Horizon ────────────────────────────
      // The stake payment is a regular XLM payment → goes via Horizon REST API
      setStep('submitting-stake')
      const stakeTxHash = await submitToHorizon(signedStakeXdr)

      // ── 5. Record stake in database ───────────────────────────────────
      setStep('recording-stake', { stakeTxHash })
      await api.post('/staking/stake', {
        eventId,
        amount: stakeAmount,
        asset: 'XLM',
        txHash: stakeTxHash,
      })

      // ── 6. Build EventFactory.create_event XDR (organizer is the signer) ──
      // The contract calls organizer.require_auth(); the organizer signs the tx
      // in Freighter, which satisfies it via source-account auth.
      setStep('building-register-tx')
      const registerBuild = await api.post<{ xdr: string; networkPassphrase: string }>(
        '/staking/build-register-tx',
        { eventId, fromWallet: wallet },
      )

      // ── 7. Freighter signs the contract registration ──────────────────
      setStep('awaiting-register-signature')
      let signedRegisterXdr: string
      try {
        signedRegisterXdr = await signXdr(
          registerBuild.xdr,
          registerBuild.networkPassphrase ?? NETWORK_PASSPHRASE,
        )
      } catch (e: any) {
        if (e.message?.toLowerCase().includes('declin') || e.message?.toLowerCase().includes('reject') || e.message?.toLowerCase().includes('cancel')) {
          setError('Event registration was cancelled. Stake was already recorded — click "Stake & Publish" again to retry the registration step.')
          return
        }
        throw e
      }

      // ── 8. Submit contract call to Soroban RPC ────────────────────────
      setStep('submitting-register')
      const registerTxHash = await submitToSoroban(signedRegisterXdr)

      // ── 9. Poll Soroban RPC directly until the tx is confirmed ───────────
      // Polling client-side avoids long-lived HTTP connections to the backend
      // that get cut off by proxies/timeouts. We wait up to 120s for testnet.
      setStep('extracting-event-id')
      await pollSorobanTransaction(registerTxHash)

      // ── 10. Read on-chain event ID from backend (tx already confirmed) ────
      const extracted = await api.post<{ onChainEventId: string }>(
        '/staking/extract-event-id',
        { txHash: registerTxHash, organizerWallet: wallet },
      )

      // ── 11. Mark event ACTIVE in DB ────────────────────────────────────
      setStep('publishing', { onChainEventId: extracted.onChainEventId })
      await api.post(`/events/${eventId}/publish`, {
        stakeTxHash,
        onChainEventId: extracted.onChainEventId,
      })

      setStep('done', { eventSlug })
    } catch (err: any) {
      console.error('[usePublishEvent] error:', err)
      setError(err.message ?? 'Failed to publish event. Please try again.')
    }
  }

  function reset() {
    setState({
      step: 'idle',
      error: null,
      stakeAmount: null,
      stakeTxHash: null,
      onChainEventId: null,
      eventSlug: null,
    })
  }

  return { state, publish, reset, stepLabel: STEP_LABELS[state.step] }
}
