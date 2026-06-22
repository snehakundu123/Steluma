'use client'

import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Ticket, Award, Calendar, MapPin, QrCode, ArrowUpRight,
  Store, Shield, Clock, CheckCircle2, XCircle, Star, Loader2, RefreshCw,
} from 'lucide-react'
// RefreshCw kept for error retry button
import Link from 'next/link'
import { QRCodeSVG } from 'qrcode.react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Navbar } from '@/components/layout/navbar'
import { useAuthStore } from '@/store/auth.store'
import { formatDate, formatXLM, cn } from '@/lib/utils'

const TABS = [
  { id: 'tickets', label: 'My Tickets', icon: Ticket },
  { id: 'badges', label: 'Badges', icon: Award },
  { id: 'history', label: 'Past Events', icon: Clock },
]

function TicketCard({ ticket, onSelect }: { ticket: any; onSelect: () => void }) {
  const isCheckedIn = ticket.checkedInAt != null
  const isExpired = new Date(ticket.event?.endsAt ?? ticket.event?.startsAt) < new Date()

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
    >
      <div
        onClick={onSelect}
        className={cn(
          'relative overflow-hidden rounded-2xl border-2 cursor-pointer transition-all duration-200',
          isCheckedIn
            ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/20'
            : isExpired
              ? 'border-border bg-muted/30 opacity-70'
              : 'border-border bg-card hover:border-primary/30 hover:shadow-violet',
        )}
      >
        {/* Event banner strip */}
        <div className="relative h-24 overflow-hidden bg-gradient-to-r from-violet-600 to-indigo-700">
          {ticket.event?.bannerUrl && (
            <img src={ticket.event.bannerUrl} alt="" className="h-full w-full object-cover opacity-80" />
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-black/40 to-transparent" />
          <div className="absolute right-3 top-3 flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 backdrop-blur-md border border-white/20">
            <QrCode className="h-6 w-6 text-white/80" />
          </div>
          <div className="absolute bottom-3 left-3">
            <span className={cn(
              'rounded-full px-2.5 py-1 text-xs font-semibold backdrop-blur-md',
              isCheckedIn
                ? 'bg-emerald-500/90 text-white'
                : isExpired
                  ? 'bg-black/50 text-white/70'
                  : 'bg-black/40 text-white',
            )}>
              {isCheckedIn ? '✓ Checked In' : isExpired ? 'Event Ended' : '• Valid'}
            </span>
          </div>
        </div>

        {/* Ticket notch separator */}
        <div className="ticket-notch relative border-t border-dashed border-border mx-4" />

        {/* Ticket content */}
        <div className="p-4">
          <h3 className="font-semibold text-foreground line-clamp-1 mb-2">
            {ticket.event?.title ?? 'Event Ticket'}
          </h3>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
              {ticket.event?.startsAt ? formatDate(ticket.event.startsAt) : 'Date TBD'}
            </div>
            {ticket.event?.locationCity && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                {ticket.event.locationCity}
              </div>
            )}
          </div>

          <div className="mt-3 flex items-center justify-between">
            <div>
              <p className="text-2xs text-muted-foreground uppercase tracking-wide">Tier</p>
              <p className="text-sm font-semibold text-foreground">{ticket.tier?.name ?? 'General'}</p>
            </div>
            <div className="flex gap-2">
              {!isCheckedIn && !isExpired && ticket.resaleEnabled && (
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={(e) => { e.stopPropagation() }}>
                  <Store className="h-3 w-3" /> Sell
                </Button>
              )}
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={(e) => { e.stopPropagation(); onSelect() }}>
                <QrCode className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

function BadgeCard({ badge }: { badge: any }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.02, y: -2 }}
      className="group rounded-2xl border border-border bg-card p-5 text-center cursor-pointer hover:border-primary/20 hover:shadow-md transition-all"
    >
      <div className="relative mx-auto mb-4 flex h-20 w-20 items-center justify-center">
        <div className="absolute inset-0 rounded-full bg-gradient-brand opacity-10 group-hover:opacity-20 transition-opacity" />
        <div className="h-16 w-16 rounded-full bg-gradient-brand flex items-center justify-center text-2xl shadow-violet">
          {badge.emoji ?? '🏆'}
        </div>
        <div className="absolute -right-1 -top-1 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
          <CheckCircle2 className="h-3 w-3 text-white" />
        </div>
      </div>
      <h3 className="font-semibold text-sm text-foreground line-clamp-1">{badge.name ?? badge.eventTitle}</h3>
      <p className="text-xs text-muted-foreground mt-1">{badge.startsAt ? formatDate(badge.startsAt) : ''}</p>
      <div className="mt-3 flex items-center justify-center gap-1 text-2xs text-primary">
        <Shield className="h-3 w-3" />
        <span>Soulbound NFT</span>
      </div>
    </motion.div>
  )
}

function QRModal({ ticket, onClose }: { ticket: any; onClose: () => void }) {
  const [qrToken, setQrToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const fetchQr = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    try {
      const data = await api.get<{ payload: string }>(`/tickets/${ticket.id}/qr`)
      setQrToken(data.payload)
    } catch (err: any) {
      setFetchError(
        err.code === 'TICKET_NOT_FOUND'
          ? 'Ticket not found or not yet active. Please wait a moment and try again.'
          : 'Could not load QR code. Please try again.',
      )
    } finally {
      setLoading(false)
    }
  }, [ticket.id])

  useEffect(() => { fetchQr() }, [fetchQr])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-3xl bg-card border border-border p-6 shadow-2xl"
      >
        {/* Header */}
        <div className="mb-4 text-center">
          <h2 className="font-bold text-foreground">{ticket.event?.title ?? 'Your Ticket'}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {ticket.tier?.name ?? 'General'} · #{ticket.ticketNumber}
          </p>
        </div>

        {/* QR area */}
        <div className="mx-auto flex h-[252px] w-[252px] items-center justify-center rounded-2xl border-2 border-primary/20 bg-white">
          {loading ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="text-xs text-gray-500">Loading QR…</span>
            </div>
          ) : fetchError ? (
            <div className="px-4 text-center">
              <XCircle className="mx-auto mb-2 h-8 w-8 text-red-400" />
              <p className="text-xs text-gray-600">{fetchError}</p>
            </div>
          ) : qrToken ? (
            <QRCodeSVG
              value={qrToken}
              size={220}
              bgColor="#ffffff"
              fgColor="#111827"
              level="H"
              includeMargin={false}
            />
          ) : null}
        </div>

        {/* Error retry */}
        {fetchError && (
          <button
            onClick={fetchQr}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            <RefreshCw className="h-4 w-4" /> Try Again
          </button>
        )}

        <div className="mt-4 rounded-xl bg-muted/50 p-3 text-center text-xs text-muted-foreground">
          <Shield className="inline h-3.5 w-3.5 mr-1 text-primary" />
          Show this QR to the organizer at the door
        </div>

        <Button onClick={onClose} variant="outline" className="mt-4 w-full">Close</Button>
      </motion.div>
    </motion.div>
  )
}

export default function UserDashboard() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isAuthenticated, user, wallet } = useAuthStore()
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') ?? 'tickets')
  const [selectedTicket, setSelectedTicket] = useState<any>(null)

  useEffect(() => {
    if (!isAuthenticated) router.push('/connect')
  }, [isAuthenticated, router])

  const { data: tickets, isLoading: ticketsLoading } = useQuery({
    queryKey: ['user', 'tickets'],
    queryFn: () => api.get<{ data: any[] }>('/users/me/tickets'),
    enabled: isAuthenticated,
  })

  const { data: badges, isLoading: badgesLoading } = useQuery({
    queryKey: ['user', 'badges'],
    queryFn: () => api.get<{ data: any[] }>('/users/me/badges'),
    enabled: isAuthenticated && activeTab === 'badges',
  })

  if (!isAuthenticated) return null

  const ticketList = tickets?.data ?? []
  const activeTickets = ticketList.filter((t: any) => !t.checkedInAt && new Date(t.event?.startsAt) > new Date())
  const pastTickets = ticketList.filter((t: any) => t.checkedInAt || new Date(t.event?.startsAt) <= new Date())
  const badgeList = badges?.data ?? []

  return (
    <>
      <Navbar />
      <AnimatePresence>
        {selectedTicket && (
          <QRModal ticket={selectedTicket} onClose={() => setSelectedTicket(null)} />
        )}
      </AnimatePresence>

      <main className="min-h-screen bg-surface-subtle">
        {/* Header */}
        <div className="border-b border-border bg-background">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 py-6">
            <div className="flex items-center gap-4 mb-6">
              <Avatar className="h-14 w-14 ring-2 ring-border">
                <AvatarImage src={user?.avatarUrl ?? undefined} />
                <AvatarFallback className="bg-gradient-brand text-white font-bold text-lg">
                  {(user?.displayName ?? wallet ?? 'U').slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <h1 className="text-xl font-bold text-foreground">{user?.displayName ?? 'My Account'}</h1>
                <p className="text-sm text-muted-foreground font-mono">{wallet?.slice(0, 8)}…{wallet?.slice(-6)}</p>
                <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Ticket className="h-3.5 w-3.5" />{ticketList.length} tickets</span>
                  <span className="flex items-center gap-1"><Award className="h-3.5 w-3.5" />{badgeList.length} badges</span>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all',
                    activeTab === tab.id
                      ? 'bg-foreground text-background shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                  )}
                >
                  <tab.icon className="h-4 w-4" />
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8">
          <AnimatePresence mode="wait">
            {activeTab === 'tickets' && (
              <motion.div key="tickets" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                {ticketsLoading ? (
                  <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-56 rounded-2xl" />)}
                  </div>
                ) : ticketList.length === 0 ? (
                  <div className="py-24 text-center">
                    <div className="mb-4 text-5xl">🎫</div>
                    <h3 className="text-xl font-semibold">No tickets yet</h3>
                    <p className="mt-2 text-sm text-muted-foreground">Browse events and purchase your first ticket</p>
                    <Link href="/events">
                      <Button className="mt-6 gap-2" variant="gradient">Explore Events</Button>
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-8">
                    {activeTickets.length > 0 && (
                      <div>
                        <h2 className="mb-4 text-base font-semibold text-foreground">Upcoming ({activeTickets.length})</h2>
                        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                          {activeTickets.map((t: any) => (
                            <TicketCard key={t.id} ticket={t} onSelect={() => setSelectedTicket(t)} />
                          ))}
                        </div>
                      </div>
                    )}
                    {pastTickets.length > 0 && (
                      <div>
                        <h2 className="mb-4 text-base font-semibold text-foreground">Past ({pastTickets.length})</h2>
                        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                          {pastTickets.map((t: any) => (
                            <TicketCard key={t.id} ticket={t} onSelect={() => setSelectedTicket(t)} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'badges' && (
              <motion.div key="badges" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                {badgesLoading ? (
                  <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-44 rounded-2xl" />)}
                  </div>
                ) : badgeList.length === 0 ? (
                  <div className="py-24 text-center">
                    <div className="mb-4 text-5xl">🏆</div>
                    <h3 className="text-xl font-semibold">No badges yet</h3>
                    <p className="mt-2 text-sm text-muted-foreground">Attend events and get checked in to earn soulbound badges</p>
                    <Link href="/events">
                      <Button className="mt-6 gap-2" variant="gradient">Find Events</Button>
                    </Link>
                  </div>
                ) : (
                  <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                    {badgeList.map((badge: any) => <BadgeCard key={badge.id} badge={badge} />)}
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'history' && (
              <motion.div key="history" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                {pastTickets.length === 0 ? (
                  <div className="py-24 text-center">
                    <div className="mb-4 text-5xl">📅</div>
                    <h3 className="text-xl font-semibold">No event history yet</h3>
                    <p className="mt-2 text-sm text-muted-foreground">Your attended events will appear here</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pastTickets.map((t: any) => (
                      <div key={t.id} className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4">
                        <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-xl bg-gradient-brand">
                          {t.event?.bannerUrl && <img src={t.event.bannerUrl} alt="" className="h-full w-full object-cover" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <Link href={`/events/${t.event?.slug}`} className="font-semibold text-sm hover:text-primary transition-colors line-clamp-1">
                            {t.event?.title ?? 'Event'}
                          </Link>
                          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                            <Calendar className="h-3 w-3" />
                            {t.event?.startsAt ? formatDate(t.event.startsAt) : ''}
                            {t.checkedInAt && (
                              <><span className="text-emerald-500">·</span><CheckCircle2 className="h-3 w-3 text-emerald-500" /><span className="text-emerald-600 dark:text-emerald-400">Attended</span></>
                            )}
                          </p>
                        </div>
                        <span className="text-xs font-medium text-muted-foreground shrink-0">{t.tier?.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </>
  )
}
