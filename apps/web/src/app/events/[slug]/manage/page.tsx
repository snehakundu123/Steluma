'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BarChart3, Users, Ticket, TrendingUp, CheckCircle,
  XCircle, ArrowLeft, AlertTriangle, QrCode, Download,
  Search, Settings, Eye, DollarSign, Clock, ExternalLink,
  CalendarDays, MapPin, RefreshCw, Tag, Zap, Loader2,
} from 'lucide-react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { Navbar } from '@/components/layout/navbar'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import { usePublishEvent } from '@/hooks/use-publish-event'
import { formatDate, formatXLM, cn } from '@/lib/utils'

// ── Types ────────────────────────────────────────────────────────────────────

type ManagementData = {
  event: {
    id: string
    title: string
    slug: string
    status: string
    startsAt: string
    endsAt?: string
    category: string
    locationCity?: string
    bannerUrl?: string
    royaltyBps?: number
    maxResalePrice?: string
    refundPolicy?: string
    ticketSaleEnd?: string
  }
  summary: {
    totalRevenue: string
    ticketsSold: number
    totalCapacity: number
    checkedIn: number
    avgTicketPrice: string
    checkInRate: string
    pageViews: number
  }
  salesByTier: Array<{
    tierId: string
    name: string
    sold: number
    total: number
    revenue: string
    pctSold: number
  }>
  recentPurchases: Array<{
    id: string
    purchasedAt: string
    amount: string
    buyer: { walletAddress: string; displayName: string | null }
    tierName: string
    ticketNumber: number
  }>
  attendees: Array<{
    id: string
    walletAddress: string
    displayName: string | null
    tierName: string
    purchasedAt: string
    checkedIn: boolean
    checkedInAt?: string
  }>
}

type Tab = 'overview' | 'attendees' | 'checkins' | 'revenue' | 'settings'

// ── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  DRAFT:     { label: 'Draft',     cls: 'bg-muted text-muted-foreground' },
  ACTIVE:    { label: 'Live',      cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400' },
  PUBLISHED: { label: 'Live',      cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400' },
  ENDED:     { label: 'Ended',     cls: 'bg-muted text-muted-foreground' },
  CANCELLED: { label: 'Cancelled', cls: 'bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400' },
  SOLD_OUT:  { label: 'Sold Out',  cls: 'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-400' },
}

const tabList: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'overview',  label: 'Overview',  icon: BarChart3 },
  { id: 'attendees', label: 'Attendees', icon: Users },
  { id: 'checkins',  label: 'Check-ins', icon: CheckCircle },
  { id: 'revenue',   label: 'Revenue',   icon: DollarSign },
  { id: 'settings',  label: 'Settings',  icon: Settings },
]

const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: -8 },
  transition: { duration: 0.22 },
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string | number; sub?: string
  icon: React.ElementType; color: string
}) {
  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
      className="rounded-2xl border border-border bg-card p-5 shadow-xs hover:shadow-sm transition-shadow"
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <div className={cn('flex h-8 w-8 items-center justify-center rounded-xl', color)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="text-2xl font-bold tabular-nums text-foreground">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </motion.div>
  )
}

function TierRow({ tier, maxRevenue }: { tier: ManagementData['salesByTier'][0]; maxRevenue: number }) {
  const revNum = parseFloat(tier.revenue)
  const barPct = maxRevenue > 0 ? Math.min((revNum / maxRevenue) * 100, 100) : 0

  return (
    <tr className="group hover:bg-surface-subtle transition-colors">
      <td className="py-3 pl-4 pr-3">
        <span className="font-medium text-sm text-foreground">{tier.name}</span>
      </td>
      <td className="py-3 px-3 text-sm tabular-nums text-foreground">{tier.sold}</td>
      <td className="py-3 px-3 text-sm tabular-nums text-muted-foreground">{tier.total}</td>
      <td className="py-3 px-3 text-sm tabular-nums text-foreground">{formatXLM(tier.revenue)} XLM</td>
      <td className="py-3 pl-3 pr-4">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500"
              initial={{ width: 0 }}
              animate={{ width: `${barPct}%` }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            />
          </div>
          <span className="text-xs tabular-nums text-muted-foreground w-9">{tier.pctSold.toFixed(0)}%</span>
        </div>
      </td>
    </tr>
  )
}

// ── Overview Tab ──────────────────────────────────────────────────────────────

function OverviewTab({ data }: { data: ManagementData }) {
  const { summary, salesByTier, recentPurchases } = data
  const maxRev = Math.max(...salesByTier.map((t) => parseFloat(t.revenue)), 1)

  const stats = [
    { label: 'Tickets Sold', value: `${summary.ticketsSold}/${summary.totalCapacity}`, sub: `${((summary.ticketsSold / Math.max(summary.totalCapacity, 1)) * 100).toFixed(0)}% capacity`, icon: Ticket, color: 'bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400' },
    { label: 'Total Revenue', value: `${formatXLM(summary.totalRevenue)} XLM`, sub: `Avg ${formatXLM(summary.avgTicketPrice)} XLM/ticket`, icon: TrendingUp, color: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400' },
    { label: 'Check-in Rate', value: `${summary.checkInRate}%`, sub: `${summary.checkedIn} checked in`, icon: CheckCircle, color: 'bg-violet-100 text-violet-600 dark:bg-violet-950 dark:text-violet-400' },
    { label: 'Page Views', value: summary.pageViews.toLocaleString(), sub: 'Total visits', icon: Eye, color: 'bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400' },
  ]

  return (
    <motion.div {...fadeUp} className="space-y-6">
      {/* Stats grid */}
      <motion.div
        className="grid grid-cols-2 gap-4 lg:grid-cols-4"
        variants={{ show: { transition: { staggerChildren: 0.07 } }, hidden: {} }}
        initial="hidden"
        animate="show"
      >
        {stats.map((s) => <StatCard key={s.label} {...s} />)}
      </motion.div>

      {/* Sales by tier table */}
      {salesByTier.length > 0 && (
        <div className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
            <BarChart3 className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Sales by Tier</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-2.5 pl-4 pr-3 text-xs font-medium text-muted-foreground">Tier</th>
                  <th className="py-2.5 px-3 text-xs font-medium text-muted-foreground">Sold</th>
                  <th className="py-2.5 px-3 text-xs font-medium text-muted-foreground">Total</th>
                  <th className="py-2.5 px-3 text-xs font-medium text-muted-foreground">Revenue</th>
                  <th className="py-2.5 pl-3 pr-4 text-xs font-medium text-muted-foreground">% Sold</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {salesByTier.map((tier) => (
                  <TierRow key={tier.tierId} tier={tier} maxRevenue={maxRev} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent purchases feed */}
      <div className="rounded-2xl border border-border bg-card shadow-xs">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
          <Clock className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Recent Purchases</h2>
          <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            <div className="live-dot" /> Live
          </div>
        </div>
        {recentPurchases.length === 0 ? (
          <div className="py-12 text-center">
            <Ticket className="mx-auto mb-3 h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No purchases yet</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {recentPurchases.map((purchase, i) => (
              <motion.div
                key={purchase.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                className="flex items-center gap-3 px-5 py-3.5 hover:bg-surface-subtle transition-colors"
              >
                <div className="h-8 w-8 flex-shrink-0 rounded-full bg-gradient-to-br from-violet-400 to-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                  {(purchase.buyer.displayName ?? purchase.buyer.walletAddress).charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">
                    {purchase.buyer.displayName ?? `${purchase.buyer.walletAddress.slice(0, 8)}…`}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {purchase.tierName} · #{purchase.ticketNumber}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold text-emerald-600 tabular-nums">
                    +{formatXLM(purchase.amount)} XLM
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(purchase.purchasedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}

// ── Attendees Tab ─────────────────────────────────────────────────────────────

function AttendeesTab({ attendees }: { attendees: ManagementData['attendees'] }) {
  const [query, setQuery] = useState('')

  const filtered = attendees.filter((a) => {
    const q = query.toLowerCase()
    return (
      a.walletAddress.toLowerCase().includes(q) ||
      (a.displayName?.toLowerCase().includes(q) ?? false) ||
      a.tierName.toLowerCase().includes(q)
    )
  })

  return (
    <motion.div {...fadeUp} className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search attendees…"
            className="w-full rounded-xl border border-input bg-background py-2 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border bg-surface-subtle">
                <th className="py-3 pl-4 pr-3 text-xs font-medium text-muted-foreground">Attendee</th>
                <th className="py-3 px-3 text-xs font-medium text-muted-foreground hidden sm:table-cell">Wallet</th>
                <th className="py-3 px-3 text-xs font-medium text-muted-foreground">Tier</th>
                <th className="py-3 px-3 text-xs font-medium text-muted-foreground hidden md:table-cell">Purchased</th>
                <th className="py-3 pl-3 pr-4 text-xs font-medium text-muted-foreground">Checked In</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center">
                    <Users className="mx-auto mb-3 h-8 w-8 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">
                      {query ? 'No attendees match your search' : 'No attendees yet'}
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map((a, i) => (
                  <motion.tr
                    key={a.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.025 }}
                    className="hover:bg-surface-subtle transition-colors"
                  >
                    <td className="py-3 pl-4 pr-3">
                      <div className="flex items-center gap-2.5">
                        <div className="h-7 w-7 flex-shrink-0 rounded-full bg-gradient-to-br from-violet-400 to-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                          {(a.displayName ?? a.walletAddress).charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm font-medium text-foreground truncate max-w-[120px]">
                          {a.displayName ?? `${a.walletAddress.slice(0, 8)}…`}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-3 hidden sm:table-cell">
                      <span className="font-mono text-xs text-muted-foreground">
                        {a.walletAddress.slice(0, 6)}…{a.walletAddress.slice(-4)}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">
                        {a.tierName}
                      </span>
                    </td>
                    <td className="py-3 px-3 hidden md:table-cell">
                      <span className="text-xs text-muted-foreground">{formatDate(a.purchasedAt)}</span>
                    </td>
                    <td className="py-3 pl-3 pr-4">
                      {a.checkedIn ? (
                        <div className="flex items-center gap-1.5 text-xs text-emerald-600">
                          <CheckCircle className="h-3.5 w-3.5" />
                          <span>{a.checkedInAt ? new Date(a.checkedInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Yes'}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <XCircle className="h-3.5 w-3.5" />
                          <span>No</span>
                        </div>
                      )}
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="border-t border-border px-4 py-3">
            <p className="text-xs text-muted-foreground">
              {filtered.length} attendee{filtered.length !== 1 ? 's' : ''}{query ? ' found' : ''}
            </p>
          </div>
        )}
      </div>
    </motion.div>
  )
}

// ── Check-ins Tab ─────────────────────────────────────────────────────────────

function CheckinsTab({ attendees, summary }: { attendees: ManagementData['attendees']; summary: ManagementData['summary'] }) {
  const checkedIn = attendees.filter((a) => a.checkedIn)
  const notCheckedIn = attendees.filter((a) => !a.checkedIn)
  const rate = parseFloat(summary.checkInRate)

  return (
    <motion.div {...fadeUp} className="space-y-6">
      {/* Progress card */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">Check-in Progress</h2>
            <p className="text-sm text-muted-foreground mt-0.5">{summary.checkedIn} of {summary.ticketsSold} attendees</p>
          </div>
          <div className="text-3xl font-bold text-primary">{rate.toFixed(0)}%</div>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-muted">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500"
            initial={{ width: 0 }}
            animate={{ width: `${rate}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
        </div>
        <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5 text-emerald-600">
            <CheckCircle className="h-3.5 w-3.5" />
            {summary.checkedIn} checked in
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            {notCheckedIn.length} pending
          </span>
        </div>
      </div>

      {/* Checked-in list */}
      <div className="rounded-2xl border border-border bg-card shadow-xs">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
          <CheckCircle className="h-4 w-4 text-emerald-500" />
          <h2 className="text-sm font-semibold text-foreground">Checked In ({checkedIn.length})</h2>
        </div>
        {checkedIn.length === 0 ? (
          <div className="py-10 text-center">
            <Clock className="mx-auto mb-3 h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No one has checked in yet</p>
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto divide-y divide-border">
            {checkedIn.map((a, i) => (
              <motion.div
                key={a.id}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                className="flex items-center gap-3 px-5 py-3 hover:bg-surface-subtle transition-colors"
              >
                <div className="h-7 w-7 flex-shrink-0 rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center text-white text-xs font-bold">
                  {(a.displayName ?? a.walletAddress).charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">
                    {a.displayName ?? `${a.walletAddress.slice(0, 10)}…`}
                  </div>
                  <div className="text-xs text-muted-foreground">{a.tierName}</div>
                </div>
                <div className="text-xs text-emerald-600">
                  {a.checkedInAt ? new Date(a.checkedInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                </div>
                <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0" />
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}

// ── Revenue Tab ───────────────────────────────────────────────────────────────

function RevenueTab({ data }: { data: ManagementData }) {
  const { summary, salesByTier } = data
  const totalRev = parseFloat(summary.totalRevenue)
  const maxTierRev = Math.max(...salesByTier.map((t) => parseFloat(t.revenue)), 1)

  return (
    <motion.div {...fadeUp} className="space-y-6">
      {/* Revenue summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: 'Gross Revenue', value: `${formatXLM(summary.totalRevenue)} XLM`, icon: TrendingUp, color: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400' },
          { label: 'Avg Ticket Price', value: `${formatXLM(summary.avgTicketPrice)} XLM`, icon: Tag, color: 'bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400' },
          { label: 'Tickets Sold', value: summary.ticketsSold, sub: `of ${summary.totalCapacity} capacity`, icon: Ticket, color: 'bg-violet-100 text-violet-600 dark:bg-violet-950 dark:text-violet-400' },
        ].map((s) => <StatCard key={s.label} {...s} />)}
      </div>

      {/* Revenue by tier bars */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-xs">
        <h2 className="mb-5 text-sm font-semibold text-foreground flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          Revenue by Tier
        </h2>
        {salesByTier.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No sales data yet</p>
        ) : (
          <div className="space-y-5">
            {salesByTier.map((tier) => {
              const rev = parseFloat(tier.revenue)
              const pct = totalRev > 0 ? (rev / totalRev) * 100 : 0
              return (
                <div key={tier.tierId} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-foreground">{tier.name}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {formatXLM(tier.revenue)} XLM · {pct.toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500"
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.7, ease: 'easeOut' }}
                    />
                  </div>
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span>{tier.sold} sold of {tier.total}</span>
                    <span>{tier.pctSold.toFixed(0)}% fill rate</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </motion.div>
  )
}

// ── Settings Tab ──────────────────────────────────────────────────────────────

function SettingsTab({
  event, onCancel, cancelling,
}: {
  event: ManagementData['event']
  onCancel: () => void
  cancelling: boolean
}) {
  const [newDeadline, setNewDeadline] = useState(
    event.ticketSaleEnd ? new Date(event.ticketSaleEnd).toISOString().slice(0, 16) : '',
  )
  const qc = useQueryClient()

  const extendDeadline = useMutation({
    mutationFn: () => api.patch(`/events/${event.id}`, { ticketSaleEnd: newDeadline }),
    onSuccess: () => {
      toast.success('Sale deadline updated')
      qc.invalidateQueries({ queryKey: ['event-management', event.slug] })
    },
    onError: (err: any) => toast.error(err.message ?? 'Failed to update'),
  })

  return (
    <motion.div {...fadeUp} className="space-y-4 max-w-xl">
      {/* Edit event */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-xs">
        <h2 className="mb-1 text-sm font-semibold text-foreground">Event Details</h2>
        <p className="text-xs text-muted-foreground mb-4">Edit your event's title, description, location, and more.</p>
        <Link href={`/events/create?edit=${event.slug}`}>
          <Button variant="outline" size="sm" className="gap-1.5">
            <ExternalLink className="h-3.5 w-3.5" />
            Edit Event Details
          </Button>
        </Link>
      </div>

      {/* Ticket sale deadline */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-xs">
        <h2 className="mb-1 text-sm font-semibold text-foreground">Ticket Sale Deadline</h2>
        <p className="text-xs text-muted-foreground mb-4">Extend or modify when ticket sales close.</p>
        <div className="flex items-center gap-2">
          <input
            type="datetime-local"
            value={newDeadline}
            onChange={(e) => setNewDeadline(e.target.value)}
            className="flex-1 rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <Button
            variant="gradient"
            size="sm"
            onClick={() => extendDeadline.mutate()}
            loading={extendDeadline.isPending}
            disabled={!newDeadline}
          >
            Save
          </Button>
        </div>
      </div>

      {/* Danger zone */}
      {event.status !== 'CANCELLED' && (
        <div className="rounded-2xl border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 p-5">
          <h2 className="mb-1 text-sm font-semibold text-red-700 dark:text-red-400">Danger Zone</h2>
          <p className="text-xs text-red-600 dark:text-red-500 mb-4">
            Cancelling this event notifies all attendees and enters a 72-hour dispute window before staked funds are released.
          </p>
          <Button
            variant="destructive"
            size="sm"
            className="gap-1.5"
            onClick={onCancel}
            loading={cancelling}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            Cancel Event
          </Button>
        </div>
      )}
    </motion.div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function EventManagePage() {
  const params = useParams()
  const slug = params.slug as string
  const router = useRouter()
  const qc = useQueryClient()
  const { isAuthenticated } = useAuthStore()

  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [showPublishModal, setShowPublishModal] = useState(false)
  const { state: publishState, publish, reset: resetPublish, stepLabel } = usePublishEvent()

  useEffect(() => {
    if (!isAuthenticated) router.push('/connect')
  }, [isAuthenticated, router])

  const { data, isLoading } = useQuery({
    queryKey: ['event-management', slug],
    queryFn: () => api.get<ManagementData>(`/events/${slug}/management`),
    enabled: isAuthenticated,
    refetchInterval: 30_000,
  })

  const cancelEvent = useMutation({
    mutationFn: () => api.post(`/events/${data!.event.id}/cancel`),
    onSuccess: () => {
      toast.success('Event cancelled')
      qc.invalidateQueries({ queryKey: ['event-management', slug] })
      setShowCancelConfirm(false)
    },
    onError: (err: any) => toast.error(err.message ?? 'Failed to cancel'),
  })

  // Loading skeleton
  if (isLoading || !data) {
    return (
      <div className="min-h-screen bg-surface-subtle">
        <Navbar />
        <div className="mx-auto max-w-6xl px-4 py-8 space-y-4">
          <div className="skeleton h-8 w-48 rounded-xl" />
          <div className="skeleton h-24 rounded-2xl" />
          <div className="grid grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-24 rounded-2xl" />)}
          </div>
          <div className="skeleton h-64 rounded-2xl" />
        </div>
      </div>
    )
  }

  const { event, summary, salesByTier, recentPurchases, attendees } = data
  const statusCfg = STATUS_CONFIG[event.status] ?? STATUS_CONFIG.DRAFT

  return (
    <div className="min-h-screen bg-surface-subtle">
      <Navbar />

      {/* Page header */}
      <div className="border-b border-border bg-background">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-5">
          {/* Back link */}
          <Link
            href="/organizer"
            className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to dashboard
          </Link>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-4">
              {/* Event thumbnail */}
              <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600">
                {event.bannerUrl && (
                  <img src={event.bannerUrl} alt="" className="h-full w-full object-cover" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl font-bold text-foreground">{event.title}</h1>
                  <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', statusCfg.cls)}>
                    {statusCfg.label}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{formatDate(event.startsAt)}</span>
                  {event.locationCity && (
                    <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{event.locationCity}</span>
                  )}
                  <span className="flex items-center gap-1"><Tag className="h-3.5 w-3.5" />{event.category}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
              <Link href={`/events/${slug}`}>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Eye className="h-3.5 w-3.5" /> View Page
                </Button>
              </Link>
              {(event.status === 'DRAFT' || event.status === 'STAKED') && (
                <Button
                  variant="gradient"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setShowPublishModal(true)}
                  disabled={publishState.step !== 'idle' && publishState.step !== 'error' && publishState.step !== 'done'}
                >
                  <Zap className="h-3.5 w-3.5" /> Publish on Stellar
                </Button>
              )}
              {event.status !== 'DRAFT' && (
                <Link href={`/scanner/${event.id}`}>
                  <Button variant="gradient" size="sm" className="gap-1.5">
                    <QrCode className="h-3.5 w-3.5" /> QR Scanner
                  </Button>
                </Link>
              )}
            </div>

            {/* Publish modal */}
            {showPublishModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => { if (publishState.step === 'idle' || publishState.step === 'error') { setShowPublishModal(false); resetPublish() } }}>
                <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
                  <h2 className="text-lg font-bold mb-1">Publish "{event.title}"</h2>
                  <p className="text-sm text-muted-foreground mb-5">This stakes XLM and registers your event on the Stellar blockchain.</p>

                  {publishState.step === 'idle' && (
                    <div className="space-y-4">
                      <div className="rounded-xl border border-violet-200 bg-violet-50 dark:border-violet-800 dark:bg-violet-950/20 p-4 text-sm text-violet-700 dark:text-violet-300">
                        <p className="font-semibold mb-1.5">What happens:</p>
                        <ol className="space-y-1 list-decimal list-inside text-xs text-violet-600/80 dark:text-violet-400">
                          <li>Stake XLM payment — sign in Freighter</li>
                          <li>Register event on EventFactory contract — sign in Freighter</li>
                          <li>Event goes ACTIVE and appears in public discovery</li>
                        </ol>
                      </div>
                      <div className="flex gap-3">
                        <Button variant="outline" className="flex-1" onClick={() => { setShowPublishModal(false); resetPublish() }}>Cancel</Button>
                        <Button variant="gradient" className="flex-1 gap-2" onClick={() => publish(event.id, slug)}>
                          <Zap className="h-4 w-4" /> Stake & Publish
                        </Button>
                      </div>
                    </div>
                  )}

                  {publishState.step !== 'idle' && publishState.step !== 'done' && publishState.step !== 'error' && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
                        <Loader2 className="h-4 w-4 animate-spin text-primary flex-shrink-0" />
                        <div>
                          <p className="text-sm font-semibold text-primary">{stepLabel}</p>
                          {(publishState.step === 'awaiting-stake-signature' || publishState.step === 'awaiting-register-signature') && (
                            <p className="text-xs text-muted-foreground mt-0.5">Check your Freighter extension</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {publishState.step === 'error' && (
                    <div className="space-y-3">
                      <div className="rounded-xl border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20 p-3 text-sm text-red-700 dark:text-red-400">{publishState.error}</div>
                      <div className="flex gap-3">
                        <Button variant="outline" className="flex-1" onClick={() => { setShowPublishModal(false); resetPublish() }}>Close</Button>
                        <Button variant="gradient" className="flex-1 gap-2" onClick={() => { resetPublish(); publish(event.id, slug) }}>
                          <Zap className="h-4 w-4" /> Retry
                        </Button>
                      </div>
                    </div>
                  )}

                  {publishState.step === 'done' && (
                    <div className="text-center space-y-3">
                      <CheckCircle className="h-12 w-12 text-emerald-500 mx-auto" />
                      <p className="font-semibold text-foreground">Event is live on Stellar!</p>
                      <p className="text-xs text-muted-foreground">On-chain ID: #{publishState.onChainEventId}</p>
                      <Button variant="gradient" className="w-full gap-2" onClick={() => { setShowPublishModal(false); resetPublish(); qc.invalidateQueries({ queryKey: ['event-management', slug] }) }}>
                        <CheckCircle className="h-4 w-4" /> Done
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="mt-5 flex gap-1 overflow-x-auto">
            {tabList.map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-all whitespace-nowrap',
                    activeTab === tab.id
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
        <AnimatePresence mode="wait">
          {activeTab === 'overview' && (
            <OverviewTab key="overview" data={data} />
          )}
          {activeTab === 'attendees' && (
            <AttendeesTab key="attendees" attendees={attendees} />
          )}
          {activeTab === 'checkins' && (
            <CheckinsTab key="checkins" attendees={attendees} summary={summary} />
          )}
          {activeTab === 'revenue' && (
            <RevenueTab key="revenue" data={data} />
          )}
          {activeTab === 'settings' && (
            <SettingsTab
              key="settings"
              event={event}
              onCancel={() => setShowCancelConfirm(true)}
              cancelling={cancelEvent.isPending}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Cancel confirmation dialog */}
      <AnimatePresence>
        {showCancelConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
            onClick={(e) => e.target === e.currentTarget && setShowCancelConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-sm rounded-2xl bg-card border border-border p-6 shadow-2xl"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-950">
                <AlertTriangle className="h-6 w-6 text-red-500" />
              </div>
              <h3 className="mb-2 text-lg font-bold text-foreground">Cancel this event?</h3>
              <p className="mb-6 text-sm text-muted-foreground">
                This action cannot be undone. All attendees will be notified and staked funds enter a 72-hour dispute window before release.
              </p>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowCancelConfirm(false)}
                >
                  Keep Event
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={() => cancelEvent.mutate()}
                  loading={cancelEvent.isPending}
                >
                  Cancel Event
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
