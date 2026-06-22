'use client'

import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Shield, Star, Users, Trophy, ExternalLink, Globe, Twitter,
  Calendar, TrendingUp, CheckCircle2, Zap, Sparkles, Heart,
  Award, BarChart3, Coins,
} from 'lucide-react'
import Link from 'next/link'
import { Navbar } from '@/components/layout/navbar'
import { Button } from '@/components/ui/button'
import { EventCard, EventCardSkeleton } from '@/components/shared/event-card'
import { api } from '@/lib/api'
import { formatXLM, getTrustTierColor, truncateWallet, cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'

// ─── Types ──────────────────────────────────────────────────────────────────

type OrganizerProfile = {
  id: string
  walletAddress: string
  displayName: string | null
  bio: string | null
  website: string | null
  twitterHandle: string | null
  trustTier: string
  reputationScore: number
  verificationStatus: string
  totalEventsHosted: number
  successfulEvents: number
  totalAttendeesServed: number
  totalRevenue?: string
  averageRating: number
  ratingCount: number
  stakedAmount?: string
  stakeTier?: string
  events: { upcoming: any[]; past?: any[] }
}

// ─── Constants ────────────────────────────────────────────────────────────

const TIER_META: Record<string, { label: string; icon: string; desc: string; color: string; Icon: React.ElementType }> = {
  PARTNER: { label: 'Partner', icon: '💎', desc: 'Elite partner organizer', color: 'text-violet-400', Icon: Sparkles },
  TRUSTED: { label: 'Trusted', icon: '🏆', desc: 'Community-verified organizer', color: 'text-emerald-400', Icon: Trophy },
  VERIFIED: { label: 'Verified', icon: '✅', desc: 'Identity-verified organizer', color: 'text-blue-400', Icon: Shield },
  NEW: { label: 'New', icon: '🌱', desc: 'New organizer', color: 'text-gray-400', Icon: Zap },
}

const TIER_PROGRESSION = ['NEW', 'VERIFIED', 'TRUSTED', 'PARTNER']

// ─── Sub-components ──────────────────────────────────────────────────────

function StarRating({ rating, size = 'sm' }: { rating: number; size?: 'sm' | 'md' | 'lg' }) {
  const cls = size === 'lg' ? 'h-5 w-5' : size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5'
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn(cls, i < Math.round(rating) ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground/25')}
        />
      ))}
    </div>
  )
}

function ScoreMeter({ score, tier }: { score: number; tier: string }) {
  const pct = Math.min((score / 1000) * 100, 100)
  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between">
        <span className="text-xs text-muted-foreground uppercase tracking-wide">Reputation</span>
        <span className="text-3xl font-bold text-foreground tabular-nums">{score.toLocaleString()}</span>
      </div>
      <div className="relative h-2 overflow-hidden rounded-full bg-muted">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-violet-500 to-indigo-500"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 1, ease: 'easeOut', delay: 0.3 }}
        />
      </div>
      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span>0</span>
        <span>1000 / max</span>
      </div>
    </div>
  )
}

function TierProgress({ currentTier }: { currentTier: string }) {
  const currentIdx = TIER_PROGRESSION.indexOf(currentTier)
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Trust Tier Progress</p>
      <div className="flex items-center gap-1">
        {TIER_PROGRESSION.map((tier, idx) => {
          const meta = TIER_META[tier]
          const done = idx <= currentIdx
          const isCurrent = idx === currentIdx
          return (
            <div key={tier} className="flex flex-1 flex-col items-center gap-1">
              <div
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full text-sm transition-all',
                  done
                    ? isCurrent
                      ? 'bg-primary text-primary-foreground ring-2 ring-primary/30'
                      : 'bg-primary/20 text-primary'
                    : 'bg-muted text-muted-foreground/50',
                )}
              >
                {meta.icon}
              </div>
              <span className={cn(
                'text-[10px] font-medium',
                isCurrent ? 'text-foreground' : done ? 'text-muted-foreground' : 'text-muted-foreground/40',
              )}>
                {meta.label}
              </span>
              {idx < TIER_PROGRESSION.length - 1 && (
                <div className={cn('absolute hidden')} />
              )}
            </div>
          )
        })}
      </div>
      {/* connector line */}
      <div className="relative -mt-10 mb-4 flex px-3.5 pointer-events-none" aria-hidden>
        {TIER_PROGRESSION.slice(0, -1).map((tier, idx) => {
          const done = idx < currentIdx
          return (
            <div key={tier} className="flex-1">
              <div className={cn('mt-3.5 h-0.5 rounded-full transition-colors', done ? 'bg-primary/40' : 'bg-muted')} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ProfileSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <div className="h-52 skeleton" />
      <div className="mx-auto max-w-4xl px-4 -mt-10 pb-16">
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <div className="space-y-4">
            <div className="skeleton h-64 rounded-2xl" />
            <div className="skeleton h-48 rounded-2xl" />
          </div>
          <div className="space-y-6">
            <div className="skeleton h-40 rounded-2xl" />
            <div className="skeleton h-32 rounded-2xl" />
            <div className="grid grid-cols-2 gap-4">
              <div className="skeleton h-48 rounded-2xl" />
              <div className="skeleton h-48 rounded-2xl" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function NotFoundState() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
        <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-muted">
          <Users className="h-10 w-10 text-muted-foreground" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">Organizer not found</h1>
        <p className="mt-2 text-muted-foreground">This wallet address doesn&apos;t belong to a registered organizer.</p>
        <Link href="/leaderboard">
          <Button variant="gradient" className="mt-6">
            Browse organizers
          </Button>
        </Link>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────

export default function OrganizerProfilePage() {
  const params = useParams()
  const walletAddress = params.walletAddress as string
  const { isAuthenticated, wallet } = useAuthStore()

  const { data: organizer, isLoading, isError } = useQuery<OrganizerProfile>({
    queryKey: ['organizer', walletAddress],
    queryFn: () => api.get(`/organizers/${walletAddress}`),
    retry: 1,
  })

  const { data: eventsData, isLoading: eventsLoading } = useQuery<{ upcoming: any[]; past: any[] }>({
    queryKey: ['organizer-events', walletAddress],
    queryFn: () => api.get(`/organizers/${walletAddress}/events`),
    enabled: !!organizer,
  })

  if (isLoading) return <ProfileSkeleton />
  if (isError || !organizer) return <NotFoundState />

  const tier = TIER_META[organizer.trustTier] ?? TIER_META.NEW
  const tierColor = getTrustTierColor(organizer.trustTier)
  const successRate = organizer.totalEventsHosted > 0
    ? Math.round((organizer.successfulEvents / organizer.totalEventsHosted) * 100)
    : 0
  const upcomingEvents = eventsData?.upcoming ?? organizer.events?.upcoming ?? []
  const pastEvents = eventsData?.past ?? organizer.events?.past ?? []
  const isOwnProfile = wallet === walletAddress

  const STATS = [
    { label: 'Events', value: organizer.totalEventsHosted, icon: Calendar, color: 'text-violet-400', bg: 'bg-violet-500/10' },
    { label: 'Attendees', value: organizer.totalAttendeesServed.toLocaleString(), icon: Users, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { label: 'Success Rate', value: `${successRate}%`, icon: TrendingUp, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    { label: 'Avg Rating', value: Number(organizer.averageRating).toFixed(1), icon: Star, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  ]

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero banner */}
      <div className="relative overflow-hidden">
        {/* Gradient banner */}
        <div className="h-52 bg-gradient-to-br from-violet-700 via-indigo-700 to-purple-800 relative">
          <div
            className="absolute inset-0 opacity-30"
            style={{
              backgroundImage:
                'radial-gradient(at 30% 40%, rgba(139,92,246,0.6) 0px, transparent 50%), radial-gradient(at 70% 60%, rgba(79,70,229,0.5) 0px, transparent 50%)',
            }}
          />
          {/* Grid overlay */}
          <div
            className="absolute inset-0 opacity-[0.06]"
            style={{
              backgroundImage:
                'linear-gradient(rgba(255,255,255,0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.2) 1px, transparent 1px)',
              backgroundSize: '40px 40px',
            }}
          />
        </div>

        {/* Profile overlay */}
        <div className="mx-auto max-w-4xl px-4">
          <div className="relative -mt-16 pb-6 flex flex-col md:flex-row md:items-end gap-5">
            {/* Avatar */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="h-28 w-28 flex-shrink-0 rounded-2xl border-4 border-background bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-4xl font-bold shadow-xl"
            >
              {organizer.displayName ? organizer.displayName.charAt(0).toUpperCase() : walletAddress.charAt(0).toUpperCase()}
            </motion.div>

            {/* Name & meta */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.4 }}
              className="flex-1 min-w-0"
            >
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold text-foreground">
                  {organizer.displayName ?? truncateWallet(walletAddress)}
                </h1>
                {organizer.verificationStatus === 'VERIFIED' && (
                  <CheckCircle2 className="h-5 w-5 text-blue-400 flex-shrink-0" />
                )}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold',
                  tierColor,
                )}>
                  {tier.icon} {tier.label} Organizer
                </span>

                {organizer.twitterHandle && (
                  <a
                    href={`https://twitter.com/${organizer.twitterHandle}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-sm text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all"
                  >
                    <Twitter className="h-3.5 w-3.5" />
                    @{organizer.twitterHandle}
                  </a>
                )}

                {organizer.website && (
                  <a
                    href={organizer.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-sm text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all"
                  >
                    <Globe className="h-3.5 w-3.5" />
                    Website
                  </a>
                )}

                <a
                  href={`https://stellar.expert/explorer/testnet/account/${walletAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1 font-mono text-xs text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all"
                >
                  {truncateWallet(walletAddress)}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </motion.div>

            {/* Actions */}
            <motion.div
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 }}
              className="flex items-center gap-2 flex-shrink-0"
            >
              {!isOwnProfile && isAuthenticated && (
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Heart className="h-4 w-4" />
                  Follow
                </Button>
              )}
              {isOwnProfile && (
                <Link href="/user/settings">
                  <Button variant="outline" size="sm">Edit Profile</Button>
                </Link>
              )}
            </motion.div>
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="border-y border-border bg-card">
        <div className="mx-auto max-w-4xl px-4">
          <div className="grid grid-cols-4 divide-x divide-border">
            {STATS.map(({ label, value, icon: Icon, color, bg }, i) => (
              <motion.div
                key={label}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + i * 0.05 }}
                className="flex flex-col items-center gap-1.5 py-4 px-2 text-center"
              >
                <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg', bg)}>
                  <Icon className={cn('h-4 w-4', color)} />
                </div>
                <div className="text-xl font-bold text-foreground tabular-nums">{value}</div>
                <div className="text-xs text-muted-foreground">{label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="mx-auto max-w-4xl px-4 py-8 pb-20">
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">

          {/* ── Sidebar ── */}
          <div className="space-y-4">

            {/* Reputation card */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="rounded-2xl border border-border bg-card p-5"
            >
              <ScoreMeter score={organizer.reputationScore} tier={organizer.trustTier} />
              <div className="mt-5">
                <TierProgress currentTier={organizer.trustTier} />
              </div>
            </motion.div>

            {/* Staking status */}
            {(organizer.stakedAmount || organizer.stakeTier) && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="rounded-2xl border border-border bg-card p-5"
              >
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Coins className="h-4 w-4 text-primary" /> Staking Status
                </h3>
                <div className="space-y-2">
                  {organizer.stakedAmount && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Staked Amount</span>
                      <span className="font-semibold text-foreground tabular-nums">
                        {formatXLM(organizer.stakedAmount)} XLM
                      </span>
                    </div>
                  )}
                  {organizer.stakeTier && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Stake Tier</span>
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', getTrustTierColor(organizer.stakeTier))}>
                        {organizer.stakeTier}
                      </span>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* Trust & accountability */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
              className="rounded-2xl border border-border bg-card p-5"
            >
              <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
                <Shield className="h-4 w-4 text-primary" /> Trust & Accountability
              </h3>
              <div className="space-y-2.5 text-sm text-muted-foreground">
                {[
                  'Stake locked in on-chain escrow for each event',
                  '72-hour dispute window after events',
                  'Rating history from verified attendees',
                  ...(organizer.verificationStatus === 'VERIFIED' ? ['Identity verified by Steluma'] : []),
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <CheckCircle2 className={cn(
                      'mt-0.5 h-4 w-4 flex-shrink-0',
                      i === 3 ? 'text-blue-400' : 'text-emerald-400',
                    )} />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>

          {/* ── Main content ── */}
          <div className="space-y-8">

            {/* Bio */}
            {organizer.bio && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.28 }}
              >
                <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-foreground">
                  <BarChart3 className="h-5 w-5 text-primary" /> About
                </h2>
                <div className="rounded-2xl border border-border bg-card p-5">
                  <p className="text-muted-foreground leading-relaxed">{organizer.bio}</p>
                </div>
              </motion.div>
            )}

            {/* Upcoming events */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
                <Calendar className="h-5 w-5 text-primary" /> Upcoming Events
              </h2>

              {eventsLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <EventCardSkeleton key={i} variant="compact" />
                  ))}
                </div>
              ) : upcomingEvents.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
                  <Calendar className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">No upcoming events scheduled</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {upcomingEvents.map((event: any, i: number) => (
                    <EventCard key={event.id} event={event} index={i} variant="compact" />
                  ))}
                </div>
              )}
            </motion.div>

            {/* Ratings */}
            {organizer.ratingCount > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 }}
              >
                <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
                  <Star className="h-5 w-5 text-primary" /> Attendee Ratings
                </h2>
                <div className="rounded-2xl border border-border bg-card p-6">
                  <div className="flex items-center gap-8">
                    {/* Score */}
                    <div className="text-center shrink-0">
                      <div className="text-6xl font-bold text-foreground tabular-nums">
                        {Number(organizer.averageRating).toFixed(1)}
                      </div>
                      <div className="mt-2 flex justify-center">
                        <StarRating rating={organizer.averageRating} size="md" />
                      </div>
                      <div className="mt-1.5 text-sm text-muted-foreground">
                        {organizer.ratingCount.toLocaleString()} {organizer.ratingCount === 1 ? 'review' : 'reviews'}
                      </div>
                    </div>

                    {/* Bar breakdown */}
                    <div className="flex-1 space-y-2">
                      {[5, 4, 3, 2, 1].map((star) => {
                        const isMain = star === Math.round(organizer.averageRating)
                        const approxPct = isMain ? 65 : star === Math.round(organizer.averageRating) - 1 ? 20 : Math.max(5, Math.random() * 15)
                        return (
                          <div key={star} className="flex items-center gap-2.5">
                            <span className="w-4 text-right text-xs text-muted-foreground">{star}</span>
                            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400 flex-shrink-0" />
                            <div className="flex-1 h-2 overflow-hidden rounded-full bg-muted">
                              <motion.div
                                className="h-full rounded-full bg-yellow-400"
                                initial={{ width: 0 }}
                                animate={{ width: `${approxPct}%` }}
                                transition={{ duration: 0.8, ease: 'easeOut', delay: 0.4 + (5 - star) * 0.05 }}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Past events */}
            {pastEvents.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
              >
                <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
                  <Award className="h-5 w-5 text-primary" /> Past Events
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {pastEvents.slice(0, 6).map((event: any, i: number) => (
                    <EventCard key={event.id} event={event} index={i} />
                  ))}
                </div>
                {pastEvents.length > 6 && (
                  <div className="mt-4 text-center">
                    <button className="rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all">
                      View all {pastEvents.length} past events
                    </button>
                  </div>
                )}
              </motion.div>
            )}

            {/* Revenue summary */}
            {organizer.totalRevenue && Number(organizer.totalRevenue) > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.45 }}
                className="rounded-2xl border border-border bg-card p-5"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
                    <TrendingUp className="h-5 w-5 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Revenue Generated</p>
                    <p className="text-xl font-bold text-foreground tabular-nums">
                      {formatXLM(organizer.totalRevenue)}{' '}
                      <span className="text-sm font-normal text-muted-foreground">XLM</span>
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
