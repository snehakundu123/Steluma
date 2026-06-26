'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Award, Search, Users, Hash, CalendarDays, X, Shield, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { Navbar } from '@/components/layout/navbar'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { formatDate, getCategoryEmoji, cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import {
  getOwnerBadges,
  hasBadge,
  CONTRACT_IDS,
  type BadgeType,
} from '@/lib/soroban'
import { readContractFunction } from '@/lib/contract'

// ── Types ─────────────────────────────────────────────────────────────────────

type BadgeItem = {
  id: string
  eventSlug: string
  eventTitle: string
  eventDate: string
  category: string
  organizerName: string | null
  totalMinted: number
  imageUrl?: string
  color?: string
}

type BadgesResponse = {
  data: BadgeItem[]
  stats: {
    totalBadges: number
    uniqueEvents: number
    totalAttendees: number
  }
}

const CATEGORIES = [
  'All',
  'CONFERENCE',
  'CONCERT',
  'HACKATHON',
  'WORKSHOP',
  'NETWORKING',
  'FESTIVAL',
  'SPORTS',
  'WEBINAR',
  'COMMUNITY',
  'OTHER',
]

const CATEGORY_LABELS: Record<string, string> = {
  All: 'All',
  CONFERENCE: 'Conferences',
  CONCERT: 'Concerts',
  HACKATHON: 'Hackathons',
  WORKSHOP: 'Workshops',
  NETWORKING: 'Networking',
  FESTIVAL: 'Festivals',
  SPORTS: 'Sports',
  WEBINAR: 'Webinars',
  COMMUNITY: 'Community',
  OTHER: 'Other',
}

// Deterministic gradient per badge based on id
const BADGE_GRADIENTS = [
  'from-violet-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
  'from-orange-500 to-rose-600',
  'from-blue-500 to-cyan-600',
  'from-pink-500 to-fuchsia-600',
  'from-amber-500 to-yellow-600',
]

function getBadgeGradient(id: string) {
  const code = id.charCodeAt(0) + (id.charCodeAt(id.length - 1) ?? 0)
  return BADGE_GRADIENTS[code % BADGE_GRADIENTS.length]
}

// ── Hex Badge Card ────────────────────────────────────────────────────────────

function BadgeCard({ badge, index }: { badge: BadgeItem; index: number }) {
  const gradient = getBadgeGradient(badge.id)

  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 20, scale: 0.95 },
        show: { opacity: 1, y: 0, scale: 1 },
      }}
    >
      <Link href={`/events/${badge.eventSlug}`}>
        <div className="group rounded-2xl border border-border bg-card shadow-xs hover:shadow-md hover:-translate-y-1 hover:border-primary/20 transition-all duration-200">
          {/* Hexagonal badge graphic */}
          <div className="flex justify-center pt-6 pb-2">
            <div className="relative">
              {/* Hex shape via clip-path */}
              <div
                className={cn(
                  'h-24 w-24 bg-gradient-to-br flex items-center justify-center text-white',
                  gradient,
                )}
                style={{ clipPath: 'polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)' }}
              >
                {badge.imageUrl ? (
                  <img src={badge.imageUrl} alt="" className="h-full w-full object-cover" style={{ clipPath: 'polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)' }} />
                ) : (
                  <span className="text-3xl select-none">{getCategoryEmoji(badge.category)}</span>
                )}
              </div>
              {/* Minted count bubble */}
              <div className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-background bg-primary text-xs font-bold text-primary-foreground shadow-sm">
                {badge.totalMinted > 99 ? '99+' : badge.totalMinted}
              </div>
            </div>
          </div>

          {/* Info */}
          <div className="px-4 pb-5 pt-3 text-center">
            <h3 className="font-semibold text-sm text-foreground line-clamp-2 leading-snug group-hover:text-primary transition-colors">
              {badge.eventTitle}
            </h3>
            {badge.organizerName && (
              <p className="mt-0.5 text-xs text-muted-foreground truncate">by {badge.organizerName}</p>
            )}

            <div className="mt-3 flex items-center justify-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <CalendarDays className="h-3 w-3" />
                {formatDate(badge.eventDate)}
              </span>
            </div>

            {/* Hover reveal */}
            <div className="mt-2 overflow-hidden max-h-0 group-hover:max-h-8 transition-all duration-200">
              <p className="text-xs font-medium text-primary">
                {badge.totalMinted} {badge.totalMinted === 1 ? 'person' : 'people'} attended
              </p>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function BadgeSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-xs">
      <div className="flex justify-center mb-3">
        <div className="skeleton h-24 w-24 rounded-full" />
      </div>
      <div className="skeleton h-4 w-3/4 mx-auto rounded mb-2" />
      <div className="skeleton h-3 w-1/2 mx-auto rounded" />
    </div>
  )
}

// ── On-chain badge verification panel ────────────────────────────────────────

function OnChainVerification() {
  const { wallet } = useAuthStore()
  const [checking, setChecking] = useState(false)
  const [onChainCount, setOnChainCount] = useState<number | null>(null)
  const [checkError, setCheckError] = useState<string | null>(null)

  // Read total badge supply directly from the AttendanceBadge contract via readContractFunction
  const { data: totalBadgesOnChain } = useQuery({
    queryKey: ['contract-badge-count', wallet],
    queryFn: () =>
      readContractFunction(CONTRACT_IDS.attendanceBadge, 'badge_count', [], wallet!),
    enabled: !!wallet,
    staleTime: 60_000,
  })

  async function checkOnChain() {
    if (!wallet) return
    setChecking(true)
    setCheckError(null)
    try {
      // Call AttendanceBadge.get_owner_badges via @stellar/stellar-sdk Contract + TransactionBuilder
      const ids = await getOwnerBadges(wallet, wallet)
      setOnChainCount(ids.length)
    } catch (err: any) {
      setCheckError(err.message ?? 'On-chain query failed')
    } finally {
      setChecking(false)
    }
  }

  if (!wallet) return null

  return (
    <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50 p-4">
      <div className="flex items-center gap-2 mb-2">
        <Shield className="h-4 w-4 text-violet-600" />
        <span className="text-sm font-semibold text-violet-800">On-chain verification</span>
        <a
          href={`https://stellar.expert/explorer/testnet/contract/${CONTRACT_IDS.attendanceBadge}`}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto text-xs text-violet-500 hover:text-violet-700 flex items-center gap-1"
        >
          <ExternalLink className="h-3 w-3" />
          View contract
        </a>
      </div>
      <p className="text-xs text-violet-600 mb-3">
        Query the AttendanceBadge smart contract directly to verify your soulbound badges on-chain.
        {totalBadgesOnChain !== null && totalBadgesOnChain !== undefined && (
          <span className="ml-1 font-medium">
            ({String(totalBadgesOnChain)} total badges minted on-chain)
          </span>
        )}
      </p>
      <Button
        size="sm"
        variant="outline"
        onClick={checkOnChain}
        disabled={checking}
        className="border-violet-300 text-violet-700 hover:bg-violet-100"
      >
        {checking ? 'Querying Stellar…' : 'Verify my badges on-chain'}
      </Button>
      {onChainCount !== null && (
        <p className="mt-2 text-sm font-medium text-violet-800">
          {onChainCount === 0
            ? 'No badges found on-chain for your wallet.'
            : `${onChainCount} badge${onChainCount !== 1 ? 's' : ''} verified on Stellar testnet.`}
        </p>
      )}
      {checkError && (
        <p className="mt-2 text-xs text-red-500">{checkError}</p>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function BadgesPage() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')

  const params = new URLSearchParams()
  if (query) params.set('q', query)
  if (category !== 'All') params.set('category', category)
  const qs = params.toString()

  const { data, isLoading } = useQuery({
    queryKey: ['badges', query, category],
    queryFn: () => api.get<BadgesResponse>(`/badges${qs ? `?${qs}` : ''}`),
    staleTime: 30_000,
  })

  const badges = data?.data ?? []
  const stats = data?.stats

  return (
    <div className="min-h-screen bg-surface-subtle">
      <Navbar />

      {/* Hero header */}
      <div className="border-b border-border bg-background">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-md shadow-violet-500/25">
                  <Award className="h-6 w-6 text-white" />
                </div>
                <h1 className="text-3xl font-bold text-foreground">Attendance Badges</h1>
              </div>
              <p className="text-muted-foreground max-w-lg">
                Soulbound NFT badges minted on Stellar for every event. Collect them to build your on-chain attendance history.
              </p>
            </div>

            {/* Global stats */}
            {stats && (
              <div className="flex gap-6 shrink-0">
                {[
                  { label: 'Badges Minted', value: stats.totalBadges.toLocaleString(), icon: Award },
                  { label: 'Events', value: stats.uniqueEvents.toLocaleString(), icon: Hash },
                  { label: 'Attendees', value: stats.totalAttendees.toLocaleString(), icon: Users },
                ].map((s) => (
                  <div key={s.label} className="text-center">
                    <s.icon className="mx-auto mb-1 h-4 w-4 text-primary" />
                    <div className="text-2xl font-bold tabular-nums text-foreground">{s.value}</div>
                    <div className="text-xs text-muted-foreground">{s.label}</div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>

          <OnChainVerification />

          {/* Search + filter */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center"
          >
            {/* Search */}
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search events or organizers…"
                className="w-full rounded-xl border border-input bg-background py-2.5 pl-10 pr-9 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Category pills */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={cn(
                    'whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-all',
                    category === cat
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  )}
                >
                  {cat !== 'All' && getCategoryEmoji(cat) + ' '}
                  {CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>
          </motion.div>
        </div>
      </div>

      {/* Badge grid */}
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
        {isLoading ? (
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {Array.from({ length: 15 }).map((_, i) => <BadgeSkeleton key={i} />)}
          </div>
        ) : badges.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="py-24 text-center"
          >
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-muted">
              <Award className="h-10 w-10 text-muted-foreground/50" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">No badges found</h2>
            <p className="text-sm text-muted-foreground mb-6">
              {query || category !== 'All'
                ? 'Try adjusting your search or filter'
                : 'No badges have been minted yet. Attend events to earn yours!'}
            </p>
            {(query || category !== 'All') && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setQuery(''); setCategory('All') }}
                className="gap-1.5"
              >
                <X className="h-3.5 w-3.5" />
                Clear filters
              </Button>
            )}
          </motion.div>
        ) : (
          <>
            <motion.div
              className="grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
              variants={{
                hidden: {},
                show: { transition: { staggerChildren: 0.05 } },
              }}
              initial="hidden"
              animate="show"
            >
              <AnimatePresence>
                {badges.map((badge, i) => (
                  <BadgeCard key={badge.id} badge={badge} index={i} />
                ))}
              </AnimatePresence>
            </motion.div>

            <p className="mt-8 text-center text-xs text-muted-foreground">
              Showing {badges.length} badge{badges.length !== 1 ? 's' : ''}
              {query && ` for "${query}"`}
              {category !== 'All' && ` in ${CATEGORY_LABELS[category]}`}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
