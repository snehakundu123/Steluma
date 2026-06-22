'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Shield, Wallet, CheckCircle, AlertCircle, Clock,
  ArrowRight, Lock, ArrowLeft, Sparkles, Star,
} from 'lucide-react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { Navbar } from '@/components/layout/navbar'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import { signXdr } from '@/lib/freighter'
import { formatXLM, cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

type StakeCalc = {
  minimum: string
  recommended: string
  asset: string
  trustTier: string
  breakdown: { baseFloor: string; revenueEstimate: string; multiplier: number; trustTier: string }
}

type TicketTier = {
  id: string
  name: string
  price: string
  totalCapacity: number
  description?: string
  perks?: string[]
}

type EventData = {
  id: string
  title: string
  slug: string
  status: string
  stakeRequired: string
  tiers?: TicketTier[]
}

type StakeStep =
  | 'info'
  | 'signing_register'
  | 'submitting_register'
  | 'signing_stake'
  | 'submitting_stake'
  | 'done'
  | 'error'

const NETWORK_PASSPHRASE =
  process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE ?? 'Test SDF Network ; September 2015'

// ── Helpers ───────────────────────────────────────────────────────────────────

const TIER_MULTIPLIERS: Record<string, number> = {
  PARTNER: 0.5,
  TRUSTED: 0.7,
  VERIFIED: 0.85,
  NEW: 1.0,
}

function getTierBenefitLabel(tier: string): string {
  return {
    PARTNER: '50% lower stake requirement',
    TRUSTED: '30% lower stake requirement',
    VERIFIED: '15% lower stake requirement',
    NEW: 'Standard stake requirement',
  }[tier] ?? 'Standard stake requirement'
}

// ── Tier Unlock Card ──────────────────────────────────────────────────────────

function TierUnlockCard({ tier, stakeAmount, minRequired }: {
  tier: TicketTier
  stakeAmount: number
  minRequired: number
}) {
  const unlocked = stakeAmount >= minRequired
  return (
    <motion.div
      initial={false}
      animate={{ opacity: unlocked ? 1 : 0.5 }}
      transition={{ duration: 0.3 }}
      className={cn(
        'rounded-xl border p-4 transition-colors',
        unlocked
          ? 'border-primary/30 bg-accent/40 shadow-xs'
          : 'border-border bg-muted/30',
      )}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-semibold text-foreground">{tier.name}</span>
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-bold tabular-nums text-foreground">
            {formatXLM(tier.price)} XLM
          </span>
          {unlocked && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500"
            >
              <CheckCircle className="h-3 w-3 text-white" />
            </motion.div>
          )}
        </div>
      </div>
      {tier.description && (
        <p className="text-xs text-muted-foreground mb-2 line-clamp-1">{tier.description}</p>
      )}
      {tier.perks && tier.perks.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tier.perks.slice(0, 3).map((perk) => (
            <span
              key={perk}
              className="rounded-full bg-background border border-border px-2 py-0.5 text-xs text-muted-foreground"
            >
              {perk}
            </span>
          ))}
        </div>
      )}
      {!unlocked && (
        <p className="mt-1.5 text-xs text-muted-foreground flex items-center gap-1">
          <Lock className="h-3 w-3" />
          Stake {formatXLM(minRequired)} XLM to unlock
        </p>
      )}
    </motion.div>
  )
}

// ── Step indicator ────────────────────────────────────────────────────────────

const STEP_LABELS: Record<StakeStep, string> = {
  info: '',
  signing_register: 'Sign event registration in Freighter…',
  submitting_register: 'Registering event on Stellar…',
  signing_stake: 'Sign stake payment in Freighter…',
  submitting_stake: 'Submitting stake to Stellar…',
  done: 'Published!',
  error: '',
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function StakePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const router = useRouter()
  const { isAuthenticated, wallet } = useAuthStore()

  const [stakeStep, setStakeStep] = useState<StakeStep>('info')
  const [amount, setAmount] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (!isAuthenticated) router.push('/connect')
  }, [isAuthenticated, router])

  // ── Event data ──────────────────────────────────────────────────────────────
  const { data: event } = useQuery({
    queryKey: ['event', slug],
    queryFn: () => api.get<EventData>(`/events/${slug}`),
    enabled: isAuthenticated,
  })

  // ── Stake calculation ───────────────────────────────────────────────────────
  const { data: calc, isLoading: calcLoading } = useQuery<StakeCalc>({
    queryKey: ['stake-calc', event?.id],
    queryFn: () => api.get(`/staking/calculate?eventId=${event?.id}`),
    enabled: !!event?.id && isAuthenticated,
  } as any)

  useEffect(() => {
    if (calc && !amount) setAmount(calc.recommended)
  }, [calc])

  const amountNum = parseFloat(amount) || 0
  const minNum = parseFloat(calc?.minimum ?? '0')
  const maxSlider = Math.max(minNum * 3, 100)

  // Determine which tier is currently "unlocked" based on stake amount
  const unlockedTiers = event?.tiers?.filter(
    (t) => amountNum >= minNum,
  ) ?? []

  // ── Stake mutation ──────────────────────────────────────────────────────────
  const stakeMutation = useMutation({
    mutationFn: async () => {
      if (!event || !wallet) throw new Error('Not ready')

      const horizonBase =
        process.env.NEXT_PUBLIC_STELLAR_NETWORK === 'mainnet'
          ? 'https://horizon.stellar.org'
          : 'https://horizon-testnet.stellar.org'

      async function submitToHorizon(signedXdr: string): Promise<string> {
        const res = await fetch(`${horizonBase}/transactions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ tx: signedXdr }),
        })
        const d = await res.json()
        if (!d.hash) throw new Error(d.extras?.result_codes?.transaction ?? d.detail ?? 'Transaction failed')
        if (d.successful === false) {
          throw new Error(d.extras?.result_codes?.transaction ?? 'Transaction was rejected by the network')
        }
        return d.hash
      }

      let onChainEventId: bigint | null = null
      let stakeTxHash: string | null = null

      if (event.status !== 'STAKED') {
        // Step 1: Register event on-chain
        let registerRes: { xdr?: string; networkPassphrase?: string } | null = null
        try {
          registerRes = await api.post<{ xdr?: string; networkPassphrase?: string }>(
            '/staking/build-register-tx',
            { eventId: event.id, fromWallet: wallet },
          )
        } catch {
          // Contract not configured — skip on-chain registration
        }

        if (registerRes?.xdr) {
          setStakeStep('signing_register')
          let signedRegisterXdr: string
          try {
            signedRegisterXdr = await signXdr(registerRes.xdr, registerRes.networkPassphrase ?? NETWORK_PASSPHRASE)
          } catch (err: any) {
            throw new Error(err.message?.includes('User declined') ? 'Event registration cancelled' : err.message)
          }

          setStakeStep('submitting_register')
          const registerTxHash = await submitToHorizon(signedRegisterXdr)
          onChainEventId = await extractEventId(registerTxHash, wallet)
          if (onChainEventId) toast.success(`Event #${onChainEventId} registered on Stellar!`)
        }

        // Step 2: Build & sign stake payment
        const txXdr = await buildStakeTx(wallet, amount)

        setStakeStep('signing_stake')
        let signedStakeXdr: string
        try {
          signedStakeXdr = await signXdr(txXdr, NETWORK_PASSPHRASE)
        } catch (err: any) {
          throw new Error(err.message?.includes('User declined') ? 'Stake transaction cancelled' : err.message)
        }

        setStakeStep('submitting_stake')
        stakeTxHash = await submitToHorizon(signedStakeXdr)

        // Step 3: Record stake in DB
        await api.post('/staking/stake', {
          eventId: event.id,
          amount: parseFloat(amount),
          asset: 'XLM',
          txHash: stakeTxHash,
        })
      }

      // Step 4: Publish event
      const result = await api.post(`/events/${event.id}/publish`, {
        stakeTxHash: stakeTxHash ?? 'retry',
        onChainEventId: onChainEventId?.toString(),
      })
      return result
    },
    onSuccess: () => {
      setStakeStep('done')
      toast.success('Event published! Stake locked in escrow.')
      setTimeout(() => router.push(`/events/${slug}/manage`), 2000)
    },
    onError: (err: any) => {
      setErrorMsg(err.message ?? 'Staking failed')
      setStakeStep('error')
    },
  })

  // ── Guard states ────────────────────────────────────────────────────────────

  if (!isAuthenticated || !event) return null

  if (event.status === 'ACTIVE') {
    return (
      <div className="min-h-screen bg-surface-subtle">
        <Navbar />
        <div className="mx-auto max-w-xl px-4 py-20 text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-emerald-100 dark:bg-emerald-950">
            <CheckCircle className="h-10 w-10 text-emerald-500" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Already Published</h1>
          <p className="mt-2 text-muted-foreground">This event is live and accepting tickets.</p>
          <div className="mt-6 flex justify-center gap-3">
            <Link href={`/events/${slug}`}>
              <Button variant="outline">View Event</Button>
            </Link>
            <Link href={`/events/${slug}/manage`}>
              <Button variant="gradient">Manage Event</Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (event.status === 'STAKED') {
    return (
      <div className="min-h-screen bg-surface-subtle">
        <Navbar />
        <div className="mx-auto max-w-xl px-4 py-20 text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-amber-100 dark:bg-amber-950">
            <Shield className="h-10 w-10 text-amber-600" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Stake Confirmed</h1>
          <p className="mt-2 text-muted-foreground">
            Your XLM stake was received. Click below to publish — no additional payment needed.
          </p>
          {stakeStep === 'error' && (
            <p className="mt-3 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950 dark:border-red-900 p-3 text-sm text-red-700 dark:text-red-400">
              {errorMsg}
            </p>
          )}
          <Button
            variant="gradient"
            className="mt-6 gap-2"
            loading={stakeStep !== 'info' && stakeStep !== 'error'}
            onClick={() => stakeMutation.mutate()}
          >
            <CheckCircle className="h-5 w-5" />
            Publish Event Now
          </Button>
        </div>
      </div>
    )
  }

  const isStaking = stakeStep !== 'info' && stakeStep !== 'error' && stakeStep !== 'done'
  const belowMinimum = !!calc && amountNum < minNum

  return (
    <div className="min-h-screen bg-surface-subtle">
      <Navbar />

      <div className="mx-auto max-w-xl px-4 py-8">
        {/* Back link */}
        <Link
          href={`/events/${slug}`}
          className="mb-6 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to event
        </Link>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 text-center"
        >
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg shadow-violet-500/30">
            <Shield className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Stake & Publish</h1>
          <p className="mt-2 text-muted-foreground text-sm">
            Stake XLM to vouch for <span className="font-medium text-foreground">{event.title}</span>.
            Returned 72h after a successful event.
          </p>
        </motion.div>

        <div className="space-y-4">
          {/* Trust tier badge */}
          {calc && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 shadow-xs"
            >
              <Star className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-foreground">{calc.breakdown.trustTier} Tier</span>
              <span className="text-xs text-muted-foreground ml-auto">{getTierBenefitLabel(calc.breakdown.trustTier)}</span>
            </motion.div>
          )}

          {/* Stake amount card */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="rounded-2xl border border-border bg-card p-6 shadow-xs"
          >
            <h2 className="mb-4 text-sm font-semibold text-foreground">Stake Amount</h2>

            {calcLoading ? (
              <div className="space-y-3">
                <div className="skeleton h-14 rounded-xl" />
                <div className="skeleton h-4 w-2/3 rounded" />
                <div className="skeleton h-10 rounded-xl" />
              </div>
            ) : calc ? (
              <>
                {/* Amount input */}
                <div className="relative mb-3">
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    min={calc.minimum}
                    step="0.01"
                    className="w-full rounded-xl border border-input bg-surface-subtle py-3 pl-4 pr-16 text-2xl font-bold text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-colors"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">XLM</span>
                </div>

                {/* Slider */}
                <input
                  type="range"
                  min={minNum}
                  max={maxSlider}
                  step={0.01}
                  value={amountNum || minNum}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full h-1.5 mb-4 rounded-full appearance-none bg-muted accent-violet-600 cursor-pointer"
                />

                {/* Quick-set buttons */}
                <div className="flex gap-2 mb-5">
                  {[
                    { label: 'Min', value: calc.minimum },
                    { label: 'Rec', value: calc.recommended },
                    { label: '2×', value: String(Number(calc.recommended) * 2) },
                  ].map(({ label, value }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setAmount(value)}
                      className={cn(
                        'flex-1 rounded-xl border px-2 py-2 text-xs font-medium transition-all',
                        amount === value
                          ? 'border-primary bg-accent text-accent-foreground shadow-xs'
                          : 'border-border text-muted-foreground hover:border-primary/40 hover:bg-accent/30',
                      )}
                    >
                      <div className="font-semibold">{label}</div>
                      <div className="tabular-nums mt-0.5 text-foreground/70">{formatXLM(value)}</div>
                    </button>
                  ))}
                </div>

                {/* Breakdown */}
                <div className="space-y-2 rounded-xl bg-surface-subtle border border-border/50 p-4 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Base floor</span>
                    <span className="tabular-nums">{formatXLM(calc.breakdown.baseFloor)} XLM</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Revenue est. × {(calc.breakdown.multiplier * 100).toFixed(0)}%</span>
                    <span className="tabular-nums">
                      {formatXLM(String(Number(calc.breakdown.revenueEstimate) * calc.breakdown.multiplier))} XLM
                    </span>
                  </div>
                  <div className="border-t border-border pt-2 flex justify-between font-semibold text-foreground">
                    <span>Minimum required</span>
                    <span className="tabular-nums">{formatXLM(calc.minimum)} XLM</span>
                  </div>
                </div>

                {belowMinimum && (
                  <p className="mt-2 text-xs text-red-500 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    Must stake at least {formatXLM(calc.minimum)} XLM
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Unable to calculate stake requirement.</p>
            )}
          </motion.div>

          {/* Tier unlock preview */}
          {event.tiers && event.tiers.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="rounded-2xl border border-border bg-card p-5 shadow-xs"
            >
              <div className="mb-3 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold text-foreground">Ticket Tiers Unlocked</h2>
                <span className="ml-auto text-xs text-muted-foreground">
                  {amountNum >= minNum ? 'All tiers available' : 'Stake minimum to unlock'}
                </span>
              </div>
              <div className="space-y-2">
                {event.tiers.map((tier) => (
                  <TierUnlockCard
                    key={tier.id}
                    tier={tier}
                    stakeAmount={amountNum}
                    minRequired={minNum}
                  />
                ))}
              </div>
            </motion.div>
          )}

          {/* How staking works */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="rounded-2xl border border-border bg-card p-5 shadow-xs"
          >
            <h2 className="mb-3 text-sm font-semibold text-foreground">How Staking Works</h2>
            <div className="space-y-3">
              {[
                { icon: Lock, color: 'text-violet-500', text: 'Stake locks in an on-chain Soroban escrow smart contract on Stellar' },
                { icon: CheckCircle, color: 'text-emerald-500', text: 'Released automatically 72 hours after your event ends' },
                { icon: AlertCircle, color: 'text-amber-500', text: 'Slashed proportionally if you cancel without notice or scam attendees' },
                { icon: Clock, color: 'text-blue-500', text: 'Higher trust tier → lower required stake percentage' },
              ].map(({ icon: Icon, color, text }, i) => (
                <div key={i} className="flex items-start gap-3">
                  <Icon className={cn('mt-0.5 h-4 w-4 flex-shrink-0', color)} />
                  <p className="text-sm text-muted-foreground">{text}</p>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Success state */}
          <AnimatePresence>
            {stakeStep === 'done' && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="rounded-2xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/50 dark:border-emerald-900 p-6 text-center"
              >
                <CheckCircle className="mx-auto mb-3 h-12 w-12 text-emerald-500" />
                <h3 className="text-lg font-bold text-emerald-800 dark:text-emerald-300">Event Published!</h3>
                <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-400">
                  Stake locked in escrow. Redirecting to management page…
                </p>
                <Link href={`/events/${slug}/manage`}>
                  <Button variant="gradient" className="mt-4 gap-2">
                    Manage Event <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error state */}
          <AnimatePresence>
            {stakeStep === 'error' && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/50 dark:border-red-900 p-4 text-sm text-red-700 dark:text-red-400 flex items-start gap-2"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <div>
                  <div className="font-medium">Staking failed</div>
                  <div className="mt-0.5">{errorMsg}</div>
                  <button onClick={() => setStakeStep('info')} className="mt-2 underline text-xs">
                    Try again
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* CTA */}
          {stakeStep !== 'done' && (
            <Button
              variant="gradient"
              size="xl"
              className="w-full gap-2"
              loading={isStaking}
              disabled={!amount || belowMinimum || isStaking}
              onClick={() => stakeMutation.mutate()}
            >
              {isStaking ? (
                STEP_LABELS[stakeStep]
              ) : (
                <>
                  <Wallet className="h-5 w-5" />
                  Stake {amount ? `${formatXLM(amount)} XLM` : ''} & Publish On-Chain
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Utility functions (unchanged from original) ───────────────────────────────

async function buildStakeTx(fromWallet: string, amount: string): Promise<string> {
  const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
  const token = localStorage.getItem('steluma:access_token')
  const res = await fetch(`${API}/api/v1/staking/build-tx`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ fromWallet, amount }),
  })
  if (!res.ok) throw new Error('Failed to build stake transaction')
  const { xdr, error } = await res.json()
  if (error) throw new Error(error.message ?? 'Build stake tx failed')
  return xdr
}

async function extractEventId(txHash: string, organizerWallet: string): Promise<bigint | null> {
  const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
  const token = localStorage.getItem('steluma:access_token')
  const res = await fetch(`${API}/api/v1/staking/extract-event-id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ txHash, organizerWallet }),
  })
  if (!res.ok) return null
  const { onChainEventId } = await res.json()
  return onChainEventId ? BigInt(onChainEventId) : null
}
