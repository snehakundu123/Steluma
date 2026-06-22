import { prisma } from '../lib/prisma.js'
import { redis, KEYS } from '../lib/redis.js'
import { invokeContract, u64ToScVal, addressToScVal, bytesToScVal, boolToScVal } from '../lib/stellar.js'
import { env } from '../config/env.js'
import { logger } from '../lib/logger.js'
import * as StellarSdk from '@stellar/stellar-sdk'
import crypto from 'crypto'
import type { EventFilters } from '@steluma/types'

function generateSlug(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 60) +
    '-' +
    crypto.randomBytes(3).toString('hex')
  )
}

function computeStakeRequired(
  tiers: Array<{ price: number; totalSupply: number }>,
  trustTier: string,
): number {
  const estimatedRevenue = tiers.reduce((sum, t) => sum + t.price * t.totalSupply, 0)
  const multipliers: Record<string, number> = {
    NEW: 0.15,
    VERIFIED: 0.1,
    TRUSTED: 0.05,
    PARTNER: 0.02,
  }
  const multiplier = multipliers[trustTier] ?? 0.15
  const floor = 100
  return Math.max(floor, estimatedRevenue * multiplier)
}

export async function createEvent(
  organizerId: string,
  data: {
    title: string
    description: string
    category: string
    locationType: string
    locationAddress?: string
    locationCity?: string
    locationCountry?: string
    locationLat?: number
    locationLng?: number
    virtualLink?: string
    startsAt: Date
    endsAt: Date
    timezone: string
    maxResalePrice?: number
    royaltyBps?: number
    refundPolicy?: string
    tags?: string[]
    ticketTiers: Array<{
      name: string
      description?: string
      price: number
      priceAsset?: string
      totalSupply: number
      isTransferable?: boolean
      maxPerWallet?: number
      saleStartsAt?: Date
      saleEndsAt?: Date
      perks?: string[]
      badgeType?: string
    }>
  },
) {
  const organizer = await prisma.organizerProfile.findUnique({
    where: { userId: organizerId },
  })
  if (!organizer) throw new Error('ORGANIZER_NOT_FOUND')

  const stakeRequired = computeStakeRequired(
    data.ticketTiers.map((t) => ({ price: t.price, totalSupply: t.totalSupply })),
    organizer.trustTier,
  )

  const totalTickets = data.ticketTiers.reduce((s, t) => s + t.totalSupply, 0)
  const slug = generateSlug(data.title)

  const event = await prisma.event.create({
    data: {
      slug,
      organizerId: organizer.id,
      title: data.title,
      description: data.description,
      category: data.category as any,
      locationType: data.locationType as any,
      locationAddress: data.locationAddress,
      locationCity: data.locationCity,
      locationCountry: data.locationCountry,
      locationLat: data.locationLat,
      locationLng: data.locationLng,
      virtualLink: data.virtualLink,
      startsAt: data.startsAt,
      endsAt: data.endsAt,
      timezone: data.timezone,
      maxResalePrice: data.maxResalePrice,
      royaltyBps: data.royaltyBps ?? 500,
      refundPolicy: data.refundPolicy,
      tags: data.tags ?? [],
      stakeRequired,
      totalTickets,
      status: 'DRAFT',
      visibility: 'PUBLIC',
      ticketTiers: {
        create: data.ticketTiers.map((tier, i) => ({
          name: tier.name,
          description: tier.description,
          price: tier.price,
          priceAsset: tier.priceAsset ?? 'XLM',
          totalSupply: tier.totalSupply,
          isTransferable: tier.isTransferable ?? true,
          maxPerWallet: tier.maxPerWallet ?? 10,
          saleStartsAt: tier.saleStartsAt,
          saleEndsAt: tier.saleEndsAt,
          perks: tier.perks ?? [],
          badgeType: (tier.badgeType as any) ?? 'ATTENDEE',
          sortOrder: i,
        })),
      },
    },
    include: { ticketTiers: true, organizer: { include: { user: true } } },
  })

  return {
    ...event,
    onChainEventId: event.onChainEventId?.toString() ?? null,
    totalRevenue: event.totalRevenue?.toString() ?? '0',
    maxResalePrice: event.maxResalePrice?.toString() ?? null,
    stakeRequired: event.stakeRequired?.toString() ?? null,
    ticketTiers: event.ticketTiers.map((t) => ({ ...t, price: t.price?.toString() })),
    organizer: event.organizer ? {
      ...event.organizer,
      totalRevenue: event.organizer.totalRevenue?.toString() ?? '0',
      averageRating: Number(event.organizer.averageRating ?? 0),
    } : undefined,
  }
}

export async function publishEvent(
  eventId: string,
  organizerId: string,
  stakeTxHash: string,
  onChainEventId?: bigint | null,
) {
  const event = await prisma.event.findFirst({
    where: { id: eventId, organizer: { userId: organizerId } },
    include: { organizer: true },
  })
  if (!event) throw new Error('EVENT_NOT_FOUND')
  // Idempotent: if already published, return the existing event
  if (event.status === 'ACTIVE') return event
  if (event.status !== 'DRAFT' && event.status !== 'STAKED') throw new Error('INVALID_STATE')

  // Verify stake exists in DB
  const stake = await prisma.organizerStake.findUnique({ where: { eventId } })
  if (!stake || stake.status !== 'STAKED') throw new Error('STAKE_REQUIRED')

  // onChainEventId is provided by the frontend after the organizer signed the
  // EventFactory.create_event transaction themselves (organizer.require_auth())
  logger.info('[Event] publishing', { eventId, onChainEventId: onChainEventId?.toString() })

  const [updated] = await Promise.all([
    prisma.event.update({
      where: { id: eventId },
      data: { status: 'ACTIVE', publishedAt: new Date(), onChainEventId: onChainEventId ?? null },
    }),
    prisma.organizerProfile.update({
      where: { id: event.organizer.id },
      data: { totalEventsHosted: { increment: 1 } },
    }),
  ])

  // Non-critical: don't let a Redis failure block publish
  redis.del(KEYS.eventCache(event.slug)).catch(() => {})

  return updated
}

export async function discoverEvents(filters: EventFilters) {
  const {
    q,
    category,
    status = 'ACTIVE',
    city,
    country,
    priceMin,
    priceMax,
    dateFrom,
    dateTo,
    sort = 'trending',
    page = 1,
    limit = 20,
  } = filters

  const where: any = {
    status,
    visibility: 'PUBLIC',
    deletedAt: null,
  }

  if (category) where.category = category
  if (city) where.locationCity = { contains: city, mode: 'insensitive' }
  if (country) where.locationCountry = country
  if (dateFrom || dateTo) {
    where.startsAt = {}
    if (dateFrom) where.startsAt.gte = new Date(dateFrom)
    if (dateTo) where.startsAt.lte = new Date(dateTo)
  }
  if (q) {
    where.OR = [
      { title: { contains: q, mode: 'insensitive' } },
      { description: { contains: q, mode: 'insensitive' } },
      { tags: { has: q } },
    ]
  }

  const orderBy: any =
    sort === 'trending'
      ? { trendingScore: 'desc' }
      : sort === 'date'
        ? { startsAt: 'asc' }
        : { startsAt: 'asc' }

  const skip = (page - 1) * limit
  const [events, total] = await Promise.all([
    prisma.event.findMany({
      where,
      orderBy,
      skip,
      take: Math.min(limit, 100),
      include: {
        ticketTiers: { where: { isVisible: true }, orderBy: { price: 'asc' }, take: 1 },
        organizer: true,
      },
    }),
    prisma.event.count({ where }),
  ])

  return {
    data: events.map((e) => ({
      ...e,
      // Serialize BigInt fields so JSON.stringify / Fastify doesn't crash
      onChainEventId: e.onChainEventId?.toString() ?? null,
      totalRevenue: e.totalRevenue?.toString() ?? '0',
      maxResalePrice: e.maxResalePrice?.toString() ?? null,
      stakeRequired: e.stakeRequired?.toString() ?? null,
      ticketTiers: e.ticketTiers.map((t) => ({ ...t, price: t.price?.toString() })),
      organizer: e.organizer ? {
        ...e.organizer,
        totalRevenue: e.organizer.totalRevenue?.toString() ?? '0',
        averageRating: Number(e.organizer.averageRating ?? 0),
      } : undefined,
      soldPercentage: e.totalTickets > 0 ? ((e.ticketsSold / e.totalTickets) * 100).toFixed(1) : '0',
      priceFrom: e.ticketTiers[0]?.price?.toString() ?? null,
      priceAsset: e.ticketTiers[0]?.priceAsset ?? 'XLM',
    })),
    meta: {
      page,
      limit,
      total,
      hasNextPage: skip + events.length < total,
      hasPrevPage: page > 1,
    },
  }
}

export async function getEventBySlug(slug: string) {
  const cached = await redis.get(KEYS.eventCache(slug))
  if (cached) {
    try {
      return JSON.parse(cached)
    } catch {}
  }

  const event = await prisma.event.findUnique({
    where: { slug, deletedAt: null },
    include: {
      ticketTiers: { where: { isVisible: true }, orderBy: { sortOrder: 'asc' } },
      organizer: { include: { user: true } },
      stake: true,
    },
  })

  if (!event) return null

  // Increment view count asynchronously
  prisma.event.update({ where: { id: event.id }, data: { viewCount: { increment: 1 } } }).catch(() => {})

  const result = {
    ...event,
    // Serialize BigInt fields before JSON stringification (for Redis cache and response)
    onChainEventId: event.onChainEventId?.toString() ?? null,
    totalRevenue: event.totalRevenue?.toString() ?? '0',
    maxResalePrice: event.maxResalePrice?.toString() ?? null,
    stakeRequired: event.stakeRequired?.toString() ?? null,
    ticketTiers: event.ticketTiers.map((t) => ({
      ...t,
      price: t.price?.toString(),
      available: t.totalSupply - t.sold,
    })),
    organizer: event.organizer ? {
      ...event.organizer,
      totalRevenue: event.organizer.totalRevenue?.toString() ?? '0',
      averageRating: Number(event.organizer.averageRating ?? 0),
    } : undefined,
    stake: event.stake ? {
      ...event.stake,
      amount: event.stake.amount?.toString(),
    } : undefined,
  }

  await redis.setex(KEYS.eventCache(slug), 60, JSON.stringify(result))
  return result
}
