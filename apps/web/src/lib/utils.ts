import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatXLM(amount: string | number): string {
  const n = typeof amount === 'string' ? parseFloat(amount) : amount
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date))
}

export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(date))
}

export function truncateWallet(wallet: string, chars = 6): string {
  return `${wallet.slice(0, chars)}...${wallet.slice(-chars)}`
}

export function getTrustTierColor(tier: string): string {
  return {
    NEW: 'text-gray-500 bg-gray-100 dark:text-gray-400 dark:bg-gray-800',
    VERIFIED: 'text-blue-700 bg-blue-50 dark:text-blue-400 dark:bg-blue-950',
    TRUSTED: 'text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950',
    PARTNER: 'text-violet-700 bg-violet-50 dark:text-violet-400 dark:bg-violet-950',
  }[tier] ?? 'text-gray-500 bg-gray-100 dark:text-gray-400 dark:bg-gray-800'
}

export function relativeTime(date: string | Date): string {
  const now = Date.now()
  const then = new Date(date).getTime()
  const diff = now - then
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

export function getCategoryEmoji(category: string): string {
  return {
    CONFERENCE: '🎤',
    CONCERT: '🎵',
    SPORTS: '⚽',
    COMMUNITY: '🤝',
    WORKSHOP: '🛠️',
    HACKATHON: '💻',
    NETWORKING: '🌐',
    FESTIVAL: '🎉',
    WEBINAR: '📡',
    OTHER: '📌',
  }[category] ?? '📌'
}
