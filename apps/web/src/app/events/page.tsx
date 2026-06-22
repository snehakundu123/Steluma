'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, TrendingUp, Calendar, DollarSign, Clock, Grid3x3, List, X,
} from 'lucide-react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Navbar } from '@/components/layout/navbar'
import { EventCard, EventCardSkeleton } from '@/components/shared/event-card'
import { cn } from '@/lib/utils'

const CATEGORIES = [
  { value: 'All', label: 'All Events', emoji: '✨' },
  { value: 'CONFERENCE', label: 'Conference', emoji: '🎤' },
  { value: 'CONCERT', label: 'Concert', emoji: '🎵' },
  { value: 'HACKATHON', label: 'Hackathon', emoji: '💻' },
  { value: 'WORKSHOP', label: 'Workshop', emoji: '🛠️' },
  { value: 'NETWORKING', label: 'Networking', emoji: '🌐' },
  { value: 'WEBINAR', label: 'Webinar', emoji: '📡' },
  { value: 'FESTIVAL', label: 'Festival', emoji: '🎉' },
]

const SORT_OPTIONS = [
  { value: 'trending', label: 'Trending', icon: TrendingUp },
  { value: 'date', label: 'Upcoming', icon: Calendar },
  { value: 'price', label: 'Price: Low', icon: DollarSign },
  { value: 'newest', label: 'Newest', icon: Clock },
]

export default function EventsPage() {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [sort, setSort] = useState('trending')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [pendingSearch, setPendingSearch] = useState('')

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['events', search, category, sort],
    queryFn: () => {
      const params = new URLSearchParams({
        sort,
        limit: '24',
        ...(search && { q: search }),
        ...(category !== 'All' && { category }),
      })
      return api.get<{ data: any[]; meta: { total: number } }>(`/events?${params}`)
    },
    placeholderData: (prev) => prev,
  })

  const events = data?.data ?? []
  const total = data?.meta?.total ?? 0
  const hasFilters = search || category !== 'All' || sort !== 'trending'

  const clearFilters = () => {
    setSearch('')
    setPendingSearch('')
    setCategory('All')
    setSort('trending')
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearch(pendingSearch)
  }

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-background">
        {/* Header */}
        <div className="border-b border-border bg-background">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8">
            <div className="mb-6 flex items-start justify-between">
              <div>
                <h1 className="text-2xl font-bold text-foreground sm:text-3xl">Discover Events</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {isLoading
                    ? 'Loading events…'
                    : `${total.toLocaleString()} events available`}
                </p>
              </div>
              <Link href="/events/create">
                <Button variant="gradient" size="sm" className="h-9 gap-1.5 font-semibold shrink-0">
                  + Create Event
                </Button>
              </Link>
            </div>

            {/* Search bar */}
            <form onSubmit={handleSearch} className="relative">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search events, organizers, cities…"
                value={pendingSearch}
                onChange={(e) => {
                  setPendingSearch(e.target.value)
                  if (!e.target.value) setSearch('')
                }}
                className={cn(
                  'w-full rounded-xl border border-border bg-background py-3 pl-11 pr-12 text-sm',
                  'placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20',
                  'transition-all duration-150',
                )}
              />
              {pendingSearch && (
                <button
                  type="button"
                  onClick={() => { setPendingSearch(''); setSearch('') }}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </form>

            {/* Category pills */}
            <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  onClick={() => setCategory(cat.value)}
                  className={cn(
                    'flex-shrink-0 flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-all duration-150',
                    category === cat.value
                      ? 'bg-foreground text-background shadow-sm'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground',
                  )}
                >
                  <span>{cat.emoji}</span>
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Sort + view controls */}
          <div className="border-t border-border">
            <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 py-2">
              <div className="flex items-center gap-1">
                <span className="mr-2 hidden text-xs text-muted-foreground sm:inline">Sort:</span>
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setSort(opt.value)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                      sort === opt.value
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                    )}
                  >
                    <opt.icon className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{opt.label}</span>
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                {isFetching && !isLoading && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <div className="h-1.5 w-1.5 animate-live-pulse rounded-full bg-primary" />
                    <span className="hidden sm:inline">Updating…</span>
                  </div>
                )}
                {hasFilters && (
                  <button
                    onClick={clearFilters}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                    Clear
                  </button>
                )}
                <div className="flex items-center rounded-lg border border-border p-0.5">
                  {(['grid', 'list'] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setViewMode(mode)}
                      className={cn(
                        'rounded-md p-1.5 transition-colors',
                        viewMode === mode
                          ? 'bg-foreground text-background'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {mode === 'grid' ? <Grid3x3 className="h-3.5 w-3.5" /> : <List className="h-3.5 w-3.5" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Grid */}
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8">
          <AnimatePresence mode="wait">
            {isLoading ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className={cn(
                  'grid gap-5',
                  viewMode === 'grid'
                    ? 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                    : 'max-w-3xl grid-cols-1',
                )}
              >
                {Array.from({ length: 8 }).map((_, i) => (
                  <EventCardSkeleton key={i} variant={viewMode === 'list' ? 'compact' : 'default'} />
                ))}
              </motion.div>
            ) : events.length === 0 ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="py-24 text-center"
              >
                <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-muted text-4xl">
                  🔍
                </div>
                <h3 className="text-xl font-semibold text-foreground">No events found</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {search ? `No results for "${search}"` : 'No events in this category yet'}
                </p>
                {hasFilters && (
                  <Button variant="outline" className="mt-6 gap-2" onClick={clearFilters}>
                    <X className="h-4 w-4" /> Clear filters
                  </Button>
                )}
              </motion.div>
            ) : (
              <motion.div
                key={`results-${viewMode}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={cn(
                  'grid gap-5',
                  viewMode === 'grid'
                    ? 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                    : 'max-w-3xl grid-cols-1',
                )}
              >
                {events.map((event: any, i: number) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    index={i}
                    variant={viewMode === 'list' ? 'compact' : 'default'}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </>
  )
}
