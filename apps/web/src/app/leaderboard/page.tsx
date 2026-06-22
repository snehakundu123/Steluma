'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Trophy, Shield, Star, Users, Zap, TrendingUp, Award,
  Crown, Medal, ChevronRight, BarChart3,
} from 'lucide-react'
import Link from 'next/link'
import { Navbar } from '@/components/layout/navbar'
import { api } from '@/lib/api'
import { formatXLM, getTrustTierColor, truncateWallet, cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'

type LeaderboardEntry = {
  rank: number
  organizer: {
    walletAddress: string
    displayName: string | null
    avatarUrl: string | null
    trustTier: string
    reputationScore: number
    totalEventsHosted: number
    successfulEvents: number
    totalAttendeesServed: number
    totalRevenue: string
    averageRating: number
    ratingCount: number
    verificationStatus: string
  }
}

type Period = 'all-time' | 'this-month' | 'this-week'

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: 'all-time', label: 'All Time' },
  { value: 'this-month', label: 'This Month' },
  { value: 'this-week', label: 'This Week' },
]

const TIER_ICONS: Record<string, string> = {
  PARTNER: '💎',
  TRUSTED: '🏆',
  VERIFIED: '✅',
  NEW: '🌱',
}

const RANK_MEDAL = ['🥇', '🥈', '🥉']

const PODIUM_STYLES = [
  {
    gradient: 'from-yellow-500/20 to-amber-500/10',
    border: 'border-yellow-500/30',
    badge: 'bg-gradient-to-br from-yellow-400 to-amber-500 text-white shadow-lg shadow-amber-500/30',
    scoreColor: 'text-yellow-400',
    glow: 'shadow-amber-500/10',
  },
  {
    gradient: 'from-slate-400/20 to-slate-500/10',
    border: 'border-slate-400/30',
    badge: 'bg-gradient-to-br from-slate-300 to-slate-400 text-white shadow-md shadow-slate-500/20',
    scoreColor: 'text-slate-300',
    glow: 'shadow-slate-400/10',
  },
  {
    gradient: 'from-orange-500/20 to-orange-600/10',
    border: 'border-orange-500/30',
    badge: 'bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-md shadow-orange-500/20',
    scoreColor: 'text-orange-400',
    glow: 'shadow-orange-500/10',
  },
]

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn(
            'h-3 w-3',
            i < Math.round(rating)
              ? 'fill-yellow-400 text-yellow-400'
              : 'text-muted-foreground/30',
          )}
        />
      ))}
    </div>
  )
}

function LeaderboardSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="skeleton h-20 rounded-2xl" />
      ))}
    </div>
  )
}

function PodiumCard({ entry, style, delay }: {
  entry: LeaderboardEntry
  style: typeof PODIUM_STYLES[0]
  delay: number
}) {
  const isFirst = entry.rank === 1
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      <Link href={`/organizers/${entry.organizer.walletAddress}`}>
        <div
          className={cn(
            'group relative rounded-2xl border bg-card p-5 text-center transition-all duration-300',
            'hover:scale-[1.02] hover:shadow-xl cursor-pointer',
            style.gradient && `bg-gradient-to-b ${style.gradient}`,
            style.border,
            isFirst && 'sm:-mt-4 sm:shadow-2xl',
            `shadow-lg ${style.glow}`,
          )}
        >
          {isFirst && (
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
              <Crown className="h-7 w-7 text-yellow-400 drop-shadow-lg" />
            </div>
          )}

          {/* Medal */}
          <div
            className={cn(
              'mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full text-xl font-bold',
              style.badge,
            )}
          >
            {RANK_MEDAL[entry.rank - 1]}
          </div>

          {/* Avatar */}
          <div className="mx-auto mb-3 h-16 w-16 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-xl font-bold ring-2 ring-white/10 group-hover:ring-white/20 transition-all">
            {entry.organizer.avatarUrl ? (
              <img src={entry.organizer.avatarUrl} alt="" className="h-full w-full rounded-full object-cover" />
            ) : (
              (entry.organizer.displayName ?? entry.organizer.walletAddress).charAt(0).toUpperCase()
            )}
          </div>

          <h3 className="font-bold text-foreground truncate group-hover:text-primary transition-colors">
            {entry.organizer.displayName ?? truncateWallet(entry.organizer.walletAddress)}
          </h3>

          <div className={cn(
            'mt-1.5 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold',
            getTrustTierColor(entry.organizer.trustTier),
          )}>
            {TIER_ICONS[entry.organizer.trustTier]} {entry.organizer.trustTier}
          </div>

          <div className={cn('mt-3 text-3xl font-bold tabular-nums', style.scoreColor)}>
            {entry.organizer.reputationScore.toLocaleString()}
          </div>
          <div className="text-xs text-muted-foreground">reputation score</div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-background/50 p-2.5">
              <div className="text-sm font-bold text-foreground">{entry.organizer.totalEventsHosted}</div>
              <div className="text-xs text-muted-foreground">Events</div>
            </div>
            <div className="rounded-xl bg-background/50 p-2.5">
              <div className="flex justify-center">
                <StarRating rating={entry.organizer.averageRating} />
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {Number(entry.organizer.averageRating).toFixed(1)}
              </div>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  )
}

export default function LeaderboardPage() {
  const [period, setPeriod] = useState<Period>('all-time')
  const { wallet } = useAuthStore()

  const { data, isLoading } = useQuery({
    queryKey: ['leaderboard', period],
    queryFn: () => api.get<{ data: LeaderboardEntry[] }>(`/reputation/leaderboard?limit=50&period=${period}`),
    refetchInterval: 60_000,
  })

  const entries = data?.data ?? []
  const topThree = entries.slice(0, 3)
  const rest = entries.slice(3)

  // Reorder top 3 for visual podium: 2nd, 1st, 3rd
  const podiumOrder = [topThree[1], topThree[0], topThree[2]].filter(Boolean) as LeaderboardEntry[]
  const podiumStyleMap: Record<number, typeof PODIUM_STYLES[0]> = {
    1: PODIUM_STYLES[0],
    2: PODIUM_STYLES[1],
    3: PODIUM_STYLES[2],
  }

  const myEntry = wallet ? entries.find(e => e.organizer.walletAddress === wallet) : null

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero */}
      <div className="relative overflow-hidden border-b border-border bg-gradient-to-b from-surface-subtle to-background">
        {/* Background glow */}
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="absolute -top-20 left-1/2 -translate-x-1/2 h-72 w-96 rounded-full opacity-20 blur-3xl bg-violet-600" />
        </div>

        <div className="relative mx-auto max-w-4xl px-4 py-12 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-yellow-400 to-amber-500 shadow-lg shadow-amber-500/30"
          >
            <Trophy className="h-8 w-8 text-white" />
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-4xl font-bold text-foreground"
          >
            Top Organizers
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="mt-3 text-muted-foreground max-w-xl mx-auto"
          >
            Ranked by reputation score — earned through successful events, attendee ratings, and staking history.
          </motion.p>

          {/* Stats row */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mt-6 flex justify-center gap-8"
          >
            {[
              { label: 'Organizers', value: entries.length || '—', icon: Users },
              { label: 'Trust Tiers', value: '4', icon: Shield },
              { label: 'Updates', value: 'Live', icon: Zap },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="text-center">
                <div className="flex items-center justify-center gap-1.5 text-2xl font-bold text-foreground">
                  <Icon className="h-5 w-5 text-primary" />
                  {value}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
              </div>
            ))}
          </motion.div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-8 pb-20">
        {/* Period filter */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="mb-8 flex justify-center"
        >
          <div className="inline-flex rounded-xl border border-border bg-card p-1 gap-1">
            {PERIOD_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setPeriod(value)}
                className={cn(
                  'rounded-lg px-4 py-1.5 text-sm font-medium transition-all duration-200',
                  period === value
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </motion.div>

        {/* My ranking highlight */}
        {myEntry && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/10 to-indigo-500/10 p-4"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/20 text-sm font-bold text-primary">
                #{myEntry.rank}
              </div>
              <p className="text-sm font-medium text-foreground">
                You're ranked <span className="font-bold text-primary">#{myEntry.rank}</span> with{' '}
                <span className="font-bold">{myEntry.organizer.reputationScore}</span> reputation points
              </p>
            </div>
          </motion.div>
        )}

        {isLoading ? (
          <LeaderboardSkeleton />
        ) : entries.length === 0 ? (
          <div className="py-24 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
              <Trophy className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold text-foreground">No organizers yet</h2>
            <p className="mt-2 text-muted-foreground">
              Be the first to create an event and build your reputation.
            </p>
            <Link href="/events/create">
              <button className="mt-6 rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors">
                Create Event
              </button>
            </Link>
          </div>
        ) : (
          <>
            {/* Podium top 3 */}
            {topThree.length > 0 && (
              <div className="mb-10">
                <div className="grid gap-4 sm:grid-cols-3 items-end">
                  {podiumOrder.map((entry, idx) => (
                    <PodiumCard
                      key={entry.organizer.walletAddress}
                      entry={entry}
                      style={podiumStyleMap[entry.rank]}
                      delay={0.05 + idx * 0.08}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Full ranked list */}
            <div>
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                <BarChart3 className="h-4 w-4" />
                All Rankings
              </h2>

              <div className="space-y-2">
                {[...topThree, ...rest].map((entry, i) => {
                  const isMe = wallet === entry.organizer.walletAddress
                  const isTop3 = entry.rank <= 3
                  const successRate = entry.organizer.totalEventsHosted > 0
                    ? Math.round((entry.organizer.successfulEvents / entry.organizer.totalEventsHosted) * 100)
                    : 0

                  return (
                    <motion.div
                      key={entry.organizer.walletAddress}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.025 }}
                    >
                      <Link href={`/organizers/${entry.organizer.walletAddress}`}>
                        <div
                          className={cn(
                            'group flex items-center gap-4 rounded-2xl border bg-card p-4 transition-all duration-200',
                            'hover:border-primary/30 hover:shadow-md hover:-translate-y-0.5',
                            isMe && 'border-primary/40 bg-primary/5 ring-1 ring-primary/20',
                          )}
                        >
                          {/* Rank badge */}
                          <div
                            className={cn(
                              'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold',
                              isTop3
                                ? cn(
                                    PODIUM_STYLES[entry.rank - 1].badge,
                                    'text-base',
                                  )
                                : 'bg-muted text-muted-foreground',
                            )}
                          >
                            {isTop3 ? RANK_MEDAL[entry.rank - 1] : entry.rank}
                          </div>

                          {/* Avatar */}
                          <div className="h-10 w-10 flex-shrink-0 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-sm font-bold ring-1 ring-border group-hover:ring-primary/30 transition-all">
                            {entry.organizer.avatarUrl ? (
                              <img src={entry.organizer.avatarUrl} alt="" className="h-full w-full rounded-full object-cover" />
                            ) : (
                              (entry.organizer.displayName ?? entry.organizer.walletAddress).charAt(0).toUpperCase()
                            )}
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                                {entry.organizer.displayName ?? truncateWallet(entry.organizer.walletAddress)}
                              </span>
                              {isMe && (
                                <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary uppercase tracking-wide">
                                  You
                                </span>
                              )}
                              <span className={cn(
                                'rounded-full px-2 py-0.5 text-xs font-medium',
                                getTrustTierColor(entry.organizer.trustTier),
                              )}>
                                {TIER_ICONS[entry.organizer.trustTier]} {entry.organizer.trustTier}
                              </span>
                            </div>

                            <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Award className="h-3 w-3" />
                                {entry.organizer.totalEventsHosted} events
                              </span>
                              <span className="flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                {entry.organizer.totalAttendeesServed.toLocaleString()} attendees
                              </span>
                              <span className="flex items-center gap-1">
                                <TrendingUp className="h-3 w-3" />
                                {successRate}% success
                              </span>
                              <span className="hidden sm:flex items-center gap-1">
                                <span className="font-mono">{formatXLM(entry.organizer.totalRevenue)} XLM</span>
                              </span>
                            </div>
                          </div>

                          {/* Right: score + stars */}
                          <div className="flex-shrink-0 text-right hidden sm:block">
                            <StarRating rating={entry.organizer.averageRating} />
                            <div className="mt-1 text-xs text-muted-foreground">
                              {Number(entry.organizer.averageRating).toFixed(1)} ({entry.organizer.ratingCount})
                            </div>
                          </div>

                          <div className="flex-shrink-0 text-right">
                            <div className="text-xl font-bold text-primary tabular-nums">
                              {entry.organizer.reputationScore.toLocaleString()}
                            </div>
                            <div className="text-xs text-muted-foreground">score</div>
                          </div>

                          <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
                        </div>
                      </Link>
                    </motion.div>
                  )
                })}
              </div>
            </div>

            {/* How reputation works */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="mt-12 rounded-2xl border border-border bg-card p-6"
            >
              <h2 className="mb-5 flex items-center gap-2 text-base font-semibold text-foreground">
                <TrendingUp className="h-5 w-5 text-primary" />
                How Reputation is Calculated
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  { icon: Shield, label: 'Successful Events', value: 'Up to 400 pts', color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
                  { icon: Star, label: 'Attendee Ratings', value: 'Up to 200 pts', color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
                  { icon: Users, label: 'Attendance Rate', value: 'Up to 200 pts', color: 'text-blue-500', bg: 'bg-blue-500/10' },
                  { icon: Zap, label: 'Account Age & Stake', value: 'Up to 200 pts', color: 'text-violet-500', bg: 'bg-violet-500/10' },
                  { icon: Award, label: 'Dispute Penalty', value: '−50 per dispute', color: 'text-red-500', bg: 'bg-red-500/10' },
                ].map(({ icon: Icon, label, value, color, bg }) => (
                  <div key={label} className={cn('flex items-start gap-3 rounded-xl p-3', bg)}>
                    <div className={cn('mt-0.5 h-4 w-4 flex-shrink-0', color)}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-foreground">{label}</div>
                      <div className="text-xs text-muted-foreground">{value}</div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </div>
    </div>
  )
}
