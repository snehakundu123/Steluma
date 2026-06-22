/**
 * Scanner Service — Integration-level tests
 * Tests: valid scan, duplicate scan prevention, wrong event, ownership mismatch
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

const mockPrisma = {
  ticket: {
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  checkIn: {
    create: vi.fn(),
    update: vi.fn(),
    findFirst: vi.fn(),
  },
  event: { update: vi.fn() },
  attendanceBadge: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  $transaction: vi.fn(),
}
const mockRedis = {
  set: vi.fn(),
  exists: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
  setex: vi.fn(),
}

vi.mock('../lib/prisma.js', () => ({ prisma: mockPrisma }))
vi.mock('../lib/redis.js', () => ({
  redis: mockRedis,
  KEYS: { qrNonce: (n: string) => `qr:nonce:${n}` },
}))
vi.mock('../config/env.js', () => ({
  env: {
    JWT_SECRET: 'test-jwt-secret-that-is-at-least-32-chars-long-enough',
    TICKET_NFT_CONTRACT_ID: '',
    ATTENDANCE_BADGE_CONTRACT_ID: '',
    IPFS_GATEWAY: 'https://gateway.pinata.cloud/ipfs',
    PINATA_JWT: '',
    STELLAR_HORIZON_URL: 'https://horizon-testnet.stellar.org',
    STELLAR_RPC_URL: 'https://soroban-testnet.stellar.org',
    STELLAR_NETWORK_PASSPHRASE: 'Test SDF Network ; September 2015',
    STELLAR_ADMIN_SECRET: 'SCZANGBA5INAS6OXRM3VW44CBTJBIXVUQO2BHXBHK3EEL6AEBVHLS7O',
    STELLAR_NETWORK: 'testnet',
  },
}))
vi.mock('../lib/stellar.js', () => ({
  invokeContract: vi.fn().mockResolvedValue('mock-tx-hash'),
  adminKeypair: { publicKey: () => 'GADMIN123' },
  addressToScVal: vi.fn().mockReturnValue({}),
  u64ToScVal: vi.fn().mockReturnValue({}),
  stringToScVal: vi.fn().mockReturnValue({}),
}))
vi.mock('../lib/logger.js', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }))
vi.mock('../services/socket.service.js', () => ({
  emitCheckIn: vi.fn(),
  emitBadgeMinted: vi.fn(),
}))
vi.mock('../services/notification.service.js', () => ({
  notifyBadgeEarned: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../services/ipfs.service.js', () => ({
  buildBadgeMetadata: vi.fn().mockResolvedValue({ cid: 'QmFakeCid', url: 'https://gateway/QmFakeCid', sizeBytes: 100 }),
}))

const { generateQrToken } = await import('../services/qr.service.js')
const { validateScan } = await import('../services/scanner.service.js')

const WALLET = 'GBTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCD'
const EVENT_ID = 'evt-uuid-001'
const TICKET_ID = 'tkt-uuid-001'

const mockTicket = {
  id: TICKET_ID,
  eventId: EVENT_ID,
  ownerWallet: WALLET,
  ownerId: 'user-001',
  ticketNumber: 1,
  status: 'ACTIVE',
  onChainTokenId: null,
  tier: { name: 'General Admission', badgeType: 'ATTENDEE', perks: [] },
  event: { id: EVENT_ID, title: 'Test Event', onChainEventId: null, startsAt: new Date() },
  owner: { displayName: 'Alice', avatarIpfsCid: null },
  checkIn: null,
}

const mockCheckIn = {
  id: 'ci-001',
  checkedInAt: new Date(),
}

describe('Scanner Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRedis.exists.mockResolvedValue(0)
    mockRedis.set.mockResolvedValue('OK')
  })

  it('accepts a valid first-time scan', async () => {
    const token = generateQrToken(TICKET_ID, EVENT_ID, WALLET)

    mockPrisma.ticket.findUnique.mockResolvedValue(mockTicket)
    mockPrisma.$transaction.mockImplementation(async (fn: any) => {
      const txMock = {
        ticket: {
          findUnique: vi.fn().mockResolvedValue({ ...mockTicket, checkIn: null }),
          update: vi.fn(),
        },
        checkIn: { create: vi.fn().mockResolvedValue(mockCheckIn) },
        event: { update: vi.fn() },
      }
      return fn(txMock)
    })
    mockPrisma.attendanceBadge.findFirst.mockResolvedValue(null)
    mockPrisma.attendanceBadge.create.mockResolvedValue({ id: 'badge-001' })
    mockPrisma.attendanceBadge.update.mockResolvedValue({})
    mockPrisma.checkIn.update.mockResolvedValue({})

    const result = await validateScan(token, EVENT_ID, WALLET)

    expect(result.valid).toBe(true)
    expect(result.tierName).toBe('General Admission')
    expect(result.attendeeName).toBeDefined()
  })

  it('rejects scan for wrong event', async () => {
    const token = generateQrToken(TICKET_ID, 'different-event-id', WALLET)
    const result = await validateScan(token, EVENT_ID, WALLET)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('WRONG_EVENT')
  })

  it('rejects already-checked-in ticket', async () => {
    const token = generateQrToken(TICKET_ID, EVENT_ID, WALLET)
    const checkedInTicket = {
      ...mockTicket,
      status: 'CHECKED_IN',
      checkIn: { id: 'ci-existing', checkedInAt: new Date() },
    }
    mockPrisma.ticket.findUnique.mockResolvedValue(checkedInTicket)

    const result = await validateScan(token, EVENT_ID, WALLET)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('ALREADY_CHECKED_IN')
  })

  it('rejects ownership mismatch', async () => {
    const token = generateQrToken(TICKET_ID, EVENT_ID, 'GDIFFERENTWALLET9999XYZABCDEFGHIJKLMNOPQRSTUVWXYZ12345678')
    mockPrisma.ticket.findUnique.mockResolvedValue(mockTicket) // ticket owned by different WALLET

    const result = await validateScan(token, EVENT_ID, WALLET)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('OWNERSHIP_MISMATCH')
  })

  it('rejects cancelled ticket', async () => {
    const token = generateQrToken(TICKET_ID, EVENT_ID, WALLET)
    mockPrisma.ticket.findUnique.mockResolvedValue({ ...mockTicket, status: 'CANCELLED' })

    const result = await validateScan(token, EVENT_ID, WALLET)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('TICKET_CANCELLED')
  })

  it('rejects non-existent ticket', async () => {
    const token = generateQrToken(TICKET_ID, EVENT_ID, WALLET)
    mockPrisma.ticket.findUnique.mockResolvedValue(null)

    const result = await validateScan(token, EVENT_ID, WALLET)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('TICKET_NOT_FOUND')
  })
})
