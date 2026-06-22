import type { Server as SocketServer } from 'socket.io'

let _io: SocketServer | null = null

export function setIo(io: SocketServer) {
  _io = io
}

export function emitToEvent(eventId: string, event: string, data: unknown) {
  _io?.of('/event').to(`event:${eventId}`).emit(event, data)
}

export function emitToOrganizer(eventId: string, event: string, data: unknown) {
  _io?.of('/organizer').to(`organizer:${eventId}`).emit(event, data)
}

export function emitToMarketplace(event: string, data: unknown) {
  _io?.of('/marketplace').to('marketplace').emit(event, data)
}

// --- Typed event emitters ---
// Event names use colon-separated namespacing (ticket:sold, checkin:complete)
// to match what the frontend listens for.

export function emitTicketSold(
  eventId: string,
  tierId: string,
  tierName: string,
  ticketsSold: number,
  available: number,
  totalRevenue: string,
) {
  const payload = { tierId, tierName, ticketsSold, available, totalRevenue }
  emitToEvent(eventId, 'ticket:sold', payload)
  emitToOrganizer(eventId, 'revenue:update', { totalRevenue, ticketsSold })
}

export function emitCheckIn(
  eventId: string,
  checkInId: string,
  ticket: { id: string; ticketNumber: number; tier: string },
  attendee: { walletAddress: string; displayName: string | null; avatarUrl: string | null },
) {
  const payload = {
    checkInId,
    checkedInAt: new Date().toISOString(),
    ticket,
    attendee,
  }
  emitToOrganizer(eventId, 'checkin:complete', payload)
}

export function emitListingCreated(eventId: string, tierName: string, price: string, listingId: string) {
  emitToMarketplace('listing:created', { listingId, eventId, tierName, price })
  emitToEvent(eventId, 'marketplace:activity', { type: 'listed', tierName, price })
}

export function emitListingSold(listingId: string, salePrice: string, buyerWallet: string) {
  emitToMarketplace('listing:sold', { listingId, salePrice, buyerWallet })
}

export function emitBadgeMinted(eventId: string, badgeType: string, attendeeWallet: string, badgeId: string) {
  emitToOrganizer(eventId, 'badge:minted', { badgeType, attendeeWallet, badgeId })
}
