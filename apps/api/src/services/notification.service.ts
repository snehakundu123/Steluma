import { prisma } from '../lib/prisma.js'
import type { NotificationType } from '@prisma/client'

export async function createNotification(
  userId: string,
  type: NotificationType,
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  await prisma.notification.create({
    data: { userId, type, title, body, data: (data ?? {}) as any },
  }).catch(() => {}) // Non-blocking: don't fail primary operation if notification fails
}

export async function notifyTicketPurchased(
  userId: string,
  eventTitle: string,
  tierName: string,
  ticketNumber: number,
  eventId: string,
): Promise<void> {
  await createNotification(
    userId,
    'TICKET_PURCHASED',
    'Ticket Confirmed',
    `Your ${tierName} ticket #${ticketNumber} for "${eventTitle}" is ready.`,
    { eventId, ticketNumber },
  )
}

export async function notifyBadgeEarned(
  userId: string,
  badgeType: string,
  eventTitle: string,
  badgeId: string,
): Promise<void> {
  await createNotification(
    userId,
    'BADGE_EARNED',
    'Badge Earned! 🏅',
    `You earned a ${badgeType} badge for attending "${eventTitle}".`,
    { badgeId },
  )
}

export async function notifyStakeReleased(
  userId: string,
  eventTitle: string,
  amount: string,
  eventId: string,
): Promise<void> {
  await createNotification(
    userId,
    'STAKE_RELEASED',
    'Stake Released',
    `Your stake of ${parseFloat(amount).toFixed(2)} XLM for "${eventTitle}" has been returned.`,
    { eventId, amount },
  )
}

export async function notifyListingSold(
  userId: string,
  eventTitle: string,
  salePrice: string,
  listingId: string,
): Promise<void> {
  await createNotification(
    userId,
    'LISTING_SOLD',
    'Ticket Sold!',
    `Your ticket listing for "${eventTitle}" sold for ${parseFloat(salePrice).toFixed(2)} XLM.`,
    { listingId },
  )
}

export async function notifyReputationUpdate(
  userId: string,
  delta: number,
  newScore: number,
  reason: string,
): Promise<void> {
  await createNotification(
    userId,
    'REPUTATION_UPDATE',
    delta > 0 ? `Reputation +${delta}` : `Reputation ${delta}`,
    `${reason}. New score: ${newScore}.`,
    { delta, newScore },
  )
}
