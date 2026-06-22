'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Bell, Ticket, CheckCircle2, DollarSign, Shield, Info, Store,
  CheckCheck, Trash2, X,
} from 'lucide-react'
import Link from 'next/link'
import { useNotificationStore, type Notification } from '@/store/notification.store'
import { cn } from '@/lib/utils'

// ─── Icon / colour map per notification type ───────────────────────────────

const TYPE_CONFIG: Record<
  Notification['type'],
  { icon: React.ElementType; colorClass: string }
> = {
  purchase: { icon: Ticket, colorClass: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400' },
  checkin:  { icon: CheckCircle2, colorClass: 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400' },
  sale:     { icon: DollarSign, colorClass: 'bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-400' },
  stake:    { icon: Shield, colorClass: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400' },
  system:   { icon: Info, colorClass: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
  resale:   { icon: Store, colorClass: 'bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400' },
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function timeAgo(date: Date): string {
  const ms = Date.now() - date.getTime()
  if (ms < 60_000) return 'just now'
  const m = Math.floor(ms / 60_000)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// ─── Sub-components ────────────────────────────────────────────────────────

function NotificationItem({ n, onClose }: { n: Notification; onClose: () => void }) {
  const markRead = useNotificationStore((s) => s.markRead)
  const { icon: Icon, colorClass } = TYPE_CONFIG[n.type] ?? TYPE_CONFIG.system

  const handleClick = () => {
    markRead(n.id)
    onClose()
  }

  const content = (
    <div
      className={cn(
        'flex items-start gap-3 px-4 py-3 transition-colors hover:bg-accent/50',
        !n.read && 'bg-primary/5',
      )}
    >
      <div className={cn('mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl', colorClass)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-foreground leading-tight line-clamp-1">{n.title}</p>
          {!n.read && (
            <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-primary" />
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{n.body}</p>
        {n.eventTitle && (
          <p className="mt-0.5 text-xs text-primary/80 font-medium truncate">{n.eventTitle}</p>
        )}
        <p className="mt-1 text-xs text-muted-foreground/70">{timeAgo(n.createdAt)}</p>
      </div>
    </div>
  )

  if (n.href) {
    return (
      <Link href={n.href} onClick={handleClick} className="block">
        {content}
      </Link>
    )
  }

  return <div onClick={() => markRead(n.id)}>{content}</div>
}

// ─── Main component ────────────────────────────────────────────────────────

export function NotificationBell() {
  const notifications = useNotificationStore((s) => s.notifications)
  const unreadCount   = useNotificationStore((s) => s.unreadCount)
  const markAllRead   = useNotificationStore((s) => s.markAllRead)
  const clearAll      = useNotificationStore((s) => s.clearAll)

  const [open, setOpen] = useState(false)

  const visible = notifications.slice(0, 10)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-notification-panel]')) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className="relative" data-notification-panel>
      {/* Bell button */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card hover:bg-accent transition-colors"
      >
        <Bell className="h-4 w-4 text-foreground" />
        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.span
              key="badge"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      {/* Dropdown panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute right-0 top-11 z-50 w-80 overflow-hidden rounded-2xl border border-border bg-card shadow-xl shadow-black/10"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h3 className="font-semibold text-foreground text-sm">Notifications</h3>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    title="Mark all read"
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-primary hover:bg-primary/10 transition-colors font-medium"
                  >
                    <CheckCheck className="h-3.5 w-3.5" />
                    Mark all read
                  </button>
                )}
                {notifications.length > 0 && (
                  <button
                    onClick={clearAll}
                    title="Clear all"
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Notification list */}
            <div className="max-h-[420px] overflow-y-auto">
              {visible.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
                    <Bell className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium text-foreground">No notifications yet</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    We'll let you know when something happens.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {visible.map((n) => (
                    <NotificationItem key={n.id} n={n} onClose={() => setOpen(false)} />
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            {notifications.length > 10 && (
              <div className="border-t border-border p-3">
                <p className="text-center text-xs text-muted-foreground">
                  Showing 10 of {notifications.length} notifications
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
