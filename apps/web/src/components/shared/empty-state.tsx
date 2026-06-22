import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ─── Types ─────────────────────────────────────────────────────────────────

interface EmptyStateAction {
  label: string
  href?: string
  onClick?: () => void
  variant?: 'outline' | 'gradient'
}

interface EmptyStateProps {
  icon: string
  title: string
  description: string
  action?: EmptyStateAction
  className?: string
}

// ─── Component ─────────────────────────────────────────────────────────────

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-16 px-6 text-center',
        className,
      )}
    >
      {/* Icon container */}
      <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-muted text-4xl">
        {icon}
      </div>

      {/* Title */}
      <h3 className="text-xl font-semibold text-foreground">{title}</h3>

      {/* Description */}
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">{description}</p>

      {/* Optional action */}
      {action && (
        <div className="mt-6">
          {action.href ? (
            <Link href={action.href}>
              <Button variant={action.variant ?? 'outline'} onClick={action.onClick}>
                {action.label}
              </Button>
            </Link>
          ) : (
            <Button variant={action.variant ?? 'outline'} onClick={action.onClick}>
              {action.label}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
