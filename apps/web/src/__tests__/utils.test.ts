import { describe, it, expect } from 'vitest'
import {
  cn,
  formatXLM,
  formatDate,
  truncateWallet,
  getTrustTierColor,
  relativeTime,
  getCategoryEmoji,
} from '@/lib/utils'

// ── cn (classnames merger) ────────────────────────────────────────────────────

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('deduplicates conflicting tailwind classes', () => {
    const result = cn('p-2', 'p-4')
    expect(result).toBe('p-4')
  })

  it('ignores falsy values', () => {
    expect(cn('foo', false, undefined, null, 'bar')).toBe('foo bar')
  })

  it('handles conditional objects', () => {
    expect(cn({ active: true, inactive: false })).toBe('active')
  })
})

// ── formatXLM ─────────────────────────────────────────────────────────────────

describe('formatXLM', () => {
  it('formats integer numbers with two decimals', () => {
    expect(formatXLM(100)).toBe('100.00')
  })

  it('formats string numbers', () => {
    expect(formatXLM('1234.5')).toBe('1,234.50')
  })

  it('formats zero', () => {
    expect(formatXLM(0)).toBe('0.00')
  })

  it('formats large numbers with commas', () => {
    expect(formatXLM(1000000)).toBe('1,000,000.00')
  })
})

// ── truncateWallet ────────────────────────────────────────────────────────────

describe('truncateWallet', () => {
  const wallet = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGHIJKLMNOP'

  it('truncates with default 6 chars from each end', () => {
    const result = truncateWallet(wallet)
    expect(result).toMatch(/^.{6}\.\.\./)
    expect(result).toMatch(/\.{3}.{6}$/)
    expect(result.length).toBe(15) // 6 + 3 + 6
  })

  it('respects custom char count', () => {
    const result = truncateWallet(wallet, 4)
    expect(result.length).toBe(11) // 4 + 3 + 4
  })

  it('preserves the first and last chars', () => {
    const result = truncateWallet('ABCDE12345FGHIJ', 5)
    expect(result.startsWith('ABCDE')).toBe(true)
    expect(result.endsWith('FGHIJ')).toBe(true)
  })
})

// ── getTrustTierColor ─────────────────────────────────────────────────────────

describe('getTrustTierColor', () => {
  it('returns correct class for VERIFIED tier', () => {
    expect(getTrustTierColor('VERIFIED')).toContain('text-blue-700')
  })

  it('returns correct class for TRUSTED tier', () => {
    expect(getTrustTierColor('TRUSTED')).toContain('text-emerald-700')
  })

  it('returns correct class for PARTNER tier', () => {
    expect(getTrustTierColor('PARTNER')).toContain('text-violet-700')
  })

  it('falls back to gray for unknown tiers', () => {
    expect(getTrustTierColor('UNKNOWN_TIER')).toContain('text-gray-500')
  })

  it('returns class for NEW tier', () => {
    expect(getTrustTierColor('NEW')).toContain('text-gray-500')
  })
})

// ── relativeTime ──────────────────────────────────────────────────────────────

describe('relativeTime', () => {
  it('returns "just now" for very recent dates', () => {
    expect(relativeTime(new Date(Date.now() - 5000))).toBe('just now')
  })

  it('returns minutes for dates less than an hour ago', () => {
    const result = relativeTime(new Date(Date.now() - 5 * 60_000))
    expect(result).toBe('5m ago')
  })

  it('returns hours for dates less than a day ago', () => {
    const result = relativeTime(new Date(Date.now() - 3 * 3_600_000))
    expect(result).toBe('3h ago')
  })

  it('returns days for dates more than a day ago', () => {
    const result = relativeTime(new Date(Date.now() - 2 * 86_400_000))
    expect(result).toBe('2d ago')
  })

  it('accepts string date input', () => {
    const result = relativeTime(new Date(Date.now() - 500).toISOString())
    expect(result).toBe('just now')
  })
})

// ── formatDate ────────────────────────────────────────────────────────────────

describe('formatDate', () => {
  it('formats a date string', () => {
    const result = formatDate('2026-01-15T00:00:00Z')
    expect(result).toContain('Jan')
    expect(result).toContain('15')
    expect(result).toContain('2026')
  })

  it('accepts a Date object', () => {
    const result = formatDate(new Date('2026-06-23T00:00:00Z'))
    expect(result).toContain('2026')
  })
})

// ── getCategoryEmoji ──────────────────────────────────────────────────────────

describe('getCategoryEmoji', () => {
  it('returns correct emoji for known categories', () => {
    expect(getCategoryEmoji('CONFERENCE')).toBe('🎤')
    expect(getCategoryEmoji('CONCERT')).toBe('🎵')
    expect(getCategoryEmoji('HACKATHON')).toBe('💻')
  })

  it('falls back to 📌 for unknown categories', () => {
    expect(getCategoryEmoji('UNKNOWN')).toBe('📌')
  })
})
