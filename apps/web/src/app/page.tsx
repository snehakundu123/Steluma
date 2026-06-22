import Link from 'next/link'
import { Suspense } from 'react'
import { ArrowRight, Shield, Zap, Star, Users, Lock, Sparkles, ChevronRight, TrendingUp, Globe, Award } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Navbar } from '@/components/layout/navbar'
import { Footer } from '@/components/layout/footer'
import { EventCardSkeleton } from '@/components/shared/event-card'
import { StatsCounter } from '@/components/shared/stats-counter'
import { TrendingEventsSection } from './landing/trending-events'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

async function getStats() {
  try {
    const res = await fetch(`${API}/api/v1/stats`, { next: { revalidate: 60 } })
    if (!res.ok) return null
    return res.json() as Promise<{ events: number; tickets: number; badges: number; organizers: number }>
  } catch {
    return null
  }
}

const features = [
  {
    icon: Shield,
    title: 'Organizer Staking',
    desc: 'Every organizer stakes XLM before publishing. Bad actors lose their stake. Real accountability, blockchain-enforced.',
    color: 'from-violet-500 to-indigo-600',
    light: 'bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-400',
  },
  {
    icon: Zap,
    title: 'NFT Tickets',
    desc: 'Lazy-minted Soroban NFTs. Real ownership in your wallet — trade, transfer, or prove attendance forever.',
    color: 'from-amber-500 to-orange-600',
    light: 'bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400',
  },
  {
    icon: Lock,
    title: 'Fraud-Proof QR',
    desc: 'Dynamic rotating QR codes signed with ED25519. Screenshots are useless. Every scan is authenticated on-chain.',
    color: 'from-rose-500 to-pink-600',
    light: 'bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-400',
  },
  {
    icon: Award,
    title: 'Attendance Badges',
    desc: 'Soulbound NFT badges minted at check-in. Your attendance history — permanent, verifiable, non-transferable.',
    color: 'from-emerald-500 to-teal-600',
    light: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400',
  },
  {
    icon: Users,
    title: 'Reputation System',
    desc: 'Organizer trust tiers, verified badges, event history, and community ratings — like Airbnb hosts for events.',
    color: 'from-blue-500 to-cyan-600',
    light: 'bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400',
  },
  {
    icon: Globe,
    title: 'Resale Marketplace',
    desc: 'List tickets for resale with on-chain royalties. Organizers earn on every secondary sale. Full price transparency.',
    color: 'from-purple-500 to-violet-600',
    light: 'bg-purple-50 text-purple-600 dark:bg-purple-950 dark:text-purple-400',
  },
]

const testimonials = [
  {
    name: 'Sarah Chen',
    role: 'Event Organizer',
    avatar: 'SC',
    quote: "Steluma completely changed how I run events. No more Eventbrite fees eating my margins, and attendees actually own their tickets.",
  },
  {
    name: 'Marcus Johnson',
    role: 'Conference Attendee',
    quote: "I resold my ticket for 2x and the organizer got a cut automatically. That's how it should work everywhere.",
    avatar: 'MJ',
  },
  {
    name: 'Priya Patel',
    role: 'Community Lead',
    quote: "The attendance badges are amazing — my community members can finally prove their event history publicly.",
    avatar: 'PP',
  },
]

const howItWorks = [
  {
    step: '01',
    title: 'Discover Events',
    desc: 'Browse trending events, filter by location or category, see verified organizer profiles.',
  },
  {
    step: '02',
    title: 'Connect Your Wallet',
    desc: 'One-click Freighter wallet connection. No seed phrases, no complex setup. It just works.',
  },
  {
    step: '03',
    title: 'Purchase Your Ticket',
    desc: 'Smooth checkout experience. Your NFT ticket lands in your wallet instantly after payment.',
  },
  {
    step: '04',
    title: 'Attend & Earn Badge',
    desc: "Check in with your dynamic QR code. Receive a soulbound attendance badge automatically.",
  },
]

export default async function HomePage() {
  const liveStats = await getStats()

  const stats = [
    { label: 'Events Created', value: liveStats?.events ?? 0, suffix: '+' },
    { label: 'Tickets Issued', value: liveStats?.tickets ?? 0, suffix: '+' },
    { label: 'Organizers', value: liveStats?.organizers ?? 0 },
    { label: 'Attendance Badges', value: liveStats?.badges ?? 0, suffix: '+' },
  ]

  return (
    <>
      <Navbar />
      <main className="min-h-screen overflow-x-hidden">
        {/* ===== HERO ===== */}
        <section className="relative min-h-[92vh] flex items-center overflow-hidden bg-[#06070D]">
          {/* Background mesh */}
          <div className="absolute inset-0">
            <div className="absolute top-0 left-1/4 h-[600px] w-[600px] rounded-full bg-violet-600/15 blur-[120px]" />
            <div className="absolute bottom-0 right-1/4 h-[500px] w-[500px] rounded-full bg-indigo-600/10 blur-[100px]" />
            <div className="absolute top-1/3 right-0 h-[400px] w-[400px] rounded-full bg-purple-800/10 blur-[80px]" />
          </div>

          {/* Grid pattern */}
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
              backgroundSize: '60px 60px',
            }}
          />

          <div className="relative z-10 mx-auto w-full max-w-7xl px-4 sm:px-6 py-24 lg:py-32">
            <div className="max-w-4xl">
              {/* Eyebrow */}
              <div className="mb-8 inline-flex items-center gap-2.5 rounded-full border border-white/10 bg-white/5 px-4 py-2 backdrop-blur-sm">
                <span className="flex h-2 w-2 shrink-0">
                  <span className="absolute inline-flex h-2 w-2 rounded-full bg-emerald-400 opacity-75 animate-ping" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                <span className="text-sm font-medium text-white/80">
                  Built on Stellar · Powered by Soroban Smart Contracts
                </span>
              </div>

              {/* Headline */}
              <h1 className="text-5xl font-bold leading-[1.08] tracking-tight text-white sm:text-6xl lg:text-7xl xl:text-8xl">
                The future of
                <span className="block">
                  <span className="bg-gradient-to-r from-violet-400 via-purple-400 to-indigo-400 bg-clip-text text-transparent">
                    event hosting
                  </span>
                </span>
                is here.
              </h1>

              {/* Subhead */}
              <p className="mt-6 max-w-2xl text-lg text-white/60 leading-relaxed sm:text-xl">
                NFT tickets that attendees actually own. Organizer accountability through staking.
                Attendance badges that last forever. All built on Stellar blockchain — invisible to users.
              </p>

              {/* CTAs */}
              <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link href="/events">
                  <Button
                    size="lg"
                    className="gap-2 bg-white text-gray-900 font-semibold hover:bg-white/90 shadow-xl shadow-white/10 h-12 px-6 text-base"
                  >
                    Explore Events <ArrowRight className="h-4.5 w-4.5" />
                  </Button>
                </Link>
                <Link href="/events/create">
                  <Button
                    size="lg"
                    variant="outline"
                    className="h-12 px-6 text-base font-semibold border-white/20 text-white hover:bg-white/10 hover:border-white/30"
                  >
                    Host an Event
                  </Button>
                </Link>
              </div>

              {/* Trust signals */}
              <div className="mt-10 flex flex-wrap items-center gap-6">
                {[
                  { icon: Shield, text: 'Organizer staking' },
                  { icon: Lock, text: 'Fraud-proof QR' },
                  { icon: Award, text: 'Soulbound badges' },
                ].map(({ icon: Icon, text }) => (
                  <div key={text} className="flex items-center gap-2 text-sm text-white/50">
                    <Icon className="h-4 w-4 text-violet-400" />
                    {text}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Scroll indicator */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-white/30">
            <span className="text-xs tracking-wider uppercase">Scroll</span>
            <div className="h-8 w-px bg-gradient-to-b from-white/30 to-transparent" />
          </div>
        </section>

        {/* ===== STATS ===== */}
        <section className="border-y border-border bg-surface-subtle py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
              {stats.map((stat) => (
                <StatsCounter
                  key={stat.label}
                  value={stat.value}
                  label={stat.label}
                  suffix={stat.suffix}
                  valueClassName="text-3xl sm:text-4xl font-bold text-foreground"
                  labelClassName="text-sm text-muted-foreground mt-1"
                />
              ))}
            </div>
          </div>
        </section>

        {/* ===== TRENDING EVENTS ===== */}
        <section className="py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="mb-10 flex items-end justify-between">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-primary">
                  <TrendingUp className="h-4 w-4" />
                  Trending right now
                </div>
                <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                  Happening soon
                </h2>
              </div>
              <Link href="/events" className="hidden items-center gap-1 text-sm font-medium text-primary hover:underline sm:flex">
                View all <ChevronRight className="h-4 w-4" />
              </Link>
            </div>

            <Suspense fallback={
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => <EventCardSkeleton key={i} />)}
              </div>
            }>
              <TrendingEventsSection />
            </Suspense>

            <div className="mt-8 text-center sm:hidden">
              <Link href="/events">
                <Button variant="outline" className="gap-2">
                  View all events <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* ===== HOW IT WORKS ===== */}
        <section className="py-16 sm:py-24 bg-surface-subtle">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="mb-12 text-center">
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Simple as booking a flight
              </h2>
              <p className="mt-4 text-base text-muted-foreground max-w-lg mx-auto">
                World-class experience on top. Blockchain trust and ownership underneath.
              </p>
            </div>

            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
              {howItWorks.map((step, i) => (
                <div key={step.step} className="relative">
                  {i < howItWorks.length - 1 && (
                    <div className="absolute top-6 left-[calc(50%+2rem)] hidden h-px w-[calc(100%-4rem)] bg-gradient-to-r from-border to-transparent lg:block" />
                  )}
                  <div className="relative flex flex-col items-start">
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-brand text-white font-bold text-sm shadow-violet">
                      {step.step}
                    </div>
                    <h3 className="mb-2 text-base font-semibold text-foreground">{step.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ===== FEATURES ===== */}
        <section className="py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="mb-12 max-w-2xl">
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Built different.{' '}
                <span className="bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
                  By design.
                </span>
              </h2>
              <p className="mt-4 text-base text-muted-foreground">
                The infrastructure the event industry has been waiting for. Every feature solves a real problem with centralized ticketing.
              </p>
            </div>

            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {features.map((feature, i) => (
                <div
                  key={feature.title}
                  className="group relative rounded-2xl border border-border bg-card p-6 transition-all duration-300 hover:border-primary/20 hover:shadow-lg hover:-translate-y-0.5"
                >
                  <div className={`mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl ${feature.light} transition-all duration-300`}>
                    <feature.icon className="h-5 w-5" />
                  </div>
                  <h3 className="mb-2 text-base font-semibold text-foreground group-hover:text-primary transition-colors">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{feature.desc}</p>

                  {/* Subtle gradient on hover */}
                  <div className="absolute inset-0 rounded-2xl bg-gradient-brand-soft opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ===== TESTIMONIALS ===== */}
        <section className="py-16 sm:py-24 bg-surface-subtle">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="mb-10 text-center">
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Loved by organizers & attendees
              </h2>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
              {testimonials.map((t, i) => (
                <div
                  key={t.name}
                  className="rounded-2xl border border-border bg-card p-6 shadow-sm"
                >
                  <div className="mb-4 flex">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <Star key={j} className="h-4 w-4 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                  <blockquote className="mb-5 text-sm text-foreground/80 leading-relaxed">
                    "{t.quote}"
                  </blockquote>
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-brand text-white text-xs font-bold">
                      {t.avatar}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.role}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ===== CTA ===== */}
        <section className="py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="relative overflow-hidden rounded-3xl bg-[#06070D] px-8 py-16 text-center sm:px-16 sm:py-20">
              {/* BG decorations */}
              <div className="absolute top-0 left-1/4 h-[300px] w-[300px] rounded-full bg-violet-600/20 blur-[80px]" />
              <div className="absolute bottom-0 right-1/4 h-[250px] w-[250px] rounded-full bg-indigo-600/15 blur-[60px]" />

              <div className="relative z-10">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-sm text-white/70">
                  <Sparkles className="h-4 w-4 text-violet-400" />
                  Free to get started
                </div>
                <h2 className="text-3xl font-bold text-white sm:text-4xl lg:text-5xl">
                  Ready to host your
                  <br />
                  <span className="bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
                    next event?
                  </span>
                </h2>
                <p className="mx-auto mt-4 max-w-lg text-base text-white/60">
                  Connect your Freighter wallet and start exploring events or create your own in minutes.
                  No fees until your event sells tickets.
                </p>
                <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                  <Link href="/connect">
                    <Button
                      size="lg"
                      className="h-12 gap-2 bg-white px-8 text-gray-900 font-semibold hover:bg-white/90 shadow-xl"
                    >
                      Connect Wallet <ArrowRight className="h-4.5 w-4.5" />
                    </Button>
                  </Link>
                  <Link href="/events">
                    <Button
                      size="lg"
                      variant="outline"
                      className="h-12 gap-2 border-white/20 px-8 text-white hover:bg-white/10"
                    >
                      Browse Events
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
