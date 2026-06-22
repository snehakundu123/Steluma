import { Zap, Shield, Star, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ─────────────────────────────────────────────────────────────────

export type TrustTier = 'NEW' | 'VERIFIED' | 'TRUSTED' | 'PARTNER'
export type BadgeSize = 'sm' | 'md' | 'lg'

// ─── Config maps ───────────────────────────────────────────────────────────

const TIER_CONFIG: Record<
  TrustTier,
  { label: string; icon: React.ElementType; colorClass: string }
> = {
  NEW: {
    label: 'New',
    icon: Zap,
    colorClass:
      'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700',
  },
  VERIFIED: {
    label: 'Verified',
    icon: Shield,
    colorClass:
      'bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-950/60 dark:text-blue-400 dark:border-blue-900',
  },
  TRUSTED: {
    label: 'Trusted',
    icon: Star,
    colorClass:
      'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-900',
  },
  PARTNER: {
    label: 'Partner',
    icon: Sparkles,
    colorClass:
      'bg-violet-50 text-violet-700 border-violet-100 dark:bg-violet-950/60 dark:text-violet-400 dark:border-violet-900',
  },
}

const SIZE_CLASS: Record<BadgeSize, { pill: string; icon: string; text: string }> = {
  sm: { pill: 'gap-1 px-2 py-0.5', icon: 'h-2.5 w-2.5', text: 'text-2xs' },
  md: { pill: 'gap-1.5 px-2.5 py-1', icon: 'h-3.5 w-3.5', text: 'text-xs' },
  lg: { pill: 'gap-2 px-3 py-1.5', icon: 'h-4 w-4', text: 'text-sm' },
}

// ─── Component ─────────────────────────────────────────────────────────────

interface TrustBadgeProps {
  tier: TrustTier
  size?: BadgeSize
  className?: string
}

export function TrustBadge({ tier, size = 'md', className }: TrustBadgeProps) {
  const { label, icon: Icon, colorClass } = TIER_CONFIG[tier] ?? TIER_CONFIG.NEW
  const { pill, icon: iconSize, text } = SIZE_CLASS[size]

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border font-semibold uppercase tracking-wide',
        pill,
        text,
        colorClass,
        className,
      )}
    >
      <Icon className={iconSize} aria-hidden />
      {label}
    </span>
  )
}
