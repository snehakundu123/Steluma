'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Store, Search, TrendingUp, Tag, Shield, Star, Calendar,
  MapPin, CheckCircle2, ArrowUpRight, Filter, X, Ticket,
  Users, Zap,
} from 'lucide-react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Navbar } from '@/components/layout/navbar'
import { useAuthStore } from '@/store/auth.store'
import { formatDate, formatXLM, getTrustTierColor, getCategoryEmoji, cn } from '@/lib/utils'
import toast from 'react-hot-toast'

const SORT_OPTIONS = [
  { value: 'recent', label: 'Most Recent' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'event_date', label: 'Event Date' },
]

function ListingCard({ listing, index }: { listing: any; index: number }) {
  const { isAuthenticated, connect } = useAuthStore()
  const queryClient = useQueryClient()

  const purchase = useMutation({
    mutationFn: () => api.post(`/marketplace/${listing.id}/buy`, {}),
    onSuccess: () => {
      toast.success('Ticket purchased from marketplace!')
      queryClient.invalidateQueries({ queryKey: ['marketplace'] })
    },
    onError: (err: any) => toast.error(err.message ?? 'Purchase failed'),
  })

  const royaltyPercent = listing.royaltyBps ? listing.royaltyBps / 100 : 5
  const originalPrice = listing.originalPrice ?? 0
  const currentPrice = Number(listing.price)
  const priceChange = originalPrice > 0
    ? ((currentPrice - originalPrice) / originalPrice) * 100
    : null

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.3 }}
      className="group rounded-2xl border border-border bg-card shadow-xs hover:border-primary/20 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
    >
      {/* Event banner */}
      <div className="relative h-40 overflow-hidden rounded-t-2xl bg-gradient-to-br from-violet-500 to-indigo-700">
        {listing.event?.bannerUrl && (
          <img src={listing.event.bannerUrl} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />

        <div className="absolute left-3 top-3 flex gap-1.5">
          <span className="rounded-full bg-black/40 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-md">
            {getCategoryEmoji(listing.event?.category ?? 'OTHER')} {listing.event?.category ?? 'Event'}
          </span>
        </div>

        {listing.isVerifiedOwner && (
          <div className="absolute right-3 top-3">
            <span className="flex items-center gap-1 rounded-full bg-emerald-500/90 px-2.5 py-1 text-xs font-semibold text-white">
              <CheckCircle2 className="h-3 w-3" /> Verified
            </span>
          </div>
        )}

        <div className="absolute bottom-3 left-3">
          <span className="rounded-full bg-black/40 px-2.5 py-1 text-xs text-white backdrop-blur-md flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {listing.event?.startsAt ? formatDate(listing.event.startsAt) : ''}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="font-semibold text-foreground line-clamp-1 text-sm mb-1 group-hover:text-primary transition-colors">
          {listing.event?.title ?? 'Event Ticket'}
        </h3>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
          {listing.event?.locationCity && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />{listing.event.locationCity}
            </span>
          )}
          <span className="font-medium text-foreground">{listing.tier?.name ?? 'General'}</span>
        </div>

        {/* Price */}
        <div className="flex items-end justify-between mb-4">
          <div>
            <p className="text-2xs text-muted-foreground uppercase tracking-wide mb-0.5">Resale Price</p>
            <p className="text-xl font-bold text-foreground tabular-nums">
              {formatXLM(listing.price)} <span className="text-sm font-normal text-muted-foreground">XLM</span>
            </p>
            {priceChange !== null && (
              <p className={cn(
                'text-xs font-medium mt-0.5',
                priceChange > 0 ? 'text-red-500' : 'text-emerald-600',
              )}>
                {priceChange > 0 ? '+' : ''}{priceChange.toFixed(0)}% vs original
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-2xs text-muted-foreground">Royalty</p>
            <p className="text-xs font-semibold text-violet-600">{royaltyPercent}% to organizer</p>
          </div>
        </div>

        {/* Seller info */}
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2">
          <Avatar className="h-6 w-6">
            <AvatarImage src={listing.seller?.avatarUrl} />
            <AvatarFallback className="bg-gradient-brand text-white text-2xs">
              {(listing.seller?.displayName ?? 'S').slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="text-xs text-muted-foreground flex-1 min-w-0 truncate">
            {listing.seller?.displayName ?? 'Anonymous seller'}
          </span>
          {listing.seller?.rating && (
            <span className="flex items-center gap-1 text-xs text-amber-500 shrink-0">
              <Star className="h-3 w-3 fill-amber-400" />
              {listing.seller.rating.toFixed(1)}
            </span>
          )}
        </div>

        <Button
          className="w-full gap-2 h-9 text-sm font-semibold"
          variant={isAuthenticated ? 'gradient' : 'outline'}
          disabled={purchase.isPending}
          onClick={async () => {
            if (!isAuthenticated) { await connect(); return }
            purchase.mutate()
          }}
        >
          {purchase.isPending ? (
            <><div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />Purchasing…</>
          ) : (
            <><Ticket className="h-3.5 w-3.5" />Buy Ticket</>
          )}
        </Button>
      </div>
    </motion.div>
  )
}

function ListingCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="skeleton h-40" />
      <div className="p-4 space-y-3">
        <div className="skeleton h-4 w-5/6 rounded" />
        <div className="skeleton h-3 w-1/2 rounded" />
        <div className="skeleton h-7 w-1/3 rounded" />
        <div className="skeleton h-10 w-full rounded-xl" />
      </div>
    </div>
  )
}

export default function MarketplacePage() {
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('recent')
  const [category, setCategory] = useState('All')

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['marketplace', search, sort, category],
    queryFn: () => {
      const params = new URLSearchParams({
        sort,
        limit: '24',
        ...(search && { q: search }),
        ...(category !== 'All' && { category }),
      })
      return api.get<{ data: any[]; meta: { total: number } }>(`/marketplace?${params}`)
    },
    placeholderData: (prev) => prev,
  })

  const listings = data?.data ?? []
  const total = data?.meta?.total ?? 0

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-background">
        {/* Header */}
        <div className="border-b border-border bg-background">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8">
            <div className="mb-6">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
                <Store className="h-4 w-4" />
                Resale Marketplace
              </div>
              <h1 className="text-2xl font-bold sm:text-3xl">Ticket Marketplace</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {isLoading ? 'Loading…' : `${total.toLocaleString()} tickets available for resale`}
              </p>
            </div>

            {/* Info banner */}
            <div className="mb-6 flex items-start gap-3 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 dark:border-violet-800 dark:bg-violet-950/20">
              <Shield className="h-5 w-5 flex-shrink-0 text-violet-600 dark:text-violet-400 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-violet-700 dark:text-violet-300">Safe resale with on-chain royalties</p>
                <p className="text-xs text-violet-600/80 dark:text-violet-400/80 mt-0.5">
                  All sales are verified on Stellar blockchain. Organizers receive a royalty on every resale — creating fair, transparent secondary markets.
                </p>
              </div>
            </div>

            {/* Search */}
            <div className="relative mb-4">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search events, ticket types…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border border-border bg-background py-3 pl-11 pr-4 text-sm placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Sort */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <span className="text-xs text-muted-foreground shrink-0">Sort by:</span>
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setSort(opt.value)}
                  className={cn(
                    'flex-shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all',
                    sort === opt.value
                      ? 'bg-foreground text-background'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80',
                  )}
                >
                  {opt.label}
                </button>
              ))}
              {isFetching && !isLoading && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0 ml-auto">
                  <div className="h-1.5 w-1.5 animate-live-pulse rounded-full bg-primary" />
                  Updating
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Grid */}
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8">
          <AnimatePresence mode="wait">
            {isLoading ? (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => <ListingCardSkeleton key={i} />)}
              </motion.div>
            ) : listings.length === 0 ? (
              <motion.div key="empty" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="py-24 text-center">
                <div className="mb-4 text-5xl">🏪</div>
                <h3 className="text-xl font-semibold">No listings yet</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {search ? `No tickets matching "${search}"` : 'No tickets are listed for resale right now'}
                </p>
                <Link href="/events">
                  <Button className="mt-6 gap-2" variant="outline">Browse Primary Market</Button>
                </Link>
              </motion.div>
            ) : (
              <motion.div key="results" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {listings.map((listing: any, i: number) => (
                  <ListingCard key={listing.id} listing={listing} index={i} />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </>
  )
}
