'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Calendar, Ticket, TrendingUp, Plus, QrCode, BarChart3,
  Search, Edit, Copy, ChevronLeft, ChevronRight, XCircle,
  Download, CheckSquare, Square, Trash2, Shield, Users, Eye,
} from 'lucide-react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { Navbar } from '@/components/layout/navbar'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import { formatDate, formatXLM, getCategoryEmoji, cn } from '@/lib/utils'

// ─── Types ───────────────────────────────────────────────────────────────────

type OrganizerEvent = {
  id: string
  title: string
  slug: string
  category: string
  status: 'DRAFT' | 'STAKED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED'
  bannerUrl?: string
  startsAt: string
  endsAt: string
  ticketsSold: number
  totalTickets: number
  revenue: string
  viewCount: number
  onChainEventId?: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  DRAFT:     { label: 'Draft',      color: 'bg-muted text-muted-foreground border-border',                                                                        dot: 'bg-muted-foreground' },
  STAKED:    { label: 'Staked',     color: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800',             dot: 'bg-amber-500' },
  ACTIVE:    { label: 'Live',       color: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800', dot: 'bg-emerald-500' },
  COMPLETED: { label: 'Ended',      color: 'bg-muted text-muted-foreground border-border',                                                                        dot: 'bg-muted-foreground/50' },
  CANCELLED: { label: 'Cancelled',  color: 'bg-red-50 text-red-600 border-red-200 dark:bg-red-950 dark:text-red-400 dark:border-red-900',                        dot: 'bg-red-500' },
}

const FILTER_TABS = [
  { key: '',          label: 'All' },
  { key: 'ACTIVE',    label: 'Live' },
  { key: 'STAKED',    label: 'Staked' },
  { key: 'DRAFT',     label: 'Draft' },
  { key: 'COMPLETED', label: 'Ended' },
  { key: 'CANCELLED', label: 'Cancelled' },
]

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.DRAFT
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
      cfg.color,
    )}>
      <span className={cn('h-1.5 w-1.5 rounded-full', cfg.dot)} />
      {cfg.label}
    </span>
  )
}

function SkeletonRow() {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 animate-pulse">
      <div className="flex items-center gap-4">
        <div className="h-14 w-14 rounded-xl bg-muted flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-1/2 rounded-md bg-muted" />
          <div className="h-3 w-1/3 rounded-md bg-muted" />
        </div>
        <div className="hidden md:flex gap-8">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-1 text-center">
              <div className="h-4 w-16 rounded bg-muted" />
              <div className="h-3 w-12 rounded bg-muted" />
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <div className="h-8 w-16 rounded-md bg-muted" />
          <div className="h-8 w-16 rounded-md bg-muted" />
        </div>
      </div>
    </div>
  )
}

function EventRow({
  event,
  selected,
  onToggle,
}: {
  event: OrganizerEvent
  selected: boolean
  onToggle: (id: string) => void
}) {
  const soldPct = event.totalTickets > 0
    ? Math.round((event.ticketsSold / event.totalTickets) * 100) : 0

  return (
    <div className={cn(
      'rounded-2xl border bg-card p-5 transition-all hover:shadow-sm',
      selected ? 'border-primary/40 bg-accent/10' : 'border-border',
    )}>
      <div className="flex items-center gap-4">
        {/* Checkbox */}
        <button
          onClick={() => onToggle(event.id)}
          className="flex-shrink-0 text-muted-foreground hover:text-primary transition-colors"
          aria-label={selected ? 'Deselect event' : 'Select event'}
        >
          {selected
            ? <CheckSquare className="h-4 w-4 text-primary" />
            : <Square className="h-4 w-4" />}
        </button>

        {/* Thumbnail */}
        <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600">
          {event.bannerUrl && (
            <img src={event.bannerUrl} alt="" className="h-full w-full object-cover" />
          )}
        </div>

        {/* Title + meta */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <Link
              href={`/events/${event.slug}`}
              className="font-semibold text-foreground hover:text-primary truncate max-w-[260px] transition-colors"
            >
              {event.title}
            </Link>
            <StatusBadge status={event.status} />
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>{getCategoryEmoji(event.category)} {event.category}</span>
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formatDate(event.startsAt)}
            </span>
            <span className="flex items-center gap-1">
              <Eye className="h-3 w-3" />
              {event.viewCount.toLocaleString()} views
            </span>
          </div>
        </div>

        {/* Stats — desktop */}
        <div className="hidden md:flex items-center gap-6 flex-shrink-0">
          <div className="text-center min-w-[72px]">
            <p className="text-sm font-bold text-foreground tabular-nums">
              {event.ticketsSold}<span className="font-normal text-muted-foreground">/{event.totalTickets}</span>
            </p>
            <p className="text-xs text-muted-foreground">Tickets</p>
            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn('h-full rounded-full', soldPct >= 90 ? 'bg-orange-500' : 'bg-primary')}
                style={{ width: `${soldPct}%` }}
              />
            </div>
          </div>
          <div className="text-center min-w-[80px]">
            <p className="text-sm font-bold text-foreground tabular-nums">{formatXLM(event.revenue)}</p>
            <p className="text-xs text-muted-foreground">XLM Revenue</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {event.status === 'ACTIVE' && (
            <Link href={`/scanner/${event.id}`}>
              <Button size="sm" variant="gradient" className="gap-1.5 h-8 text-xs">
                <QrCode className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Scanner</span>
              </Button>
            </Link>
          )}
          <Link href={`/events/${event.slug}/manage`}>
            <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs">
              <BarChart3 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Manage</span>
            </Button>
          </Link>
          <Link href={`/events/create?duplicate=${event.id}`}>
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="Duplicate event">
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </Link>
          <Link href={`/events/${event.slug}/edit`}>
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="Edit event">
              <Edit className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OrganizerEventsPage() {
  const router = useRouter()
  const qc = useQueryClient()
  const { isAuthenticated } = useAuthStore()

  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!isAuthenticated) router.push('/connect?redirect=/organizer/events')
  }, [isAuthenticated, router])

  // Reset page on filter/search change
  useEffect(() => { setPage(1) }, [statusFilter, search])

  const { data, isLoading } = useQuery({
    queryKey: ['organizer-events', statusFilter],
    queryFn: () =>
      api.get<{ data: OrganizerEvent[] }>(
        `/organizers/me/events${statusFilter ? `?status=${statusFilter}` : ''}`
      ),
    enabled: isAuthenticated,
  })

  const cancelMutation = useMutation({
    mutationFn: (ids: string[]) =>
      Promise.all(ids.map((id) => api.post(`/events/${id}/cancel`))),
    onSuccess: () => {
      toast.success('Selected events cancelled')
      setSelected(new Set())
      qc.invalidateQueries({ queryKey: ['organizer-events'] })
    },
    onError: (err: any) => toast.error(err.message ?? 'Failed to cancel events'),
  })

  const allEvents = data?.data ?? []

  const filtered = allEvents.filter(
    (e) => !search || e.title.toLowerCase().includes(search.toLowerCase())
  )

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const totals = allEvents.reduce(
    (acc, e) => ({
      revenue: acc.revenue + Number(e.revenue),
      sold: acc.sold + e.ticketsSold,
      views: acc.views + e.viewCount,
    }),
    { revenue: 0, sold: 0, views: 0 }
  )

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  const toggleSelectAll = () => {
    if (selected.size === paginated.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(paginated.map((e) => e.id)))
    }
  }

  const handleExportCSV = () => {
    const rows = [
      ['Title', 'Status', 'Date', 'Tickets Sold', 'Total Tickets', 'Revenue (XLM)'],
      ...filtered.map((e) => [
        e.title,
        e.status,
        formatDate(e.startsAt),
        e.ticketsSold,
        e.totalTickets,
        formatXLM(e.revenue),
      ]),
    ]
    const csv = rows.map((r) => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `steluma-events-${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!isAuthenticated) return null

  return (
    <div className="min-h-screen bg-surface-subtle">
      <Navbar />

      {/* Page header */}
      <div className="border-b border-border bg-background">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-muted-foreground mb-1">
                <Link href="/organizer" className="hover:text-primary transition-colors">Dashboard</Link>
                <span className="mx-2 text-border">/</span>
                Events
              </p>
              <h1 className="text-2xl font-bold text-foreground">My Events</h1>
            </div>
            <Link href="/events/create">
              <Button variant="gradient" className="gap-2 font-semibold">
                <Plus className="h-4 w-4" />
                Create Event
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8">
        {/* Summary stats */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 grid grid-cols-3 gap-4"
        >
          {[
            { label: 'Total Revenue', value: `${formatXLM(String(totals.revenue))} XLM`, icon: TrendingUp, color: 'text-violet-600 bg-violet-50 dark:bg-violet-950 dark:text-violet-400' },
            { label: 'Tickets Sold', value: totals.sold.toLocaleString(), icon: Ticket, color: 'text-blue-600 bg-blue-50 dark:bg-blue-950 dark:text-blue-400' },
            { label: 'Total Views', value: totals.views.toLocaleString(), icon: Users, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-400' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="rounded-2xl border border-border bg-card p-5 shadow-xs">
              <div className={cn('mb-3 h-9 w-9 rounded-xl flex items-center justify-center', color)}>
                <Icon className="h-4 w-4" />
              </div>
              <p className="text-xl font-bold tabular-nums text-foreground">{value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
            </div>
          ))}
        </motion.div>

        {/* Filters + search row */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="mb-4 flex flex-wrap items-center gap-3"
        >
          {/* Status tabs */}
          <div className="flex rounded-xl border border-border bg-card p-1 gap-0.5">
            {FILTER_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setStatusFilter(tab.key)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-sm font-medium transition-all',
                  statusFilter === tab.key
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative flex-1 min-w-[160px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search events…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-border bg-card pl-9 pr-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all"
            />
          </div>

          {/* Count + export */}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {filtered.length} event{filtered.length !== 1 ? 's' : ''}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 h-9"
              onClick={handleExportCSV}
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </Button>
          </div>
        </motion.div>

        {/* Bulk actions bar */}
        <AnimatePresence>
          {selected.size > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-4 overflow-hidden"
            >
              <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-accent/20 px-4 py-3">
                <span className="text-sm font-medium text-foreground">
                  {selected.size} selected
                </span>
                <Button
                  size="sm"
                  variant="destructive"
                  className="gap-1.5 h-8"
                  onClick={() => cancelMutation.mutate(Array.from(selected))}
                  disabled={cancelMutation.isPending}
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Cancel Selected
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-muted-foreground"
                  onClick={() => setSelected(new Set())}
                >
                  Clear
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Events list */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}
          </div>
        ) : paginated.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-dashed border-border bg-card p-16 text-center"
          >
            <Calendar className="mx-auto mb-4 h-12 w-12 text-muted-foreground/40" />
            <h3 className="text-lg font-semibold text-foreground mb-2">No events found</h3>
            <p className="text-sm text-muted-foreground mb-6">
              {search
                ? `No events match "${search}"`
                : statusFilter
                ? `You have no ${statusFilter.toLowerCase()} events yet`
                : 'Create your first event to get started'}
            </p>
            <Link href="/events/create">
              <Button variant="gradient" className="gap-2">
                <Plus className="h-4 w-4" />
                Create your first event
              </Button>
            </Link>
          </motion.div>
        ) : (
          <>
            {/* Select-all header */}
            <div className="mb-2 flex items-center gap-3 px-1">
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {selected.size === paginated.length && paginated.length > 0
                  ? <CheckSquare className="h-3.5 w-3.5 text-primary" />
                  : <Square className="h-3.5 w-3.5" />}
                Select all
              </button>
            </div>

            <div className="space-y-3">
              {paginated.map((event, idx) => (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.03 }}
                >
                  <EventRow
                    event={event}
                    selected={selected.has(event.id)}
                    onToggle={toggleSelect}
                  />
                </motion.div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-6 flex items-center justify-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="gap-1"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Prev
                </Button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }).map((_, i) => {
                    const p = i + 1
                    if (totalPages > 7 && Math.abs(p - page) > 2 && p !== 1 && p !== totalPages) {
                      if (p === page - 3 || p === page + 3) return <span key={p} className="text-muted-foreground px-1">…</span>
                      if (Math.abs(p - page) > 3) return null
                    }
                    return (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={cn(
                          'h-8 min-w-[32px] rounded-lg px-2.5 text-sm font-medium transition-all',
                          p === page
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                        )}
                      >
                        {p}
                      </button>
                    )
                  })}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="gap-1"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
