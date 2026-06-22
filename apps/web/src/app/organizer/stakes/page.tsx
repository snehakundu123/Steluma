'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Shield, AlertTriangle, Check, Info, TrendingUp, ExternalLink,
  ChevronRight, ArrowUpCircle, ArrowDownCircle, Loader2,
} from 'lucide-react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { Navbar } from '@/components/layout/navbar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import { formatXLM, formatDate, getTrustTierColor, cn } from '@/lib/utils'

// ─── Types ───────────────────────────────────────────────────────────────────

type TrustTier = 'NEW' | 'VERIFIED' | 'TRUSTED' | 'PARTNER'

type StakingInfo = {
  totalStaked: string
  trustTier: TrustTier
  trustScore: number
  stakedSince?: string
  hasActiveEvents: boolean
  history: Array<{
    id: string
    action: 'STAKE' | 'WITHDRAW'
    amount: string
    createdAt: string
    txHash?: string
  }>
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TIERS: Array<{
  key: TrustTier
  label: string
  minXLM: number
  color: string
  bg: string
  border: string
  features: string[]
}> = [
  {
    key: 'NEW',
    label: 'New',
    minXLM: 0,
    color: 'text-gray-600 dark:text-gray-400',
    bg: 'bg-gray-50 dark:bg-gray-900',
    border: 'border-gray-200 dark:border-gray-800',
    features: ['Create events', 'Basic listing'],
  },
  {
    key: 'VERIFIED',
    label: 'Verified',
    minXLM: 100,
    color: 'text-blue-700 dark:text-blue-400',
    bg: 'bg-blue-50 dark:bg-blue-950',
    border: 'border-blue-200 dark:border-blue-800',
    features: ['Verified badge', 'Priority listing', 'Email support'],
  },
  {
    key: 'TRUSTED',
    label: 'Trusted',
    minXLM: 500,
    color: 'text-emerald-700 dark:text-emerald-400',
    bg: 'bg-emerald-50 dark:bg-emerald-950',
    border: 'border-emerald-200 dark:border-emerald-800',
    features: ['Featured events', 'Lower platform fees (3%)', 'Priority support'],
  },
  {
    key: 'PARTNER',
    label: 'Partner',
    minXLM: 2000,
    color: 'text-violet-700 dark:text-violet-400',
    bg: 'bg-violet-50 dark:bg-violet-950',
    border: 'border-violet-200 dark:border-violet-800',
    features: ['Homepage spotlight', 'Zero platform fees', 'Dedicated account manager'],
  },
]

function getTierIndex(tier: TrustTier): number {
  return TIERS.findIndex((t) => t.key === tier)
}

function getTierProgress(stakedXLM: number, tier: TrustTier): number {
  const idx = getTierIndex(tier)
  const current = TIERS[idx]
  const next = TIERS[idx + 1]
  if (!next) return 100
  const range = next.minXLM - current.minXLM
  const progress = stakedXLM - current.minXLM
  return Math.min(100, Math.max(0, Math.round((progress / range) * 100)))
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TierTable({ currentTier, stakedXLM }: { currentTier: TrustTier; stakedXLM: number }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border">
      {/* Header */}
      <div className="grid grid-cols-[1fr_auto_1fr] border-b border-border bg-muted/40 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <span>Tier</span>
        <span className="text-center">Min. Stake</span>
        <span className="text-right">Benefits</span>
      </div>

      {TIERS.map((tier, i) => {
        const isCurrent = tier.key === currentTier
        const isUnlocked = stakedXLM >= tier.minXLM

        return (
          <div
            key={tier.key}
            className={cn(
              'grid grid-cols-[1fr_auto_1fr] items-start px-5 py-4 transition-colors',
              i !== TIERS.length - 1 && 'border-b border-border',
              isCurrent && 'bg-primary/5',
            )}
          >
            {/* Left: tier badge */}
            <div className="flex items-center gap-3">
              {isCurrent && (
                <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse" />
              )}
              <span
                className={cn(
                  'rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                  tier.bg, tier.color, tier.border,
                )}
              >
                {tier.label}
              </span>
              {isCurrent && (
                <span className="text-xs font-medium text-primary">Current</span>
              )}
              {!isCurrent && isUnlocked && (
                <Check className="h-3.5 w-3.5 text-emerald-500" />
              )}
            </div>

            {/* Center: amount */}
            <div className="text-center text-sm font-semibold text-foreground tabular-nums">
              {tier.minXLM === 0 ? 'Free' : `${tier.minXLM.toLocaleString()} XLM`}
            </div>

            {/* Right: features */}
            <ul className="text-right space-y-1">
              {tier.features.map((f) => (
                <li key={f} className="text-xs text-muted-foreground">{f}</li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

function HistoryTable({ history }: { history: StakingInfo['history'] }) {
  if (!history.length) return (
    <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
      <TrendingUp className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground">No staking activity yet</p>
    </div>
  )

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="grid grid-cols-[1fr_auto_auto_auto] border-b border-border bg-muted/40 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground gap-4">
        <span>Date</span>
        <span>Action</span>
        <span className="text-right">Amount</span>
        <span className="text-right">Tx</span>
      </div>
      <div className="divide-y divide-border">
        {history.map((h) => (
          <div key={h.id} className="grid grid-cols-[1fr_auto_auto_auto] items-center px-5 py-3.5 gap-4">
            <span className="text-sm text-muted-foreground">{formatDate(h.createdAt)}</span>
            <span className={cn(
              'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
              h.action === 'STAKE'
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
                : 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
            )}>
              {h.action === 'STAKE'
                ? <ArrowUpCircle className="h-3 w-3" />
                : <ArrowDownCircle className="h-3 w-3" />}
              {h.action === 'STAKE' ? 'Staked' : 'Withdrawn'}
            </span>
            <span className="text-right text-sm font-semibold tabular-nums text-foreground">
              {formatXLM(h.amount)} XLM
            </span>
            <div className="text-right">
              {h.txHash ? (
                <a
                  href={`https://stellar.expert/explorer/testnet/tx/${h.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  View
                </a>
              ) : (
                <span className="text-xs text-muted-foreground/50">—</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OrganizerStakesPage() {
  const router = useRouter()
  const qc = useQueryClient()
  const { isAuthenticated, user } = useAuthStore()

  const [stakeAmount, setStakeAmount] = useState('')
  const [withdrawAmount, setWithdrawAmount] = useState('')

  useEffect(() => {
    if (!isAuthenticated) router.push('/connect?redirect=/organizer/stakes')
  }, [isAuthenticated, router])

  const { data, isLoading } = useQuery({
    queryKey: ['organizer-staking-info'],
    enabled: isAuthenticated,
    retry: false,
    // Map the real /organizers/me/stakes list → the aggregate StakingInfo shape
    queryFn: async (): Promise<StakingInfo> => {
      const res = await api.get<{ data: Array<any> }>('/organizers/me/stakes')
      const stakes = res.data ?? []
      const activeStakes = stakes.filter((s) => s.status === 'STAKED')
      const totalStaked = activeStakes.reduce((sum, s) => sum + Number(s.amount ?? 0), 0)
      const earliest = activeStakes
        .map((s) => s.stakedAt)
        .filter(Boolean)
        .sort()[0]

      return {
        totalStaked: String(totalStaked),
        trustTier: (user?.organizerProfile?.trustTier ?? 'NEW') as TrustTier,
        trustScore: user?.organizerProfile?.reputationScore ?? 0,
        stakedSince: earliest,
        hasActiveEvents: activeStakes.length > 0,
        history: stakes.map((s) => ({
          id: s.id,
          action: 'STAKE' as const,
          amount: String(s.amount ?? 0),
          createdAt: s.stakedAt ?? new Date().toISOString(),
          txHash: s.stakeTxHash,
        })),
      }
    },
  })

  const stakeMutation = useMutation({
    mutationFn: (amount: string) => api.post('/staking/stake', { amount }),
    onSuccess: () => {
      toast.success('Stake submitted!')
      setStakeAmount('')
      qc.invalidateQueries({ queryKey: ['organizer-staking-info'] })
    },
    onError: (err: any) => toast.error(err.message ?? 'Failed to stake'),
  })

  const withdrawMutation = useMutation({
    mutationFn: (_amount: string) => Promise.reject(new Error('Stake withdrawals are processed automatically after each event settles.')),
    onSuccess: () => {
      setWithdrawAmount('')
      qc.invalidateQueries({ queryKey: ['organizer-staking-info'] })
    },
    onError: (err: any) => toast.error(err.message ?? 'Withdrawal unavailable'),
  })

  if (!isAuthenticated) return null

  const stakedXLM = Number(data?.totalStaked ?? 0)
  const tier = (data?.trustTier ?? 'NEW') as TrustTier
  const tierIdx = getTierIndex(tier)
  const nextTier = TIERS[tierIdx + 1]
  const progress = getTierProgress(stakedXLM, tier)
  const toNextTier = nextTier ? Math.max(0, nextTier.minXLM - stakedXLM) : 0
  const tierCfg = TIERS.find((t) => t.key === tier)!

  return (
    <div className="min-h-screen bg-surface-subtle">
      <Navbar />

      {/* Page header */}
      <div className="border-b border-border bg-background">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 py-6">
          <p className="text-sm text-muted-foreground mb-1">
            <Link href="/organizer" className="hover:text-primary transition-colors">Dashboard</Link>
            <span className="mx-2 text-border">/</span>
            Staking
          </p>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-950">
              <Shield className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Organizer Staking</h1>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-8 space-y-6">
        {/* Info banner */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-5 py-4"
        >
          <Info className="h-4.5 w-4.5 flex-shrink-0 text-primary mt-0.5" />
          <p className="text-sm text-foreground">
            <span className="font-semibold">Staking makes you accountable.</span>{' '}
            Your stake backs every event you host — attendees can trust you mean business.
            The more you stake, the higher your trust tier and the better your platform benefits.
          </p>
        </motion.div>

        {/* Current stake card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-xs"
        >
          {isLoading ? (
            <div className="space-y-4 animate-pulse">
              <div className="h-8 w-1/3 rounded-lg bg-muted" />
              <div className="h-4 w-1/2 rounded-lg bg-muted" />
              <div className="h-3 w-full rounded-full bg-muted" />
            </div>
          ) : (
            <>
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-5">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Currently Staked</p>
                  <p className="text-4xl font-bold tabular-nums text-foreground">
                    {formatXLM(String(stakedXLM))}{' '}
                    <span className="text-xl text-muted-foreground font-normal">XLM</span>
                  </p>
                  {data?.stakedSince && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Since {formatDate(data.stakedSince)}
                    </p>
                  )}
                </div>

                {/* Tier badge */}
                <div className={cn(
                  'self-start rounded-xl border px-4 py-3 text-center',
                  tierCfg.bg, tierCfg.border,
                )}>
                  <p className={cn('text-xs font-semibold uppercase tracking-wide mb-0.5', tierCfg.color)}>
                    Trust Tier
                  </p>
                  <p className={cn('text-lg font-bold', tierCfg.color)}>
                    {tier}
                  </p>
                </div>
              </div>

              {/* Progress to next tier */}
              {nextTier ? (
                <div>
                  <div className="mb-2 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      Progress to <span className="font-semibold text-foreground">{nextTier.label}</span>
                    </span>
                    <span className="font-semibold text-foreground">
                      {toNextTier > 0 ? `${toNextTier.toLocaleString()} XLM to go` : 'Tier unlocked!'}
                    </span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut', delay: 0.3 }}
                      className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500"
                    />
                  </div>
                  <div className="mt-1.5 flex justify-between text-xs text-muted-foreground">
                    <span>{TIERS[tierIdx].minXLM.toLocaleString()} XLM</span>
                    <span>{nextTier.minXLM.toLocaleString()} XLM</span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm font-medium text-violet-600 dark:text-violet-400">
                  <Check className="h-4 w-4" />
                  Maximum tier achieved — you're a Partner!
                </div>
              )}
            </>
          )}
        </motion.div>

        {/* Tier comparison table */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-xs"
        >
          <h2 className="text-base font-semibold text-foreground mb-4">Trust Tiers</h2>
          {isLoading ? (
            <div className="animate-pulse space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-12 rounded-xl bg-muted" />
              ))}
            </div>
          ) : (
            <TierTable currentTier={tier} stakedXLM={stakedXLM} />
          )}
        </motion.div>

        {/* Add stake form */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-xs"
        >
          <h2 className="text-base font-semibold text-foreground mb-1">Add Stake</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Increase your stake to unlock a higher trust tier.
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Label htmlFor="stakeAmount" className="sr-only">Amount in XLM</Label>
              <div className="relative">
                <Input
                  id="stakeAmount"
                  type="number"
                  min="1"
                  step="any"
                  placeholder="Amount in XLM"
                  value={stakeAmount}
                  onChange={(e) => setStakeAmount(e.target.value)}
                  className="pr-14"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
                  XLM
                </span>
              </div>
            </div>
            <Button
              variant="gradient"
              className="gap-2 sm:w-auto"
              onClick={() => {
                const n = Number(stakeAmount)
                if (!n || n <= 0) return toast.error('Enter a valid amount')
                stakeMutation.mutate(stakeAmount)
              }}
              disabled={stakeMutation.isPending || !stakeAmount}
            >
              {stakeMutation.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Staking…</>
                : <><ArrowUpCircle className="h-4 w-4" /> Confirm Stake</>}
            </Button>
          </div>

          {/* Quick fill shortcuts */}
          {nextTier && toNextTier > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="text-xs text-muted-foreground self-center">Quick:</span>
              {[toNextTier, toNextTier * 2].filter((v) => v > 0).map((v) => (
                <button
                  key={v}
                  onClick={() => setStakeAmount(String(v))}
                  className="rounded-lg border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium text-foreground hover:bg-accent transition-colors"
                >
                  +{v.toLocaleString()} XLM
                </button>
              ))}
            </div>
          )}
        </motion.div>

        {/* Withdraw stake */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-xs"
        >
          <h2 className="text-base font-semibold text-foreground mb-1">Withdraw Stake</h2>

          {data?.hasActiveEvents ? (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950 dark:border-amber-800 px-4 py-3 mt-3">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
              <p className="text-sm text-amber-700 dark:text-amber-300">
                You have active events. Withdrawal is locked until all events are completed or cancelled.
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-4">
                You can withdraw your stake once all events are settled.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                  <div className="relative">
                    <Input
                      type="number"
                      min="1"
                      max={stakedXLM}
                      step="any"
                      placeholder="Amount to withdraw"
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      className="pr-14"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
                      XLM
                    </span>
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="gap-2 border-destructive/30 text-destructive hover:bg-destructive/5"
                  onClick={() => {
                    const n = Number(withdrawAmount)
                    if (!n || n <= 0) return toast.error('Enter a valid amount')
                    if (n > stakedXLM) return toast.error('Exceeds staked balance')
                    withdrawMutation.mutate(withdrawAmount)
                  }}
                  disabled={withdrawMutation.isPending || !withdrawAmount || stakedXLM === 0}
                >
                  {withdrawMutation.isPending
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Withdrawing…</>
                    : <><ArrowDownCircle className="h-4 w-4" /> Withdraw</>}
                </Button>
              </div>
            </>
          )}
        </motion.div>

        {/* Stake history */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          <h2 className="text-base font-semibold text-foreground mb-3">Stake History</h2>
          {isLoading ? (
            <div className="animate-pulse space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 rounded-2xl bg-muted" />
              ))}
            </div>
          ) : (
            <HistoryTable history={data?.history ?? []} />
          )}
        </motion.div>
      </div>
    </div>
  )
}
