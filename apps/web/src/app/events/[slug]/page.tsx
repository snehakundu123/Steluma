'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Calendar, MapPin, Users, Share2, Heart, Shield, Star,
  ChevronRight, Clock, Minus, Plus, ArrowLeft, Zap, Award, Globe,
  AlertTriangle, CheckCircle2, XCircle, Ticket, TrendingUp, Lock,
  QrCode, LayoutDashboard, BarChart3, Settings, Scan,
} from 'lucide-react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { signXdr, checkFreighterNetwork, getConnectedWallet } from '@/lib/freighter'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Navbar } from '@/components/layout/navbar'
import { useAuthStore } from '@/store/auth.store'
import {
  formatDate, formatDateTime, formatXLM, getCategoryEmoji,
  getTrustTierColor, truncateWallet, cn,
} from '@/lib/utils'
import toast from 'react-hot-toast'

function TicketTierCard({
  tier, selected, quantity, onSelect, onQuantityChange,
}: {
  tier: any; selected: boolean; quantity: number
  onSelect: () => void; onQuantityChange: (q: number) => void
}) {
  const supply = tier.totalSupply ?? tier.supply ?? 0
  const sold = tier.sold ?? 0
  // `available` is pre-computed by the API; fall back to totalSupply - sold
  const remaining = tier.available ?? (supply - sold)
  const soldPercent = supply > 0 ? Math.round((sold / supply) * 100) : 0
  const isSoldOut = remaining <= 0
  const isAlmost = remaining > 0 && remaining <= 10

  return (
    <div
      onClick={() => !isSoldOut && onSelect()}
      className={cn(
        'relative rounded-2xl border-2 p-5 transition-all duration-200',
        isSoldOut
          ? 'border-border bg-muted/30 cursor-not-allowed opacity-60'
          : selected
            ? 'border-primary bg-primary/5 shadow-violet cursor-pointer'
            : 'border-border bg-card hover:border-primary/30 hover:shadow-md cursor-pointer',
      )}
    >
      {isAlmost && !isSoldOut && (
        <div className="absolute -top-2.5 right-4 rounded-full bg-orange-500 px-2.5 py-0.5 text-xs font-bold text-white shadow-sm">
          Only {remaining} left!
        </div>
      )}

      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <h3 className="font-semibold text-foreground">{tier.name}</h3>
            {isSoldOut && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Sold Out</span>
            )}
          </div>
          {tier.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">{tier.description}</p>
          )}
        </div>
        <div className="text-right shrink-0">
          {!tier.price || Number(tier.price) === 0 ? (
            <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">Free</p>
          ) : (
            <>
              <p className="text-xl font-bold text-foreground tabular-nums">{formatXLM(tier.price)}</p>
              <p className="text-xs text-muted-foreground">{tier.priceAsset ?? 'XLM'}</p>
            </>
          )}
        </div>
      </div>

      {!isSoldOut && supply > 0 && (
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-xs text-muted-foreground">
            <span>{sold} sold</span>
            <span>{remaining} remaining</span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                'h-full rounded-full',
                soldPercent >= 90 ? 'bg-orange-500' : soldPercent >= 70 ? 'bg-amber-500' : 'bg-primary',
              )}
              style={{ width: `${soldPercent}%` }}
            />
          </div>
        </div>
      )}

      {selected && !isSoldOut && (
        <div className="mt-4 flex items-center gap-3 border-t border-border pt-4">
          <span className="text-sm font-medium">Quantity:</span>
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); onQuantityChange(Math.max(1, quantity - 1)) }}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-border hover:bg-muted transition-colors"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="w-8 text-center font-semibold tabular-nums">{quantity}</span>
            <button
              onClick={(e) => { e.stopPropagation(); onQuantityChange(Math.min(10, quantity + 1, Math.max(remaining, 1))) }}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-border hover:bg-muted transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          <span className="ml-auto text-sm font-bold tabular-nums">
            {Number(tier.price) === 0 ? 'Free' : `${formatXLM(Number(tier.price) * quantity)} XLM`}
          </span>
        </div>
      )}
    </div>
  )
}

type PurchaseStep = 'idle' | 'signing' | 'submitting' | 'confirming' | 'done' | 'error'

function PurchasePanel({ event, selectedTier, quantity }: { event: any; selectedTier: any; quantity: number }) {
  const { isAuthenticated, wallet, connect } = useAuthStore()
  const queryClient = useQueryClient()
  const [step, setStep] = useState<PurchaseStep>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [purchasedNum, setPurchasedNum] = useState<number | null>(null)

  const handlePurchase = async () => {
    if (!isAuthenticated || !wallet) { await connect(); return }
    if (!selectedTier) return
    setStep('signing')
    setErrorMsg('')

    try {
      // 0. Verify Freighter is on the right network before doing anything
      const networkErr = await checkFreighterNetwork()
      if (networkErr) {
        setErrorMsg(networkErr)
        setStep('error')
        return
      }

      // Get the CURRENT Freighter wallet (not the cached one — catches account switches)
      const currentWallet = await getConnectedWallet() ?? wallet

      // 1. Initiate — get XDR from backend
      const init = await api.post<{
        purchaseId: string
        transaction: { xdr: string; networkPassphrase: string }
        totalAmount: string
      }>('/tickets/purchase', {
        eventId: event.id,
        tierId: selectedTier.id,
        quantity,
        buyerWallet: currentWallet,
      })

      // 2. Sign with Freighter — pass address so Freighter uses the correct account
      const signedXdr = await signXdr(init.transaction.xdr, init.transaction.networkPassphrase, currentWallet)

      setStep('submitting')

      // 3. Submit to Stellar Horizon
      const horizonUrl = process.env.NEXT_PUBLIC_STELLAR_NETWORK === 'mainnet'
        ? 'https://horizon.stellar.org/transactions'
        : 'https://horizon-testnet.stellar.org/transactions'
      const horizonRes = await fetch(horizonUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ tx: signedXdr }),
      })
      const horizonData = await horizonRes.json() as any
      if (!horizonData.hash) {
        const code = horizonData.extras?.result_codes?.transaction ?? horizonData.title ?? 'tx_failed'
        throw new Error(`Stellar transaction failed: ${code}`)
      }

      setStep('confirming')

      // 4. Confirm with backend (mints NFT async)
      const conf = await api.post<{ tickets: Array<{ id: string; ticketNumber: number }> }>(
        `/tickets/purchase/${init.purchaseId}/confirm`,
        { txHash: horizonData.hash },
      )

      setPurchasedNum(conf.tickets[0]?.ticketNumber ?? null)
      setStep('done')
      queryClient.invalidateQueries({ queryKey: ['event', event.slug] })
      toast.success('Ticket purchased! Your NFT is minting on Stellar…')
    } catch (err: any) {
      const msg = err.message?.includes('declined') || err.message?.includes('User declined')
        ? 'Signing cancelled.'
        : err.message ?? 'Purchase failed. Please try again.'
      setErrorMsg(msg)
      setStep('error')
      toast.error(msg)
    }
  }

  if (step === 'done') {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center dark:border-emerald-900 dark:bg-emerald-950/20"
      >
        <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-emerald-500" />
        <h3 className="text-lg font-semibold text-foreground">
          {purchasedNum ? `Ticket #${purchasedNum} is yours!` : 'Ticket secured!'}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">Your NFT ticket is minting on Stellar…</p>
        <div className="mt-4 flex gap-2">
          <Button className="flex-1 gap-2" variant="outline" onClick={() => { setStep('idle'); setErrorMsg('') }}>
            Buy More
          </Button>
          <Link href="/user" className="flex-1">
            <Button className="w-full gap-2" variant="gradient">
              <Ticket className="h-4 w-4" /> My Tickets
            </Button>
          </Link>
        </div>
      </motion.div>
    )
  }

  const isWorking = step === 'signing' || step === 'submitting' || step === 'confirming'
  const stepLabel: Record<PurchaseStep, string> = {
    idle: '', signing: 'Waiting for Freighter…',
    submitting: 'Submitting to Stellar…', confirming: 'Confirming purchase…',
    done: '', error: '',
  }

  return (
    <div className="space-y-3">
      {selectedTier && (
        <div className="rounded-xl border border-border bg-muted/30 p-4">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{selectedTier.name} × {quantity}</span>
            <span className="font-semibold">
              {Number(selectedTier.price) === 0 ? 'Free' : `${formatXLM(Number(selectedTier.price) * quantity)} XLM`}
            </span>
          </div>
        </div>
      )}

      {step === 'error' && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/20 dark:text-red-400">
          {errorMsg}
        </div>
      )}

      <Button
        className="w-full gap-2 h-12 text-base font-semibold"
        variant={isAuthenticated ? 'gradient' : 'outline'}
        disabled={!selectedTier || isWorking}
        onClick={handlePurchase}
      >
        {isWorking ? (
          <><div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />{stepLabel[step]}</>
        ) : !isAuthenticated ? (
          <><Zap className="h-4 w-4" />Connect Wallet to Purchase</>
        ) : !selectedTier ? (
          <>Select a ticket tier above</>
        ) : (
          <><Ticket className="h-4 w-4" />Get Ticket{quantity > 1 ? `s (${quantity})` : ''}</>
        )}
      </Button>

      <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <Lock className="h-3 w-3" />
        Secured by Stellar blockchain
      </div>
    </div>
  )
}

function OrganizerPanel({ event }: { event: any }) {
  const soldPercent = event.totalTickets > 0
    ? Math.round((event.ticketsSold / event.totalTickets) * 100)
    : 0
  const checkinRate = event.ticketsSold > 0 && event.checkinCount != null
    ? Math.round((event.checkinCount / event.ticketsSold) * 100)
    : null

  return (
    <div className="space-y-4">
      {/* Organizer header card */}
      <div className="rounded-2xl border-2 border-primary/20 bg-primary/5 p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            <LayoutDashboard className="h-4 w-4 text-primary" />
          </div>
          <span className="text-sm font-semibold text-primary">Organizer Controls</span>
          <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            <div className="live-dot" />
            Live
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            {
              label: 'Tickets Sold',
              value: event.ticketsSold?.toLocaleString() ?? '0',
              sub: `of ${event.totalTickets ?? '?'}`,
            },
            {
              label: 'Checked In',
              value: event.checkinCount?.toLocaleString() ?? '0',
              sub: checkinRate != null ? `${checkinRate}% rate` : 'no data',
            },
            {
              label: 'Revenue',
              value: event.revenue ? formatXLM(event.revenue) : '—',
              sub: 'XLM',
            },
          ].map((s) => (
            <div key={s.label} className="rounded-xl bg-background border border-border p-3 text-center">
              <p className="text-lg font-bold text-foreground tabular-nums leading-none">{s.value}</p>
              <p className="text-2xs text-muted-foreground mt-1">{s.sub}</p>
              <p className="text-2xs font-medium text-muted-foreground/70 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Sales progress */}
        {event.totalTickets > 0 && (
          <div className="mb-5">
            <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />{soldPercent}% sold
              </span>
              <span>{(event.totalTickets - event.ticketsSold).toLocaleString()} remaining</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <motion.div
                className={cn(
                  'h-full rounded-full',
                  soldPercent >= 90 ? 'bg-orange-500' : soldPercent >= 70 ? 'bg-amber-500' : 'bg-primary',
                )}
                initial={{ width: 0 }}
                animate={{ width: `${soldPercent}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
              />
            </div>
          </div>
        )}

        {/* Primary action — Scanner */}
        <Link href={`/scanner/${event.id}`}>
          <Button variant="gradient" className="w-full gap-2 h-11 text-sm font-semibold mb-3">
            <Scan className="h-4 w-4" />
            Open Check-in Scanner
          </Button>
        </Link>

        {/* Secondary actions */}
        <div className="grid grid-cols-2 gap-2">
          <Link href={`/events/${event.slug}/manage`}>
            <Button variant="outline" size="sm" className="w-full gap-1.5 h-9 text-xs font-medium">
              <Settings className="h-3.5 w-3.5" /> Manage Event
            </Button>
          </Link>
          <Link href={`/organizer`}>
            <Button variant="outline" size="sm" className="w-full gap-1.5 h-9 text-xs font-medium">
              <BarChart3 className="h-3.5 w-3.5" /> Dashboard
            </Button>
          </Link>
        </div>
      </div>

      {/* Tier breakdown */}
      {event.ticketTiers?.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <h3 className="mb-3 text-sm font-semibold text-foreground">Ticket Tiers</h3>
          <div className="space-y-3">
            {event.ticketTiers.map((tier: any) => {
              const tierSold = tier.sold ?? 0
              const tierTotal = tier.supply ?? 0
              const tierPct = tierTotal > 0 ? Math.round((tierSold / tierTotal) * 100) : 0
              return (
                <div key={tier.id}>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-medium text-foreground">{tier.name}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {tierSold}/{tierTotal} sold
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        tierPct >= 90 ? 'bg-orange-500' : tierPct >= 70 ? 'bg-amber-500' : 'bg-primary',
                      )}
                      style={{ width: `${tierPct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Quick scanner link */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted flex-shrink-0">
            <QrCode className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">QR Check-in</p>
            <p className="text-xs text-muted-foreground">Scan attendee tickets at the door</p>
          </div>
          <Link href={`/scanner/${event.id}`}>
            <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs text-primary">
              Open <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function EventDetailPage() {
  const params = useParams()
  const slug = params.slug as string
  const [selectedTierId, setSelectedTierId] = useState<string | null>(null)
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [liked, setLiked] = useState(false)

  const { wallet } = useAuthStore()

  const { data: event, isLoading, error } = useQuery({
    queryKey: ['event', slug],
    queryFn: () => api.get<any>(`/events/${slug}`),
    retry: 1,
  })

  if (isLoading) {
    return (
      <>
        <Navbar />
        <div className="skeleton h-80" />
        <div className="mx-auto max-w-7xl px-4 sm:px-6 pt-8 space-y-6">
          <div className="skeleton h-10 w-3/4 rounded-xl" />
          <div className="skeleton h-5 w-1/2 rounded" />
          <div className="skeleton h-48 rounded-2xl" />
        </div>
      </>
    )
  }

  if (error || !event) {
    return (
      <>
        <Navbar />
        <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
          <div className="mb-4 text-6xl">🎫</div>
          <h1 className="text-2xl font-bold">Event not found</h1>
          <p className="mt-2 text-muted-foreground">This event doesn't exist or has been removed.</p>
          <Link href="/events">
            <Button className="mt-6 gap-2" variant="outline">
              <ArrowLeft className="h-4 w-4" /> Browse Events
            </Button>
          </Link>
        </div>
      </>
    )
  }

  const selectedTier = event.ticketTiers?.find((t: any) => t.id === selectedTierId) ?? null
  const selectedQty = selectedTierId ? (quantities[selectedTierId] ?? 1) : 1
  const soldPercent = event.totalTickets > 0 ? Math.round((event.ticketsSold / event.totalTickets) * 100) : 0
  const isSoldOut = event.status === 'SOLD_OUT' || soldPercent >= 100
  const isCancelled = event.status === 'CANCELLED'
  const isOrganizer = !!(wallet && event.organizer?.walletAddress === wallet)

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-background pb-20">
        {/* Hero */}
        <div className="relative h-64 sm:h-80 lg:h-96 overflow-hidden bg-gradient-to-br from-violet-600 via-purple-700 to-indigo-800">
          {event.bannerUrl && (
            <img src={event.bannerUrl} alt={event.title} className="h-full w-full object-cover" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

          <Link href="/events" className="absolute left-4 sm:left-6 top-4 flex items-center gap-2 rounded-full bg-black/40 px-3 py-2 text-sm font-medium text-white backdrop-blur-md hover:bg-black/60 transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>

          <div className="absolute right-4 sm:right-6 top-4 flex gap-2">
            {isOrganizer && (
              <Link
                href={`/scanner/${event.id}`}
                className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-2 text-xs font-semibold text-white backdrop-blur-md hover:bg-primary/90 transition-colors shadow-violet"
              >
                <Scan className="h-3.5 w-3.5" /> Scanner
              </Link>
            )}
            <button onClick={() => setLiked(l => !l)} className="flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-md hover:bg-black/60 transition-colors">
              <Heart className={cn('h-4 w-4', liked && 'fill-red-500 text-red-500')} />
            </button>
            <button onClick={() => { if (typeof navigator !== 'undefined') navigator.share?.({ title: event.title, url: window.location.href }) }} className="flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-md hover:bg-black/60 transition-colors">
              <Share2 className="h-4 w-4" />
            </button>
          </div>

          <div className="absolute left-4 sm:left-6 bottom-4 sm:bottom-6 flex flex-wrap gap-2">
            <span className="rounded-full bg-black/50 px-3 py-1 text-sm font-medium text-white backdrop-blur-md">
              {getCategoryEmoji(event.category)} {event.category}
            </span>
            {isCancelled && <span className="rounded-full bg-red-500/90 px-3 py-1 text-sm font-bold text-white">CANCELLED</span>}
            {isSoldOut && !isCancelled && <span className="rounded-full bg-orange-500/90 px-3 py-1 text-sm font-bold text-white">SOLD OUT</span>}
          </div>
        </div>

        {/* Main content */}
        <div className="mx-auto max-w-7xl px-4 sm:px-6 pt-8">
          <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
            {/* Left */}
            <div className="space-y-8">
              {isOrganizer && (
                <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
                  <LayoutDashboard className="h-4 w-4 flex-shrink-0 text-primary" />
                  <div className="flex-1 text-sm">
                    <span className="font-semibold text-primary">You're the organizer</span>
                    <span className="text-muted-foreground"> — use the panel on the right to manage check-ins and sales.</span>
                  </div>
                  <Link href={`/events/${event.slug}/manage`} className="shrink-0 text-xs font-medium text-primary hover:underline">
                    Manage →
                  </Link>
                </div>
              )}

              {isCancelled && (
                <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/20 dark:text-red-400">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  This event has been cancelled. Refunds are being processed automatically.
                </div>
              )}

              <div>
                <h1 className="text-2xl font-bold sm:text-3xl lg:text-4xl leading-tight">{event.title}</h1>
                <div className="mt-4 flex flex-wrap gap-4">
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4 text-primary" />{formatDateTime(event.startsAt)}
                  </span>
                  {(event.locationCity || event.isOnline) && (
                    <span className="flex items-center gap-2 text-sm text-muted-foreground">
                      {event.isOnline ? <Globe className="h-4 w-4 text-primary" /> : <MapPin className="h-4 w-4 text-primary" />}
                      {event.isOnline ? 'Online Event' : `${event.locationCity}, ${event.locationCountry}`}
                    </span>
                  )}
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Users className="h-4 w-4" />{event.ticketsSold?.toLocaleString() ?? 0} attending
                  </span>
                </div>

                {!isSoldOut && event.totalTickets > 0 && (
                  <div className="mt-4">
                    <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><TrendingUp className="h-3 w-3" />{soldPercent}% sold</span>
                      <span>{(event.totalTickets - event.ticketsSold).toLocaleString()} remaining</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <motion.div
                        className={cn('h-full rounded-full', soldPercent >= 90 ? 'bg-orange-500' : soldPercent >= 70 ? 'bg-amber-500' : 'bg-primary')}
                        initial={{ width: 0 }}
                        animate={{ width: `${soldPercent}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut' }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {event.description && (
                <section>
                  <h2 className="mb-4 text-lg font-semibold">About this event</h2>
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground leading-relaxed">{event.description}</p>
                </section>
              )}

              {event.organizer && (
                <section>
                  <h2 className="mb-4 text-lg font-semibold">Organized by</h2>
                  <Link href={`/organizers/${event.organizer.walletAddress}`}>
                    <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5 hover:border-primary/20 hover:shadow-md transition-all">
                      <Avatar className="h-12 w-12 ring-2 ring-border">
                        <AvatarImage src={event.organizer.user?.avatarUrl} />
                        <AvatarFallback className="bg-gradient-brand text-white font-bold">
                          {(event.organizer.user?.displayName ?? 'OR').slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">{event.organizer.user?.displayName ?? truncateWallet(event.organizer.walletAddress, 6)}</span>
                          {event.organizer.trustTier !== 'NEW' && (
                            <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold', getTrustTierColor(event.organizer.trustTier))}>
                              <Shield className="h-3 w-3" />{event.organizer.trustTier}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                          {event.organizer.totalEvents > 0 && <span>{event.organizer.totalEvents} events</span>}
                          {event.organizer.rating && <span className="flex items-center gap-1"><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{event.organizer.rating.toFixed(1)}</span>}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </Link>
                </section>
              )}

              {/* Mobile: organizer controls OR ticket purchase */}
              <section className="lg:hidden">
                {isOrganizer ? (
                  <OrganizerPanel event={event} />
                ) : (
                  <>
                    <h2 className="mb-4 text-lg font-semibold">Select Tickets</h2>
                    {isCancelled ? (
                      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center dark:border-red-800 dark:bg-red-950/20">
                        <XCircle className="mx-auto mb-2 h-8 w-8 text-red-500" />
                        <p className="font-medium text-red-700 dark:text-red-400">Event Cancelled</p>
                      </div>
                    ) : isSoldOut ? (
                      <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-center dark:border-orange-800 dark:bg-orange-950/20">
                        <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-orange-500" />
                        <p className="font-medium text-orange-700 dark:text-orange-400">Sold Out</p>
                        <Button className="mt-3 w-full" variant="outline" size="sm">Join Waitlist</Button>
                      </div>
                    ) : (
                      <>
                        <div className="space-y-3">
                          {event.ticketTiers?.map((tier: any) => (
                            <TicketTierCard
                              key={tier.id}
                              tier={tier}
                              selected={selectedTierId === tier.id}
                              quantity={quantities[tier.id] ?? 1}
                              onSelect={() => setSelectedTierId(tier.id === selectedTierId ? null : tier.id)}
                              onQuantityChange={(q) => setQuantities(p => ({ ...p, [tier.id]: q }))}
                            />
                          ))}
                        </div>
                        <div className="mt-4">
                          <PurchasePanel event={event} selectedTier={selectedTier} quantity={selectedQty} />
                        </div>
                      </>
                    )}
                  </>
                )}
              </section>
            </div>

            {/* Right — sticky panel: organizer controls OR purchase */}
            <div className="hidden lg:block">
              <div className="sticky top-24">
                {isOrganizer ? (
                  <OrganizerPanel event={event} />
                ) : (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                      <div className="mb-5 flex items-center justify-between">
                        <h2 className="text-lg font-semibold">Get Tickets</h2>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <div className="live-dot" />Live availability
                        </div>
                      </div>

                      {isCancelled ? (
                        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center dark:border-red-900 dark:bg-red-950/20">
                          <XCircle className="mx-auto mb-2 h-8 w-8 text-red-500" />
                          <p className="font-medium text-red-700 dark:text-red-400">Event Cancelled</p>
                        </div>
                      ) : isSoldOut ? (
                        <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-center dark:border-orange-900 dark:bg-orange-950/20">
                          <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-orange-500" />
                          <p className="font-medium text-orange-700 dark:text-orange-400">Sold Out</p>
                          <Button className="mt-3 w-full" variant="outline" size="sm">Join Waitlist</Button>
                        </div>
                      ) : (
                        <>
                          <div className="mb-5 space-y-3">
                            {event.ticketTiers?.map((tier: any) => (
                              <TicketTierCard
                                key={tier.id}
                                tier={tier}
                                selected={selectedTierId === tier.id}
                                quantity={quantities[tier.id] ?? 1}
                                onSelect={() => setSelectedTierId(tier.id === selectedTierId ? null : tier.id)}
                                onQuantityChange={(q) => setQuantities(p => ({ ...p, [tier.id]: q }))}
                              />
                            ))}
                          </div>
                          <PurchasePanel event={event} selectedTier={selectedTier} quantity={selectedQty} />
                        </>
                      )}
                    </div>

                    <div className="rounded-2xl border border-border bg-card p-5">
                      <h3 className="mb-3 text-sm font-semibold">Why you can trust this</h3>
                      <div className="space-y-3">
                        {[
                          { icon: Shield, text: 'Organizer stake — accountable for fraud' },
                          { icon: Lock, text: 'Dynamic QR — screenshots don\'t work' },
                          { icon: Award, text: 'Soulbound badge minted at check-in' },
                          { icon: Zap, text: 'NFT ticket — true ownership' },
                        ].map(({ icon: Icon, text }) => (
                          <div key={text} className="flex items-start gap-2.5 text-xs text-muted-foreground">
                            <Icon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary" />{text}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  )
}
