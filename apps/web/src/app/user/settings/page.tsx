'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  User, Bell, Lock, Wallet, Trash2, Save, ExternalLink,
  ChevronRight, AlertTriangle, Shield, Globe, Camera, Loader2,
} from 'lucide-react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Navbar } from '@/components/layout/navbar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import { truncateWallet, cn } from '@/lib/utils'

// ─── Types ───────────────────────────────────────────────────────────────────

type UserProfile = {
  id: string
  displayName?: string
  bio?: string
  avatarUrl?: string
  website?: string
  walletAddress: string
  role: string
  createdAt: string
  email?: string
  notifications?: {
    emailEnabled: boolean
    inAppEnabled: boolean
    eventReminders: boolean
  }
  privacy?: {
    showAttendance: boolean
    showWalletAddress: boolean
  }
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const profileSchema = z.object({
  displayName: z.string().max(100).optional(),
  bio: z.string().max(500).optional(),
  avatarUrl: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  website: z.string().url('Must be a valid URL').optional().or(z.literal('')),
})

type ProfileFormData = z.infer<typeof profileSchema>

// ─── Sidebar sections ─────────────────────────────────────────────────────────

const SECTIONS = [
  { id: 'profile',    label: 'Profile',          icon: User },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'privacy',   label: 'Privacy',           icon: Lock },
  { id: 'wallet',    label: 'Connected Wallet',  icon: Wallet },
  { id: 'danger',    label: 'Danger Zone',       icon: AlertTriangle },
] as const

type SectionId = typeof SECTIONS[number]['id']

// ─── Toggle component ─────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  description?: string
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary/50',
          checked ? 'bg-primary' : 'bg-muted',
        )}
      >
        <span
          className={cn(
            'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200',
            checked ? 'translate-x-5' : 'translate-x-0',
          )}
        />
      </button>
    </div>
  )
}

// ─── Section panels ───────────────────────────────────────────────────────────

function ProfileSection({ profile, onRefresh }: { profile?: UserProfile; onRefresh: () => void }) {
  const qc = useQueryClient()

  const form = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      displayName: profile?.displayName ?? '',
      bio: profile?.bio ?? '',
      avatarUrl: profile?.avatarUrl ?? '',
      website: profile?.website ?? '',
    },
  })

  useEffect(() => {
    if (profile) {
      form.reset({
        displayName: profile.displayName ?? '',
        bio: profile.bio ?? '',
        avatarUrl: profile.avatarUrl ?? '',
        website: profile.website ?? '',
      })
    }
  }, [profile])

  const save = useMutation({
    mutationFn: (data: ProfileFormData) =>
      api.patch('/users/me', {
        displayName: data.displayName?.trim() || undefined,
        bio: data.bio?.trim() || undefined,
        avatarUrl: data.avatarUrl?.trim() || undefined,
        website: data.website?.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success('Profile updated!')
      qc.invalidateQueries({ queryKey: ['me'] })
      onRefresh()
    },
    onError: (err: any) => toast.error(err.message ?? 'Failed to update profile'),
  })

  const initials = profile?.displayName?.slice(0, 2).toUpperCase()
    ?? profile?.walletAddress?.slice(0, 2).toUpperCase()
    ?? 'ST'

  const watchedAvatar = form.watch('avatarUrl')

  return (
    <div className="space-y-6">
      {/* Avatar */}
      <div className="flex items-center gap-5">
        <div className="relative">
          <Avatar className="h-20 w-20">
            <AvatarImage src={watchedAvatar || profile?.avatarUrl || undefined} />
            <AvatarFallback className="bg-gradient-to-br from-violet-500 to-indigo-600 text-white text-lg font-bold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-background bg-muted">
            <Camera className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Profile Photo</p>
          <p className="text-xs text-muted-foreground">
            Paste an image URL below. Shown on tickets and your public profile.
          </p>
        </div>
      </div>

      <form onSubmit={form.handleSubmit((d) => save.mutate(d))} className="space-y-4">
        {/* Avatar URL */}
        <div className="space-y-1.5">
          <Label htmlFor="avatarUrl">Avatar URL</Label>
          <Input
            id="avatarUrl"
            type="url"
            placeholder="https://…"
            {...form.register('avatarUrl')}
          />
          {form.formState.errors.avatarUrl && (
            <p className="text-xs text-destructive">{form.formState.errors.avatarUrl.message}</p>
          )}
        </div>

        {/* Display name */}
        <div className="space-y-1.5">
          <Label htmlFor="displayName">Display Name</Label>
          <Input
            id="displayName"
            placeholder="Your name or alias"
            maxLength={100}
            {...form.register('displayName')}
          />
          <p className="text-xs text-muted-foreground">
            Shown on tickets, check-ins, and your public profile
          </p>
        </div>

        {/* Bio */}
        <div className="space-y-1.5">
          <Label htmlFor="bio">Bio</Label>
          <Textarea
            id="bio"
            placeholder="Tell the community about yourself…"
            rows={4}
            maxLength={500}
            {...form.register('bio')}
          />
          <p className="text-xs text-muted-foreground text-right">
            {form.watch('bio')?.length ?? 0}/500
          </p>
        </div>

        {/* Website */}
        <div className="space-y-1.5">
          <Label htmlFor="website">
            <Globe className="inline h-3.5 w-3.5 mr-1 -mt-0.5 text-muted-foreground" />
            Website
          </Label>
          <Input
            id="website"
            type="url"
            placeholder="https://yourwebsite.com"
            {...form.register('website')}
          />
          {form.formState.errors.website && (
            <p className="text-xs text-destructive">{form.formState.errors.website.message}</p>
          )}
        </div>

        <Button
          type="submit"
          variant="gradient"
          className="w-full gap-2"
          disabled={save.isPending}
        >
          {save.isPending
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
            : <><Save className="h-4 w-4" /> Save Changes</>}
        </Button>
      </form>
    </div>
  )
}

function NotificationsSection({ profile, onRefresh }: { profile?: UserProfile; onRefresh: () => void }) {
  const [emailEnabled, setEmailEnabled] = useState(profile?.notifications?.emailEnabled ?? true)
  const [inAppEnabled, setInAppEnabled] = useState(profile?.notifications?.inAppEnabled ?? true)
  const [eventReminders, setEventReminders] = useState(profile?.notifications?.eventReminders ?? true)

  useEffect(() => {
    if (profile?.notifications) {
      setEmailEnabled(profile.notifications.emailEnabled)
      setInAppEnabled(profile.notifications.inAppEnabled)
      setEventReminders(profile.notifications.eventReminders)
    }
  }, [profile])

  const save = useMutation({
    mutationFn: () =>
      api.patch('/users/me', {
        notifications: { emailEnabled, inAppEnabled, eventReminders },
      }),
    onSuccess: () => { toast.success('Notification preferences saved!'); onRefresh() },
    onError: (err: any) => toast.error(err.message ?? 'Failed to save'),
  })

  return (
    <div className="space-y-5">
      <Toggle
        checked={emailEnabled}
        onChange={setEmailEnabled}
        label="Email Notifications"
        description="Receive important updates about your tickets and events via email"
      />
      <div className="border-t border-border" />
      <Toggle
        checked={inAppEnabled}
        onChange={setInAppEnabled}
        label="In-App Notifications"
        description="See live alerts in the notification bell when activity happens"
      />
      <div className="border-t border-border" />
      <Toggle
        checked={eventReminders}
        onChange={setEventReminders}
        label="Event Reminders"
        description="Get a reminder 24 hours before each event you're attending"
      />
      <Button
        variant="gradient"
        className="w-full gap-2"
        onClick={() => save.mutate()}
        disabled={save.isPending}
      >
        {save.isPending
          ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
          : <><Save className="h-4 w-4" /> Save Preferences</>}
      </Button>
    </div>
  )
}

function PrivacySection({ profile, onRefresh }: { profile?: UserProfile; onRefresh: () => void }) {
  const [showAttendance, setShowAttendance] = useState(profile?.privacy?.showAttendance ?? true)
  const [showWallet, setShowWallet] = useState(profile?.privacy?.showWalletAddress ?? false)

  useEffect(() => {
    if (profile?.privacy) {
      setShowAttendance(profile.privacy.showAttendance)
      setShowWallet(profile.privacy.showWalletAddress)
    }
  }, [profile])

  const save = useMutation({
    mutationFn: () =>
      api.patch('/users/me', {
        privacy: { showAttendance, showWalletAddress: showWallet },
      }),
    onSuccess: () => { toast.success('Privacy settings saved!'); onRefresh() },
    onError: (err: any) => toast.error(err.message ?? 'Failed to save'),
  })

  return (
    <div className="space-y-5">
      <Toggle
        checked={showAttendance}
        onChange={setShowAttendance}
        label="Show Attendance Publicly"
        description="Let others see which events you've attended on your public profile"
      />
      <div className="border-t border-border" />
      <Toggle
        checked={showWallet}
        onChange={setShowWallet}
        label="Show Wallet Address Publicly"
        description="Display your truncated Stellar address on your public profile"
      />
      <Button
        variant="gradient"
        className="w-full gap-2"
        onClick={() => save.mutate()}
        disabled={save.isPending}
      >
        {save.isPending
          ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
          : <><Save className="h-4 w-4" /> Save Settings</>}
      </Button>
    </div>
  )
}

function WalletSection({ wallet, disconnect }: { wallet: string | null; disconnect: () => void }) {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-muted/30 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          Connected Stellar Address
        </p>
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600">
            <Wallet className="h-4 w-4 text-white" />
          </div>
          <p className="font-mono text-sm text-foreground break-all flex-1">
            {wallet ?? '—'}
          </p>
          {wallet && (
            <a
              href={`https://stellar.expert/explorer/testnet/account/${wallet}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0 text-primary hover:text-primary/80 transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950 dark:border-amber-800 p-4 flex items-start gap-3">
        <AlertTriangle className="h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
        <p className="text-sm text-amber-700 dark:text-amber-300">
          Disconnecting your wallet will sign you out. You can reconnect at any time using Freighter.
        </p>
      </div>

      <Button
        variant="outline"
        className="w-full gap-2 border-destructive/30 text-destructive hover:bg-destructive/5"
        onClick={disconnect}
      >
        <Wallet className="h-4 w-4" />
        Disconnect Wallet
      </Button>
    </div>
  )
}

function DangerZoneSection() {
  const [confirmed, setConfirmed] = useState(false)
  const router = useRouter()

  const deleteMutation = useMutation({
    mutationFn: () => api.delete('/users/me'),
    onSuccess: () => {
      toast.success('Account deleted. Goodbye!')
      router.push('/')
    },
    onError: (err: any) => toast.error(err.message ?? 'Failed to delete account'),
  })

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4">
        <AlertTriangle className="h-4 w-4 flex-shrink-0 text-destructive mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-foreground">Delete Account</p>
          <p className="text-xs text-muted-foreground mt-1">
            This permanently deletes your account, profile, and all associated data.
            Your on-chain NFT badges remain on the Stellar network. This action cannot be undone.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmDelete" className="text-sm text-muted-foreground">
          Type <span className="font-mono font-bold text-foreground">DELETE</span> to confirm
        </Label>
        <Input
          id="confirmDelete"
          placeholder="DELETE"
          onChange={(e) => setConfirmed(e.target.value === 'DELETE')}
          className="border-destructive/30 focus:ring-destructive/20"
        />
      </div>

      <Button
        variant="destructive"
        className="w-full gap-2"
        disabled={!confirmed || deleteMutation.isPending}
        onClick={() => deleteMutation.mutate()}
      >
        {deleteMutation.isPending
          ? <><Loader2 className="h-4 w-4 animate-spin" /> Deleting…</>
          : <><Trash2 className="h-4 w-4" /> Permanently Delete Account</>}
      </Button>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const router = useRouter()
  const { isAuthenticated, wallet, disconnect } = useAuthStore()
  const [activeSection, setActiveSection] = useState<SectionId>('profile')

  useEffect(() => {
    if (!isAuthenticated) router.push('/connect?redirect=/user/settings')
  }, [isAuthenticated, router])

  const { data: profile, refetch } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<UserProfile>('/users/me'),
    enabled: isAuthenticated,
  })

  if (!isAuthenticated) return null

  return (
    <div className="min-h-screen bg-surface-subtle">
      <Navbar />

      {/* Page header */}
      <div className="border-b border-border bg-background">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-6">
          <p className="text-sm text-muted-foreground mb-1">
            <Link href="/user" className="hover:text-primary transition-colors">My Profile</Link>
            <span className="mx-2 text-border">/</span>
            Settings
          </p>
          <h1 className="text-2xl font-bold text-foreground">Account Settings</h1>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
          {/* Sidebar nav */}
          <motion.aside
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="lg:w-56 flex-shrink-0"
          >
            <nav className="rounded-2xl border border-border bg-card p-2 shadow-xs">
              {SECTIONS.map((section) => {
                const Icon = section.icon
                const isActive = activeSection === section.id
                return (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={cn(
                      'w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all text-left',
                      isActive
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                      section.id === 'danger' && !isActive && 'text-destructive/70 hover:text-destructive hover:bg-destructive/5',
                      section.id === 'danger' && isActive && 'bg-destructive/10 text-destructive',
                    )}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    <span className="flex-1">{section.label}</span>
                    {isActive && <ChevronRight className="h-3.5 w-3.5 opacity-60" />}
                  </button>
                )
              })}
            </nav>

            {/* Account meta */}
            <div className="mt-4 rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground shadow-xs space-y-1">
              <p className="font-medium text-foreground mb-2">Account Info</p>
              {profile?.role && (
                <p>Role: <span className="font-medium text-foreground">{profile.role}</span></p>
              )}
              {profile?.createdAt && (
                <p>Joined: <span className="font-medium text-foreground">
                  {new Date(profile.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                </span></p>
              )}
            </div>
          </motion.aside>

          {/* Content panel */}
          <div className="flex-1 min-w-0">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeSection}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.15 }}
                className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-xs"
              >
                {/* Section header */}
                <div className="mb-6 pb-5 border-b border-border">
                  {(() => {
                    const sec = SECTIONS.find((s) => s.id === activeSection)!
                    const Icon = sec.icon
                    return (
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          'flex h-9 w-9 items-center justify-center rounded-xl',
                          activeSection === 'danger'
                            ? 'bg-destructive/10 text-destructive'
                            : 'bg-accent text-accent-foreground'
                        )}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div>
                          <h2 className="text-base font-semibold text-foreground">{sec.label}</h2>
                        </div>
                      </div>
                    )
                  })()}
                </div>

                {/* Section content */}
                {activeSection === 'profile' && (
                  <ProfileSection profile={profile} onRefresh={refetch} />
                )}
                {activeSection === 'notifications' && (
                  <NotificationsSection profile={profile} onRefresh={refetch} />
                )}
                {activeSection === 'privacy' && (
                  <PrivacySection profile={profile} onRefresh={refetch} />
                )}
                {activeSection === 'wallet' && (
                  <WalletSection wallet={wallet} disconnect={disconnect} />
                )}
                {activeSection === 'danger' && (
                  <DangerZoneSection />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  )
}
