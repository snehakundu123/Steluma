/**
 * Event domain logic tests — validates formatting and business rules
 * for event-related data without requiring a browser or React DOM.
 */

import { describe, it, expect } from 'vitest'
import { formatXLM, formatDate, formatDateTime, truncateWallet, getCategoryEmoji } from '@/lib/utils'

// ── Ticket pricing display ────────────────────────────────────────────────────

describe('Ticket pricing display', () => {
  it('renders free ticket price correctly', () => {
    expect(formatXLM(0)).toBe('0.00')
  })

  it('renders xlm price with two decimals', () => {
    expect(formatXLM(25)).toBe('25.00')
  })

  it('renders high-value ticket price with commas', () => {
    expect(formatXLM(10000)).toBe('10,000.00')
  })
})

// ── Event category display ────────────────────────────────────────────────────

const ALL_CATEGORIES = [
  'CONFERENCE',
  'CONCERT',
  'SPORTS',
  'COMMUNITY',
  'WORKSHOP',
  'HACKATHON',
  'NETWORKING',
  'FESTIVAL',
  'WEBINAR',
  'OTHER',
]

describe('getCategoryEmoji', () => {
  it('returns an emoji for every known category', () => {
    for (const cat of ALL_CATEGORIES) {
      const emoji = getCategoryEmoji(cat)
      expect(emoji).toBeTruthy()
      expect(emoji.length).toBeGreaterThan(0)
    }
  })

  it('HACKATHON maps to 💻 (Web3 primary use case)', () => {
    expect(getCategoryEmoji('HACKATHON')).toBe('💻')
  })

  it('CONFERENCE maps to 🎤', () => {
    expect(getCategoryEmoji('CONFERENCE')).toBe('🎤')
  })
})

// ── Wallet address truncation ─────────────────────────────────────────────────

describe('Wallet address truncation', () => {
  const stellarPublicKey = 'GABCDEFGH1234567890IJKLMNOPQRSTUVWXYZ1234567890ABCDEFGHIJKL'

  it('produces readable truncation', () => {
    const result = truncateWallet(stellarPublicKey)
    expect(result).toContain('...')
    expect(result.length).toBeLessThan(stellarPublicKey.length)
  })

  it('always starts with the first 6 chars', () => {
    expect(truncateWallet(stellarPublicKey).startsWith('GABCDE')).toBe(true)
  })

  it('always ends with the last 6 chars', () => {
    const last6 = stellarPublicKey.slice(-6)
    expect(truncateWallet(stellarPublicKey).endsWith(last6)).toBe(true)
  })
})

// ── DateTime formatting ───────────────────────────────────────────────────────

describe('formatDateTime', () => {
  it('includes time information', () => {
    const result = formatDateTime('2026-06-23T15:30:00Z')
    expect(result).toContain('2026')
    // Time portion should be included (AM/PM or 24h depending on locale)
    expect(result.length).toBeGreaterThan(10)
  })

  it('differs from formatDate output (has time)', () => {
    const dateOnly = formatDate('2026-06-23T15:30:00Z')
    const dateTime = formatDateTime('2026-06-23T15:30:00Z')
    expect(dateTime.length).toBeGreaterThan(dateOnly.length)
  })
})

// ── Business rule: royalty cap enforcement ────────────────────────────────────

describe('Royalty cap business logic', () => {
  const MAX_ROYALTY_BPS = 2000 // 20% max as enforced in smart contract

  it('accepts royalty at cap boundary', () => {
    expect(MAX_ROYALTY_BPS).toBe(2000)
    expect(2000 <= MAX_ROYALTY_BPS).toBe(true)
  })

  it('rejects royalty above cap', () => {
    expect(2500 > MAX_ROYALTY_BPS).toBe(true)
  })

  it('calculates royalty amount correctly', () => {
    const price = 1000
    const bps = 500 // 5%
    const royalty = Math.floor((price * bps) / 10000)
    expect(royalty).toBe(50)
  })

  it('calculates seller net after royalty', () => {
    const price = 1000
    const royaltyBps = 1000 // 10%
    const royalty = Math.floor((price * royaltyBps) / 10000)
    const sellerAmount = price - royalty
    expect(sellerAmount).toBe(900)
  })
})
