'use client'

import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  LayoutDashboard, Ticket, BarChart3, Settings, ChevronRight,
  TrendingUp, Users, DollarSign, QrCode, Plus, ArrowUpRight,
  ArrowDownRight, Shield, Clock, CheckCircle2, AlertCircle,
  Calendar, Star, Award, Zap, MoreHorizontal,
} from 'lucide-react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Navbar } from '@/components/layout/navbar'
import { useAuthStore } from '@/store/auth.store'
import { formatDate, formatXLM, getTrustTierColor, cn } from '@/lib/utils'

interface StatCardProps {
  label: string
  value: string | number
  change?: number
  icon: React.ElementType
  color: string
  prefix?: string
  suffix?: string
}

function StatCard({ label, value, change, icon: Icon, color, prefix = '', suffix = '' }: StatCardProps) {
  const isPositive = (change ?? 0) >= 0

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-xs hover:shadow-sm transition-shadow">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <div className={cn('flex h-9 w-9 items-center justify-center rounded-xl', color)}>
          <Icon className="h-4.5 w-4.5" />
        </div>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="text-2xl font-bold tabular-nums text-foreground">
            {prefix}{typeof value === 'number' ? value.toLocaleString() : value}{suffix}
          </p>
        </div>
        {change !== undefined && (
          <div className={cn(
            'flex items-center gap-1 text-xs font-medium mb-0.5',
            isPositive ? 'text-emerald-600' : 'text-red-500',
          )}>
            {isPositive ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
            {Math.abs(change)}% this month
          </div>
        )}
      </div>
    </div>
  )
}

function EventRow({ event }: { event: any }) {
  const soldPercent = event.totalTickets > 0
    ? Math.round((event.ticketsSold / event.totalTickets) * 100)
    : 0

  const statusConfig: Record<string, { label: string; class: string }> = {
    DRAFT: { label: 'Draft', class: 'bg-muted text-muted-foreground' },
    PUBLISHED: { label: 'Live', class: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400' },
    ENDED: { label: 'Ended', class: 'bg-muted text-muted-foreground' },
    CANCELLED: { label: 'Cancelled', class: 'bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400' },
    SOLD_OUT: { label: 'Sold Out', class: 'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-400' },
  }

  const status = statusConfig[event.status] ?? statusConfig.DRAFT

  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 hover:border-primary/20 hover:shadow-sm transition-all">
      <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600">
        {event.bannerUrl && (
          <img src={event.bannerUrl} alt="" className="h-full w-full object-cover" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Link href={`/events/${event.slug}`} className="font-semibold text-sm text-foreground hover:text-primary truncate max-w-[200px]">
            {event.title}
          </Link>
          <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', status.class)}>
            {status.label}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDate(event.startsAt)}</span>
          <span className="flex items-center gap-1"><Users className="h-3 w-3" />{event.ticketsSold}/{event.totalTickets}</span>
        </div>
        <div className="mt-2 h-1 w-full max-w-[120px] overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              'h-full rounded-full',
              soldPercent >= 90 ? 'bg-orange-500' : soldPercent >= 70 ? 'bg-amber-500' : 'bg-primary',
            )}
            style={{ width: `${soldPercent}%` }}
          />
        </div>
      </div>
      <div className="text-right shrink-0 hidden sm:block">
        <p className="text-sm font-bold tabular-nums text-foreground">
          {event.revenue ? `${formatXLM(event.revenue)} XLM` : '—'}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">{soldPercent}% sold</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Link href={`/events/${event.slug}/manage`}>
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
            Manage
          </Button>
        </Link>
        <Link href={`/scanner/${event.id}`}>
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
            <QrCode className="h-3.5 w-3.5" />
          </Button>
        </Link>
      </div>
    </div>
  )
}

function RecentActivity({ activities }: { activities: any[] }) {
  if (!activities?.length) return null

  return (
    <div className="space-y-3">
      {activities.map((a, i) => (
        <div key={i} className="flex items-start gap-3">
          <div className={cn(
            'mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs',
            a.type === 'PURCHASE' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400' :
            a.type === 'CHECKIN' ? 'bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400' :
            'bg-muted text-muted-foreground',
          )}>
            {a.type === 'PURCHASE' ? <Ticket className="h-3.5 w-3.5" /> :
             a.type === 'CHECKIN' ? <CheckCircle2 className="h-3.5 w-3.5" /> :
             <AlertCircle className="h-3.5 w-3.5" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-foreground">
              <span className="font-medium">{a.userName ?? 'Someone'}</span>{' '}
              {a.type === 'PURCHASE' ? 'purchased a ticket to' : 'checked in to'}{' '}
              <span className="font-medium">{a.eventTitle}</span>
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{a.timeAgo}</p>
          </div>
          {a.amount && (
            <span className="text-sm font-semibold text-emerald-600 tabular-nums shrink-0">
              +{formatXLM(a.amount)} XLM
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

export default function OrganizerDashboard() {
  const router = useRouter()
  const { isAuthenticated, user } = useAuthStore()

  useEffect(() => {
    if (!isAuthenticated) router.push('/connect')
  }, [isAuthenticated, router])

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ['organizer', 'dashboard'],
    queryFn: () => api.get<any>('/organizers/me/dashboard'),
    enabled: isAuthenticated,
    refetchInterval: 30_000,
    retry: false,
  })

  const { data: events, isLoading: eventsLoading } = useQuery({
    queryKey: ['organizer', 'events'],
    queryFn: () => api.get<{ data: any[] }>('/organizers/me/events'),
    enabled: isAuthenticated,
    retry: false,
  })

  if (!isAuthenticated) return null

  // Map the real backend dashboard response → the cards' expected shape
  const overview = dashboard?.overview ?? {}
  const reputation = dashboard?.reputation ?? {}
  const allEvents = events?.data ?? []
  const ticketsSold = allEvents.reduce((sum: number, e: any) => sum + (e.ticketsSold ?? 0), 0)
  const totalAttendees = allEvents.reduce((sum: number, e: any) => sum + (e.checkedIn ?? 0), 0)

  const stats = {
    totalRevenue: overview.totalRevenue ?? '0',
    totalTicketsSold: ticketsSold,
    totalAttendees: overview.totalAttendeesServed ?? totalAttendees,
    activeEvents: overview.activeEvents ?? allEvents.filter((e: any) => e.status === 'ACTIVE').length,
    avgRating: undefined as number | undefined,
    totalReviews: 0,
    badgesMinted: totalAttendees,
    // Month-over-month deltas not tracked by backend yet → undefined hides the indicator
    revenueChange: undefined as number | undefined,
    ticketsChange: undefined as number | undefined,
    attendeesChange: undefined as number | undefined,
  }
  const recentEvents = allEvents.slice(0, 5)
  const activities = (reputation.recentHistory ?? []).map((h: any) => ({
    type: 'SYSTEM',
    userName: 'Reputation',
    eventTitle: h.reason,
    timeAgo: new Date(h.createdAt).toLocaleDateString(),
  }))

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-surface-subtle">
        {/* Page header */}
        <div className="border-b border-border bg-background">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={user?.avatarUrl ?? undefined} />
                    <AvatarFallback className="bg-gradient-brand text-white font-bold">
                      {(user?.displayName ?? 'OR').slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h1 className="text-xl font-bold text-foreground">
                      {user?.displayName ? `${user.displayName}'s` : 'Your'} Dashboard
                    </h1>
                    {user?.organizerProfile && (
                      <span className={cn(
                        'text-xs font-semibold rounded-full px-2 py-0.5',
                        getTrustTierColor(user.organizerProfile.trustTier),
                      )}>
                        {user.organizerProfile.trustTier} Organizer
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <div className="live-dot" />
                  Live dashboard
                </div>
                <Link href="/events/create">
                  <Button variant="gradient" size="sm" className="gap-1.5 font-semibold">
                    <Plus className="h-4 w-4" />
                    Create Event
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8">
          {/* Stats grid */}
          <div className="mb-8 grid gap-4 grid-cols-2 lg:grid-cols-4">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="skeleton h-28 rounded-2xl" />
              ))
            ) : (
              <>
                <StatCard
                  label="Total Revenue"
                  value={stats.totalRevenue ? formatXLM(stats.totalRevenue) : '0.00'}
                  suffix=" XLM"
                  change={stats.revenueChange}
                  icon={DollarSign}
                  color="bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
                />
                <StatCard
                  label="Tickets Sold"
                  value={stats.totalTicketsSold ?? 0}
                  change={stats.ticketsChange}
                  icon={Ticket}
                  color="bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400"
                />
                <StatCard
                  label="Total Attendees"
                  value={stats.totalAttendees ?? 0}
                  change={stats.attendeesChange}
                  icon={Users}
                  color="bg-violet-100 text-violet-600 dark:bg-violet-950 dark:text-violet-400"
                />
                <StatCard
                  label="Active Events"
                  value={stats.activeEvents ?? 0}
                  icon={Calendar}
                  color="bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400"
                />
              </>
            )}
          </div>

          {/* Secondary stats row */}
          <div className="mb-8 grid gap-4 grid-cols-3">
            {[
              {
                label: 'Trust Score',
                value: user?.organizerProfile?.reputationScore ? `${user.organizerProfile.reputationScore}/100` : '—',
                icon: Shield,
                desc: `${user?.organizerProfile?.trustTier ?? 'NEW'} tier`,
              },
              {
                label: 'Avg. Rating',
                value: stats.avgRating ? `${stats.avgRating.toFixed(1)} ★` : '—',
                icon: Star,
                desc: `${stats.totalReviews ?? 0} reviews`,
              },
              {
                label: 'Badges Minted',
                value: stats.badgesMinted ?? 0,
                icon: Award,
                desc: 'Attendance badges issued',
              },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl border border-border bg-card p-4 shadow-xs">
                <div className="flex items-center gap-2 mb-2">
                  <s.icon className="h-4 w-4 text-primary" />
                  <span className="text-xs font-medium text-muted-foreground">{s.label}</span>
                </div>
                <p className="text-xl font-bold text-foreground">{s.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{s.desc}</p>
              </div>
            ))}
          </div>

          {/* Events + activity */}
          <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
            {/* My Events */}
            <div>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-foreground">My Events</h2>
                <Link href="/organizer/events" className="flex items-center gap-1 text-sm text-primary hover:underline">
                  View all <ChevronRight className="h-4 w-4" />
                </Link>
              </div>

              {eventsLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="skeleton h-20 rounded-xl" />
                  ))}
                </div>
              ) : recentEvents.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
                  <div className="mb-3 text-4xl">🎉</div>
                  <h3 className="font-semibold text-foreground">No events yet</h3>
                  <p className="mt-1 text-sm text-muted-foreground">Create your first event to get started</p>
                  <Link href="/events/create">
                    <Button className="mt-4 gap-2" variant="gradient">
                      <Plus className="h-4 w-4" /> Create Event
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentEvents.map((event: any) => (
                    <EventRow key={event.id} event={event} />
                  ))}
                </div>
              )}
            </div>

            {/* Recent Activity */}
            <div>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-foreground">Live Activity</h2>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <div className="live-dot" />
                  Realtime
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-card p-5 shadow-xs">
                {activities.length === 0 ? (
                  <div className="py-8 text-center">
                    <div className="mb-3 text-3xl">📊</div>
                    <p className="text-sm text-muted-foreground">Activity will appear here when your events go live</p>
                  </div>
                ) : (
                  <RecentActivity activities={activities} />
                )}
              </div>

              {/* Quick actions */}
              <div className="mt-4 space-y-2">
                <h3 className="text-sm font-semibold text-foreground mb-3">Quick Actions</h3>
                {[
                  { icon: QrCode, label: 'Open Scanner', href: '/scanner', desc: 'Start checking in attendees' },
                  { icon: Shield, label: 'Manage Stake', href: '/organizer/stakes', desc: 'View your trust tier' },
                  { icon: BarChart3, label: 'Analytics', href: '/organizer/analytics', desc: 'Deep event insights' },
                ].map((action) => (
                  <Link key={action.label} href={action.href}>
                    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3.5 hover:border-primary/20 hover:shadow-sm transition-all">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent">
                        <action.icon className="h-4 w-4 text-accent-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground">{action.label}</p>
                        <p className="text-xs text-muted-foreground">{action.desc}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
