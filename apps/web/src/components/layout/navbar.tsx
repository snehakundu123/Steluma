'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Menu, X, ChevronDown, LogOut, LayoutDashboard, Ticket,
  Award, Plus, Bell, Settings, Star, Shield, Zap,
  Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { WalletConnect } from '@/components/wallet/wallet-connect'
import { useAuthStore } from '@/store/auth.store'
import { truncateWallet, getTrustTierColor, cn } from '@/lib/utils'

const navLinks = [
  { href: '/events', label: 'Browse Events' },
  { href: '/marketplace', label: 'Marketplace' },
  { href: '/leaderboard', label: 'Leaderboard' },
]

const tierIcons: Record<string, React.ElementType> = {
  NEW: Zap,
  VERIFIED: Shield,
  TRUSTED: Star,
  PARTNER: Sparkles,
}

function TrustPill({ tier }: { tier: string }) {
  const Icon = tierIcons[tier] ?? Zap
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide',
      getTrustTierColor(tier),
    )}>
      <Icon className="h-2.5 w-2.5" />
      {tier}
    </span>
  )
}

export function Navbar() {
  const pathname = usePathname()
  const { isAuthenticated, user, wallet, disconnect } = useAuthStore()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 8)
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  useEffect(() => {
    if (mobileOpen) setMobileOpen(false)
  }, [pathname])

  const initials = user?.displayName
    ? user.displayName.slice(0, 2).toUpperCase()
    : wallet?.slice(0, 2).toUpperCase() ?? 'ST'

  const displayName = user?.displayName ?? (wallet ? truncateWallet(wallet, 4) : null)

  return (
    <header
      className={cn(
        'sticky top-0 z-50 w-full transition-all duration-300',
        scrolled
          ? 'border-b border-border bg-background/95 backdrop-saturate shadow-sm'
          : 'border-b border-transparent bg-background/80 backdrop-blur-md',
      )}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 h-16">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
          <div className="relative h-8 w-8 rounded-xl bg-gradient-brand shadow-violet transition-all duration-300 group-hover:shadow-violet-glow">
            <div className="absolute inset-0 rounded-xl bg-white/20" />
            <svg className="absolute inset-1.5" viewBox="0 0 20 20" fill="white">
              <path d="M10 2L2 7l8 5 8-5-8-5zM2 12l8 5 8-5M2 17l8 5 8-5" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span className="text-[1.1rem] font-bold tracking-tight text-foreground">
            Steluma
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'relative rounded-lg px-3.5 py-2 text-sm font-medium transition-all duration-150',
                pathname === link.href || pathname.startsWith(link.href + '/')
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {(pathname === link.href || pathname.startsWith(link.href + '/')) && (
                <motion.span
                  layoutId="nav-indicator"
                  className="absolute inset-0 rounded-lg bg-accent"
                  style={{ zIndex: -1 }}
                  transition={{ type: 'spring', duration: 0.3 }}
                />
              )}
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-2">
          {isAuthenticated && user ? (
            <>
              {/* Create event */}
              <Link href="/events/create" className="hidden md:block">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 h-9 font-medium"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Create Event
                </Button>
              </Link>

              {/* Notification bell */}
              <Button
                variant="ghost"
                size="icon"
                className="relative h-9 w-9 rounded-xl"
                aria-label="Notifications"
              >
                <Bell className="h-4.5 w-4.5" />
                <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                  3
                </span>
              </Button>

              {/* User menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 rounded-xl border border-border bg-card p-1.5 pr-2.5 hover:bg-accent/50 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <Avatar className="h-7 w-7">
                      <AvatarImage src={user.avatarUrl ?? undefined} />
                      <AvatarFallback className="bg-gradient-brand text-white text-xs font-bold">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <span className="hidden text-sm font-medium md:block max-w-[120px] truncate">
                      {displayName}
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>

                <DropdownMenuContent
                  align="end"
                  sideOffset={8}
                  className="w-60 rounded-2xl border-border shadow-lg"
                >
                  <DropdownMenuLabel className="p-3">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={user.avatarUrl ?? undefined} />
                        <AvatarFallback className="bg-gradient-brand text-white text-sm font-bold">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">
                          {user.displayName ?? 'My Account'}
                        </p>
                        <p className="font-mono text-xs text-muted-foreground truncate">
                          {wallet ? truncateWallet(wallet, 6) : ''}
                        </p>
                        {user.organizerProfile && (
                          <div className="mt-1">
                            <TrustPill tier={user.organizerProfile.trustTier} />
                          </div>
                        )}
                      </div>
                    </div>
                  </DropdownMenuLabel>

                  <DropdownMenuSeparator />

                  <div className="p-1">
                    <DropdownMenuItem asChild>
                      <Link href="/user" className="flex items-center gap-2.5 cursor-pointer rounded-lg px-2.5 py-2 text-sm">
                        <Ticket className="h-4 w-4 text-muted-foreground" />
                        My Tickets
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/user?tab=badges" className="flex items-center gap-2.5 cursor-pointer rounded-lg px-2.5 py-2 text-sm">
                        <Award className="h-4 w-4 text-muted-foreground" />
                        Attendance Badges
                      </Link>
                    </DropdownMenuItem>

                    {(user.role === 'ORGANIZER' || user.role === 'ADMIN') && (
                      <>
                        <DropdownMenuSeparator className="my-1" />
                        <DropdownMenuItem asChild>
                          <Link href="/organizer" className="flex items-center gap-2.5 cursor-pointer rounded-lg px-2.5 py-2 text-sm">
                            <LayoutDashboard className="h-4 w-4 text-muted-foreground" />
                            Organizer Dashboard
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href="/events/create" className="flex items-center gap-2.5 cursor-pointer rounded-lg px-2.5 py-2 text-sm">
                            <Plus className="h-4 w-4 text-muted-foreground" />
                            Create Event
                          </Link>
                        </DropdownMenuItem>
                      </>
                    )}

                    <DropdownMenuSeparator className="my-1" />
                    <DropdownMenuItem asChild>
                      <Link href="/user/settings" className="flex items-center gap-2.5 cursor-pointer rounded-lg px-2.5 py-2 text-sm">
                        <Settings className="h-4 w-4 text-muted-foreground" />
                        Settings
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={disconnect}
                      className="flex items-center gap-2.5 cursor-pointer rounded-lg px-2.5 py-2 text-sm text-destructive focus:text-destructive focus:bg-destructive/10"
                    >
                      <LogOut className="h-4 w-4" />
                      Disconnect Wallet
                    </DropdownMenuItem>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <WalletConnect size="sm" showAddress={false} />
          )}

          {/* Mobile menu toggle */}
          <button
            className="flex items-center justify-center h-9 w-9 rounded-xl text-muted-foreground hover:text-foreground hover:bg-accent transition-all md:hidden"
            onClick={() => setMobileOpen((o) => !o)}
            aria-label="Toggle menu"
          >
            <AnimatePresence mode="wait" initial={false}>
              {mobileOpen ? (
                <motion.span key="close" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.15 }}>
                  <X className="h-5 w-5" />
                </motion.span>
              ) : (
                <motion.span key="open" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.15 }}>
                  <Menu className="h-5 w-5" />
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="border-t border-border bg-background/95 backdrop-blur-md md:hidden overflow-hidden"
          >
            <div className="flex flex-col gap-0.5 px-4 py-3">
              {navLinks.map((link, i) => (
                <motion.div
                  key={link.href}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Link
                    href={link.href}
                    className={cn(
                      'flex items-center rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                      pathname === link.href
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                    )}
                  >
                    {link.label}
                  </Link>
                </motion.div>
              ))}

              {isAuthenticated && (
                <>
                  <div className="my-1 border-t border-border" />
                  <Link href="/events/create" className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors">
                    <Plus className="h-4 w-4" /> Create Event
                  </Link>
                  <Link href="/user" className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors">
                    <Ticket className="h-4 w-4" /> My Tickets
                  </Link>
                  {(user?.role === 'ORGANIZER' || user?.role === 'ADMIN') && (
                    <Link href="/organizer" className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors">
                      <LayoutDashboard className="h-4 w-4" /> Dashboard
                    </Link>
                  )}
                </>
              )}

              {!isAuthenticated && (
                <div className="mt-2 pb-1">
                  <WalletConnect className="w-full" />
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
