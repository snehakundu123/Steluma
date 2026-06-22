import { EventCard } from '@/components/shared/event-card'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

async function getTrendingEvents() {
  try {
    const res = await fetch(`${API}/api/v1/events?sort=trending&limit=4`, {
      next: { revalidate: 30 },
    })
    if (!res.ok) return []
    const data = await res.json()
    return data.data ?? []
  } catch {
    return []
  }
}

export async function TrendingEventsSection() {
  const events = await getTrendingEvents()

  if (events.length === 0) {
    return (
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {/* Placeholder cards when no events yet */}
        {Array.from({ length: 4 }).map((_, i) => (
          <PlaceholderEventCard key={i} index={i} />
        ))}
      </div>
    )
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {events.map((event: any, i: number) => (
        <EventCard key={event.id} event={event} index={i} />
      ))}
    </div>
  )
}

const placeholders = [
  {
    title: 'Web3 Builders Summit 2025',
    category: 'CONFERENCE',
    location: 'San Francisco, CA',
    date: 'Mar 15, 2025',
    price: '50 XLM',
    sold: 72,
    gradient: 'from-violet-500 via-purple-600 to-indigo-700',
    emoji: '🎤',
  },
  {
    title: 'Stellar Hackathon: Spring Edition',
    category: 'HACKATHON',
    location: 'Online',
    date: 'Mar 22, 2025',
    price: 'Free',
    sold: 45,
    gradient: 'from-emerald-500 via-teal-500 to-cyan-600',
    emoji: '💻',
  },
  {
    title: 'DeFi Networking Night',
    category: 'NETWORKING',
    location: 'New York, NY',
    date: 'Apr 5, 2025',
    price: '25 XLM',
    sold: 88,
    gradient: 'from-blue-500 via-indigo-500 to-violet-600',
    emoji: '🌐',
  },
  {
    title: 'Token2049 Pre-Party',
    category: 'FESTIVAL',
    location: 'Singapore',
    date: 'Apr 18, 2025',
    price: '100 XLM',
    sold: 95,
    gradient: 'from-orange-500 via-pink-500 to-rose-600',
    emoji: '🎉',
  },
]

function PlaceholderEventCard({ index }: { index: number }) {
  const p = placeholders[index]
  if (!p) return null

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className={`relative h-44 bg-gradient-to-br ${p.gradient} flex items-center justify-center text-5xl`}>
        {p.emoji}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute left-3 top-3">
          <span className="rounded-full bg-black/40 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-md">
            {p.emoji} {p.category}
          </span>
        </div>
        <div className="absolute bottom-3 left-3">
          <span className="rounded-full bg-black/40 px-2.5 py-1 text-xs text-white backdrop-blur-md">
            📅 {p.date}
          </span>
        </div>
      </div>
      <div className="p-4">
        <h3 className="font-semibold text-foreground line-clamp-2">{p.title}</h3>
        <p className="mt-1.5 text-xs text-muted-foreground">📍 {p.location}</p>
        <div className="mt-3">
          <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${p.sold}%` }}
            />
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <p className={`text-base font-bold ${p.price === 'Free' ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'}`}>
            {p.price}
          </p>
          <span className="text-xs text-muted-foreground">{p.sold}% sold</span>
        </div>
      </div>
    </div>
  )
}
