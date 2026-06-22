'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { Calendar, MapPin, Users, TrendingUp, Lock, Clock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn, formatDate, formatXLM, getCategoryEmoji, getTrustTierColor } from '@/lib/utils'

interface EventCardProps {
  event: {
    id: string
    slug: string
    title: string
    bannerUrl?: string | null
    startsAt: string
    locationCity?: string | null
    locationCountry?: string | null
    isOnline?: boolean
    category: string
    ticketsSold: number
    totalTickets: number
    priceFrom?: string | null
    priceAsset?: string
    status?: string
    organizer?: {
      trustTier: string
      user?: { displayName?: string | null } | null
      walletAddress: string
    } | null
  }
  index?: number
  variant?: 'default' | 'featured' | 'compact'
}

const CATEGORY_GRADIENTS: Record<string, string> = {
  CONFERENCE: 'from-blue-500 via-indigo-600 to-violet-700',
  CONCERT: 'from-pink-500 via-rose-600 to-red-700',
  HACKATHON: 'from-emerald-500 via-teal-600 to-cyan-700',
  WORKSHOP: 'from-amber-500 via-orange-600 to-red-600',
  NETWORKING: 'from-violet-500 via-purple-600 to-indigo-700',
  WEBINAR: 'from-sky-500 via-blue-600 to-indigo-700',
  FESTIVAL: 'from-yellow-500 via-orange-500 to-pink-600',
  SPORTS: 'from-green-500 via-emerald-600 to-teal-700',
  OTHER: 'from-slate-500 via-gray-600 to-zinc-700',
}

function SoldOutOverlay() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-[2px]">
      <span className="rounded-full bg-white/20 px-4 py-1.5 text-sm font-bold text-white backdrop-blur-md border border-white/30">
        Sold Out
      </span>
    </div>
  )
}

export function EventCard({ event, index = 0, variant = 'default' }: EventCardProps) {
  const soldPercent = event.totalTickets > 0
    ? Math.round((event.ticketsSold / event.totalTickets) * 100)
    : 0
  const isSoldOut = soldPercent >= 100 || event.status === 'SOLD_OUT'
  const isCancelled = event.status === 'CANCELLED'
  const isAlmostSoldOut = soldPercent >= 80 && !isSoldOut
  const gradientClass = CATEGORY_GRADIENTS[event.category] ?? CATEGORY_GRADIENTS.OTHER
  const tierColor = getTrustTierColor(event.organizer?.trustTier ?? 'NEW')

  if (variant === 'compact') {
    return (
      <Link href={`/events/${event.slug}`}>
        <div className={cn(
          'group flex items-center gap-4 rounded-2xl border border-border bg-card p-4 transition-all duration-200',
          'hover:border-primary/30 hover:shadow-md hover:-translate-y-0.5',
        )}>
          <div className={cn(
            'h-14 w-14 flex-shrink-0 rounded-xl bg-gradient-to-br',
            gradientClass,
            'flex items-center justify-center text-2xl shadow-sm',
          )}>
            {event.bannerUrl ? (
              <img src={event.bannerUrl} alt="" className="h-full w-full rounded-xl object-cover" />
            ) : (
              getCategoryEmoji(event.category)
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-foreground line-clamp-1 group-hover:text-primary transition-colors">
              {event.title}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{formatDate(event.startsAt)}</p>
          </div>
          <div className="text-right shrink-0">
            {event.priceFrom && Number(event.priceFrom) > 0 ? (
              <p className="text-sm font-bold text-foreground">{formatXLM(event.priceFrom)} XLM</p>
            ) : (
              <p className="text-sm font-bold text-emerald-600">Free</p>
            )}
          </div>
        </div>
      </Link>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      <Link href={`/events/${event.slug}`} className="group block h-full">
        <div className={cn(
          'relative h-full overflow-hidden rounded-2xl border border-border bg-card',
          'transition-all duration-300',
          'hover:border-primary/20 hover:shadow-lg hover:-translate-y-1',
          isCancelled && 'opacity-60',
        )}>
          {/* Banner */}
          <div className={cn(
            'relative overflow-hidden',
            variant === 'featured' ? 'h-56 sm:h-64' : 'h-44',
          )}>
            {event.bannerUrl ? (
              <img
                src={event.bannerUrl}
                alt={event.title}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
            ) : (
              <div className={cn(
                'h-full w-full bg-gradient-to-br flex items-center justify-center text-5xl',
                gradientClass,
              )}>
                {getCategoryEmoji(event.category)}
              </div>
            )}

            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

            {/* Top badges */}
            <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-full bg-black/40 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-md border border-white/10">
                {getCategoryEmoji(event.category)} {event.category}
              </span>
              {event.organizer?.trustTier && event.organizer.trustTier !== 'NEW' && (
                <span className={cn(
                  'rounded-full px-2.5 py-1 text-xs font-semibold backdrop-blur-md',
                  tierColor,
                )}>
                  {event.organizer.trustTier}
                </span>
              )}
              {isCancelled && (
                <span className="rounded-full bg-red-500/90 px-2.5 py-1 text-xs font-bold text-white">
                  CANCELLED
                </span>
              )}
            </div>

            {/* Sold out / urgency */}
            {isSoldOut && <SoldOutOverlay />}

            {isAlmostSoldOut && (
              <div className="absolute right-3 top-3">
                <span className="flex items-center gap-1 rounded-full bg-orange-500 px-2.5 py-1 text-xs font-bold text-white shadow-sm">
                  <TrendingUp className="h-3 w-3" />
                  {soldPercent}% sold
                </span>
              </div>
            )}

            {/* Date chip at bottom */}
            <div className="absolute bottom-3 left-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-md">
                <Calendar className="h-3 w-3" />
                {formatDate(event.startsAt)}
              </span>
            </div>
          </div>

          {/* Content */}
          <div className="p-4">
            <h3 className={cn(
              'font-semibold text-foreground line-clamp-2 leading-snug transition-colors group-hover:text-primary',
              variant === 'featured' ? 'text-xl' : 'text-base',
            )}>
              {event.title}
            </h3>

            <div className="mt-2 flex flex-col gap-1.5">
              {(event.locationCity || event.isOnline) && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                  {event.isOnline
                    ? 'Online Event'
                    : `${event.locationCity}${event.locationCountry ? `, ${event.locationCountry}` : ''}`}
                </div>
              )}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Users className="h-3.5 w-3.5 flex-shrink-0" />
                {event.ticketsSold} attending
              </div>
            </div>

            {/* Sales progress */}
            {!isSoldOut && event.totalTickets > 0 && (
              <div className="mt-3">
                <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                  <motion.div
                    className={cn(
                      'h-full rounded-full',
                      soldPercent >= 90 ? 'bg-orange-500' :
                      soldPercent >= 70 ? 'bg-amber-500' : 'bg-primary',
                    )}
                    initial={{ width: 0 }}
                    animate={{ width: `${soldPercent}%` }}
                    transition={{ delay: index * 0.05 + 0.3, duration: 0.6, ease: 'easeOut' }}
                  />
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="mt-3 flex items-center justify-between">
              <div>
                {event.priceFrom && Number(event.priceFrom) > 0 ? (
                  <div>
                    <span className="text-2xs text-muted-foreground uppercase tracking-wide">From</span>
                    <p className="text-base font-bold text-foreground tabular-nums">
                      {formatXLM(event.priceFrom)}{' '}
                      <span className="text-xs font-normal text-muted-foreground">
                        {event.priceAsset ?? 'XLM'}
                      </span>
                    </p>
                  </div>
                ) : (
                  <p className="text-base font-bold text-emerald-600 dark:text-emerald-400">Free</p>
                )}
              </div>

              {event.organizer && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <div className="h-5 w-5 rounded-full bg-gradient-brand flex-shrink-0" />
                  <span className="max-w-[80px] truncate">
                    {event.organizer.user?.displayName ??
                      truncateWalletShort(event.organizer.walletAddress)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  )
}

export function EventCardSkeleton({ variant = 'default' }: { variant?: 'default' | 'featured' | 'compact' }) {
  if (variant === 'compact') {
    return (
      <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4">
        <div className="skeleton h-14 w-14 rounded-xl" />
        <div className="flex-1 space-y-2">
          <div className="skeleton h-4 w-3/4 rounded" />
          <div className="skeleton h-3 w-1/2 rounded" />
        </div>
        <div className="skeleton h-5 w-16 rounded" />
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className={cn('skeleton', variant === 'featured' ? 'h-56' : 'h-44')} />
      <div className="p-4 space-y-3">
        <div className="skeleton h-5 w-5/6 rounded" />
        <div className="skeleton h-4 w-3/4 rounded" />
        <div className="space-y-1.5">
          <div className="skeleton h-3 w-1/2 rounded" />
          <div className="skeleton h-3 w-2/5 rounded" />
        </div>
        <div className="skeleton h-1 w-full rounded-full" />
        <div className="flex justify-between items-end">
          <div className="space-y-1">
            <div className="skeleton h-3 w-8 rounded" />
            <div className="skeleton h-6 w-20 rounded" />
          </div>
          <div className="skeleton h-5 w-16 rounded" />
        </div>
      </div>
    </div>
  )
}

function truncateWalletShort(wallet: string) {
  return `${wallet.slice(0, 4)}…${wallet.slice(-4)}`
}
