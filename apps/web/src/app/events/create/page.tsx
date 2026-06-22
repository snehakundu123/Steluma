'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, ArrowRight, Check, Plus, Trash2, Calendar, MapPin,
  Image, Shield, Eye, Sparkles, Globe, AlertCircle, Ticket, Info,
  Loader2, CheckCircle2, XCircle, ExternalLink, Zap,
} from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import Link from 'next/link'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Navbar } from '@/components/layout/navbar'
import { useAuthStore } from '@/store/auth.store'
import { usePublishEvent } from '@/hooks/use-publish-event'
import { formatXLM, cn } from '@/lib/utils'
import toast from 'react-hot-toast'

const CATEGORIES = [
  'CONFERENCE', 'CONCERT', 'HACKATHON', 'WORKSHOP',
  'NETWORKING', 'WEBINAR', 'FESTIVAL', 'SPORTS', 'COMMUNITY', 'OTHER',
]

const ticketTierSchema = z.object({
  name: z.string().min(1, 'Tier name required'),
  description: z.string().optional(),
  price: z.string().regex(/^\d+(\.\d{1,7})?$/, 'Invalid price'),
  priceAsset: z.string().default('XLM'),
  totalSupply: z.string().regex(/^\d+$/, 'Must be a whole number').refine(v => parseInt(v) > 0, 'Must be at least 1'),
  isTransferable: z.boolean().default(true),
  maxPerWallet: z.string().optional(),
})

const eventSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(200, 'Title too long'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  category: z.enum(['CONFERENCE', 'CONCERT', 'SPORTS', 'COMMUNITY', 'WORKSHOP', 'HACKATHON', 'NETWORKING', 'FESTIVAL', 'WEBINAR', 'OTHER'], {
    errorMap: () => ({ message: 'Please select a category' }),
  }),
  locationType: z.enum(['PHYSICAL', 'VIRTUAL', 'HYBRID']).default('PHYSICAL'),
  locationAddress: z.string().optional(),
  locationCity: z.string().optional(),
  locationCountry: z.string().optional(),
  virtualLink: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  startsAt: z.string().min(1, 'Start date required'),
  endsAt: z.string().min(1, 'End date required'),
  timezone: z.string().default('UTC'),
  bannerUrl: z.string().url().optional().or(z.literal('')),
  tags: z.string().optional(),
  ticketTiers: z.array(ticketTierSchema).min(1, 'At least one ticket tier required'),
})
  .refine((d) => !d.startsAt || !d.endsAt || new Date(d.endsAt) > new Date(d.startsAt), {
    message: 'End time must be after the start time',
    path: ['endsAt'],
  })
  .refine((d) => !d.endsAt || new Date(d.endsAt) > new Date(), {
    message: 'End time must be in the future',
    path: ['endsAt'],
  })

type EventFormData = z.infer<typeof eventSchema>

function toISO(datetimeLocal: string): string {
  if (!datetimeLocal) return ''
  if (datetimeLocal.length === 16) return datetimeLocal + ':00.000Z'
  return new Date(datetimeLocal).toISOString()
}

const STEPS = [
  { id: 'basics', label: 'Event Details', icon: Calendar, desc: 'Title, description, category' },
  { id: 'media', label: 'Banner', icon: Image, desc: 'Event artwork' },
  { id: 'tickets', label: 'Tickets', icon: Ticket, desc: 'Tiers and pricing' },
  { id: 'venue', label: 'Location', icon: MapPin, desc: 'Where it happens' },
  { id: 'publish', label: 'Publish', icon: Zap, desc: 'Stake & go live on Stellar' },
]

// ── On-chain publish progress UI ──────────────────────────────────────────────
function PublishProgress({
  state,
  stepLabel,
  onRetry,
}: {
  state: ReturnType<typeof usePublishEvent>['state']
  stepLabel: string
  onRetry: () => void
}) {
  const steps = [
    { key: 'stake', label: 'Stake XLM', substeps: ['building-stake-tx', 'awaiting-stake-signature', 'submitting-stake', 'recording-stake'] },
    { key: 'register', label: 'Register on Stellar', substeps: ['building-register-tx', 'awaiting-register-signature', 'submitting-register', 'extracting-event-id'] },
    { key: 'activate', label: 'Activate event', substeps: ['publishing', 'done'] },
  ]

  const currentSubstep = state.step
  function getStepStatus(substeps: string[]): 'pending' | 'active' | 'done' {
    const idx = substeps.indexOf(currentSubstep)
    if (idx >= 0) return 'active'
    const allDoneSteps = ['done']
    const doneOrder = ['recording-stake', 'building-register-tx', 'awaiting-register-signature', 'submitting-register', 'extracting-event-id', 'publishing', 'done']
    const firstSubstep = substeps[0]
    const firstSubstepIdx = doneOrder.indexOf(firstSubstep)
    const currentIdx = doneOrder.indexOf(currentSubstep)
    if (firstSubstepIdx >= 0 && currentIdx > firstSubstepIdx) return 'done'
    if (substeps.includes('done') && currentSubstep === 'done') return 'done'
    return 'pending'
  }

  if (state.step === 'done') {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="rounded-2xl border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30 p-8 text-center"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, delay: 0.1 }}
          className="mb-4 flex justify-center"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900">
            <CheckCircle2 className="h-9 w-9 text-emerald-600 dark:text-emerald-400" />
          </div>
        </motion.div>
        <h3 className="text-xl font-bold text-emerald-800 dark:text-emerald-300 mb-1">
          Event is live on Stellar! 🎉
        </h3>
        <p className="text-sm text-emerald-700/80 dark:text-emerald-400 mb-2">
          On-chain ID: <span className="font-mono font-semibold">#{state.onChainEventId}</span>
        </p>
        {state.stakeTxHash && (
          <a
            href={`https://stellar.expert/explorer/testnet/tx/${state.stakeTxHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 hover:underline mb-5"
          >
            View stake transaction <ExternalLink className="h-3 w-3" />
          </a>
        )}
        {state.eventSlug && (
          <div className="mt-5">
            <Link href={`/events/${state.eventSlug}`}>
              <Button variant="gradient" className="gap-2 px-8">
                <Zap className="h-4 w-4" /> View Your Live Event
              </Button>
            </Link>
          </div>
        )}
      </motion.div>
    )
  }

  if (state.step === 'error') {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20 p-6">
        <div className="flex items-start gap-3 mb-4">
          <XCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-red-700 dark:text-red-400">Publishing failed</p>
            <p className="text-sm text-red-600/80 dark:text-red-500 mt-1">{state.error}</p>
          </div>
        </div>
        <Button variant="outline" onClick={onRetry} className="gap-2 border-red-200 text-red-700 hover:bg-red-50">
          <ArrowLeft className="h-4 w-4" /> Try again
        </Button>
      </div>
    )
  }

  const isActive = state.step !== 'idle' && state.step !== 'calculating'

  return (
    <div className="space-y-4">
      {/* Active step banner */}
      {isActive && (
        <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
          <Loader2 className="h-4 w-4 animate-spin text-primary flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-primary">{stepLabel}</p>
            {state.step === 'awaiting-stake-signature' || state.step === 'awaiting-register-signature' ? (
              <p className="text-xs text-muted-foreground mt-0.5">Check your Freighter browser extension</p>
            ) : null}
          </div>
        </div>
      )}

      {/* Progress steps */}
      <div className="space-y-3">
        {steps.map((s) => {
          const status = getStepStatus(s.substeps)
          return (
            <div key={s.key} className={cn(
              'flex items-center gap-3 rounded-xl border px-4 py-3 transition-all',
              status === 'active' ? 'border-primary/30 bg-primary/5' :
              status === 'done' ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/20' :
              'border-border bg-card opacity-50',
            )}>
              <div className={cn(
                'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full',
                status === 'active' ? 'bg-primary text-white' :
                status === 'done' ? 'bg-emerald-500 text-white' :
                'bg-muted text-muted-foreground',
              )}>
                {status === 'done' ? (
                  <Check className="h-4 w-4" />
                ) : status === 'active' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <span className="text-xs font-bold">{steps.indexOf(s) + 1}</span>
                )}
              </div>
              <span className={cn(
                'text-sm font-medium',
                status === 'active' ? 'text-primary' :
                status === 'done' ? 'text-emerald-700 dark:text-emerald-400' :
                'text-muted-foreground',
              )}>
                {s.label}
                {s.key === 'stake' && state.stakeAmount != null && (
                  <span className="ml-1.5 text-xs font-normal opacity-70">
                    ({state.stakeAmount} XLM)
                  </span>
                )}
              </span>
              {status === 'active' && state.step === 'awaiting-stake-signature' && (
                <span className="ml-auto text-xs text-primary font-medium animate-live-pulse">
                  Waiting for signature…
                </span>
              )}
              {status === 'active' && state.step === 'awaiting-register-signature' && (
                <span className="ml-auto text-xs text-primary font-medium animate-live-pulse">
                  Waiting for signature…
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export default function CreateEventPage() {
  const router = useRouter()
  const { isAuthenticated } = useAuthStore()
  const [step, setStep] = useState(0)
  // Created draft — we keep it so the publish step can use its ID
  const [draft, setDraft] = useState<{ id: string; slug: string } | null>(null)
  const { state: publishState, publish, reset: resetPublish, stepLabel } = usePublishEvent()

  useEffect(() => {
    if (!isAuthenticated) router.push('/connect')
  }, [isAuthenticated, router])

  const form = useForm<EventFormData>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      title: '',
      description: '',
      locationType: 'PHYSICAL',
      startsAt: '',
      endsAt: '',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      ticketTiers: [{ name: 'General Admission', price: '0', totalSupply: '100', priceAsset: 'XLM', isTransferable: true }],
      bannerUrl: '',
      tags: '',
    },
    mode: 'onBlur',
  })

  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'ticketTiers' })

  const createDraft = useMutation({
    mutationFn: (data: EventFormData) => {
      const payload = {
        title: data.title,
        description: data.description,
        category: data.category,
        locationType: data.locationType,
        locationAddress: data.locationAddress || undefined,
        locationCity: data.locationCity || undefined,
        locationCountry: data.locationCountry || undefined,
        virtualLink: data.virtualLink || undefined,
        startsAt: toISO(data.startsAt),
        endsAt: toISO(data.endsAt),
        timezone: data.timezone,
        bannerUrl: data.bannerUrl || undefined,
        tags: data.tags ? data.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        ticketTiers: data.ticketTiers.map(t => ({
          name: t.name,
          description: t.description || undefined,
          price: parseFloat(t.price),
          priceAsset: t.priceAsset,
          totalSupply: parseInt(t.totalSupply),
          isTransferable: t.isTransferable,
          maxPerWallet: t.maxPerWallet ? parseInt(t.maxPerWallet) : 10,
          perks: [],
          badgeType: 'ATTENDEE' as const,
        })),
        royaltyBps: 500,
      }
      return api.post<{ id: string; slug: string; status: string }>('/events', payload)
    },
    onSuccess: (data) => {
      setDraft({ id: data.id, slug: data.slug })
      setStep(STEPS.length - 1) // jump to publish step
    },
    onError: (err: any) => {
      toast.error(err.message ?? 'Failed to create event. Check all fields and try again.')
    },
  })

  const onSubmit = form.handleSubmit(
    (data) => createDraft.mutate(data),
    (errors) => {
      const firstError = Object.values(errors)[0]
      const msg = (firstError as any)?.message ?? 'Please fix the form errors before submitting'
      toast.error(msg)
      if (errors.title || errors.description || errors.category || errors.startsAt || errors.endsAt) setStep(0)
      else if (errors.ticketTiers) setStep(2)
      else if (errors.locationType || errors.locationCity) setStep(3)
    },
  )

  const nextStep = () => setStep((s) => Math.min(s + 1, STEPS.length - 2)) // can't skip to publish
  const prevStep = () => setStep((s) => Math.max(s - 1, 0))

  if (!isAuthenticated) return null

  const values = form.watch()
  const locationType = form.watch('locationType')
  const isPublishStep = step === STEPS.length - 1
  const isPublishing = publishState.step !== 'idle' && publishState.step !== 'error' && publishState.step !== 'done'

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-surface-subtle pb-20">
        {/* Header */}
        <div className="border-b border-border bg-background">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 py-6">
            <div className="flex items-center gap-4 mb-6">
              <button
                type="button"
                onClick={() => router.back()}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
              <div>
                <h1 className="text-xl font-bold text-foreground">Create Event</h1>
                <p className="text-sm text-muted-foreground">
                  {isPublishStep && draft
                    ? 'Stake XLM & publish to Stellar'
                    : `Step ${step + 1} of ${STEPS.length}`}
                </p>
              </div>
            </div>

            {/* Progress stepper */}
            <div className="flex items-center gap-0">
              {STEPS.map((s, i) => (
                <div key={s.id} className="flex items-center flex-1 last:flex-none">
                  <button
                    type="button"
                    onClick={() => !isPublishStep && i <= step && setStep(i)}
                    disabled={isPublishStep || i > step}
                    className={cn(
                      'flex items-center gap-2 rounded-xl p-2 transition-all duration-200',
                      i === step ? 'text-primary'
                        : i < step ? 'text-muted-foreground cursor-pointer hover:text-foreground'
                          : 'text-muted-foreground/30',
                    )}
                  >
                    <div className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold flex-shrink-0 transition-all',
                      i === step ? 'bg-primary text-primary-foreground shadow-violet'
                        : i < step ? 'bg-emerald-500 text-white'
                          : 'bg-muted text-muted-foreground',
                    )}>
                      {i < step ? <Check className="h-4 w-4" /> : i + 1}
                    </div>
                    <span className="hidden sm:block text-xs font-medium">{s.label}</span>
                  </button>
                  {i < STEPS.length - 1 && (
                    <div className={cn(
                      'flex-1 h-px mx-1 transition-colors',
                      i < step ? 'bg-emerald-500' : 'bg-border',
                    )} />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-4xl px-4 sm:px-6 pt-8">
          <form onSubmit={onSubmit}>
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                {/* ── Step 0: Event Basics ── */}
                {step === 0 && (
                  <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                      <Calendar className="h-5 w-5 text-primary" />
                      Event Details
                    </h2>

                    <div>
                      <Label htmlFor="title">Event Title <span className="text-red-500">*</span></Label>
                      <Input id="title" placeholder="e.g. Web3 Builders Summit 2025" className="mt-1.5" {...form.register('title')} />
                      {form.formState.errors.title && <p className="mt-1 text-xs text-red-500">{form.formState.errors.title.message}</p>}
                    </div>

                    <div>
                      <Label htmlFor="description">Description <span className="text-red-500">*</span></Label>
                      <Textarea id="description" placeholder="Tell attendees what your event is about…" rows={5} className="mt-1.5" {...form.register('description')} />
                      {form.formState.errors.description && <p className="mt-1 text-xs text-red-500">{form.formState.errors.description.message}</p>}
                    </div>

                    <div>
                      <Label>Category <span className="text-red-500">*</span></Label>
                      <Select value={form.watch('category')} onValueChange={(v) => form.setValue('category', v as any, { shouldValidate: true })}>
                        <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select a category" /></SelectTrigger>
                        <SelectContent>
                          {CATEGORIES.map((cat) => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {form.formState.errors.category && <p className="mt-1 text-xs text-red-500">{form.formState.errors.category.message}</p>}
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label htmlFor="startsAt">Start Date & Time <span className="text-red-500">*</span></Label>
                        <Input id="startsAt" type="datetime-local" className="mt-1.5" {...form.register('startsAt')} />
                        {form.formState.errors.startsAt && <p className="mt-1 text-xs text-red-500">{form.formState.errors.startsAt.message}</p>}
                      </div>
                      <div>
                        <Label htmlFor="endsAt">End Date & Time <span className="text-red-500">*</span></Label>
                        <Input id="endsAt" type="datetime-local" className="mt-1.5" {...form.register('endsAt')} />
                        {form.formState.errors.endsAt && <p className="mt-1 text-xs text-red-500">{form.formState.errors.endsAt.message}</p>}
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="tags">Tags (optional)</Label>
                      <Input id="tags" placeholder="blockchain, developer, conference" className="mt-1.5" {...form.register('tags')} />
                      <p className="mt-1 text-xs text-muted-foreground">Comma-separated</p>
                    </div>
                  </div>
                )}

                {/* ── Step 1: Banner ── */}
                {step === 1 && (
                  <div className="rounded-2xl border border-border bg-card p-6 space-y-6">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                      <Image className="h-5 w-5 text-primary" />
                      Event Banner
                    </h2>
                    <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/20">
                      <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-blue-700 dark:text-blue-300">Upload your image to Imgur or Cloudinary, then paste the direct URL below. Recommended: 1920×1080px.</p>
                    </div>
                    <div>
                      <Label htmlFor="bannerUrl">Banner Image URL</Label>
                      <Input id="bannerUrl" placeholder="https://..." className="mt-1.5" {...form.register('bannerUrl')} />
                    </div>
                    {values.bannerUrl ? (
                      <div className="h-52 overflow-hidden rounded-xl border border-border bg-muted">
                        <img src={values.bannerUrl} alt="Preview" className="h-full w-full object-cover" />
                      </div>
                    ) : (
                      <div className="h-52 rounded-xl border-2 border-dashed border-border bg-muted/30 flex flex-col items-center justify-center text-muted-foreground">
                        <Image className="h-10 w-10 mb-3 opacity-30" />
                        <p className="text-sm">Optional — a gradient will be shown if not provided</p>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Step 2: Tickets ── */}
                {step === 2 && (
                  <div className="rounded-2xl border border-border bg-card p-6 space-y-6">
                    <div className="flex items-center justify-between">
                      <h2 className="text-lg font-semibold flex items-center gap-2">
                        <Ticket className="h-5 w-5 text-primary" />Ticket Tiers
                      </h2>
                      <Button type="button" variant="outline" size="sm" className="gap-1.5"
                        onClick={() => append({ name: '', price: '0', totalSupply: '100', priceAsset: 'XLM', isTransferable: true })}>
                        <Plus className="h-4 w-4" /> Add Tier
                      </Button>
                    </div>
                    <div className="space-y-4">
                      {fields.map((field, i) => (
                        <div key={field.id} className="rounded-xl border border-border bg-surface-subtle p-4">
                          <div className="flex items-center justify-between mb-4">
                            <span className="text-sm font-semibold">Tier {i + 1}</span>
                            {fields.length > 1 && (
                              <button type="button" onClick={() => remove(i)} className="text-muted-foreground hover:text-red-500 transition-colors">
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                              <Label>Tier Name <span className="text-red-500">*</span></Label>
                              <Input placeholder="e.g. General Admission" className="mt-1.5" {...form.register(`ticketTiers.${i}.name`)} />
                            </div>
                            <div>
                              <Label>Price (XLM) <span className="text-red-500">*</span></Label>
                              <Input type="number" min="0" step="0.01" placeholder="0 for free" className="mt-1.5" {...form.register(`ticketTiers.${i}.price`)} />
                            </div>
                            <div>
                              <Label>Total Supply <span className="text-red-500">*</span></Label>
                              <Input type="number" min="1" placeholder="100" className="mt-1.5" {...form.register(`ticketTiers.${i}.totalSupply`)} />
                            </div>
                            <div>
                              <Label>Description (optional)</Label>
                              <Input placeholder="What's included?" className="mt-1.5" {...form.register(`ticketTiers.${i}.description`)} />
                            </div>
                          </div>
                          <div className="mt-3 flex items-center gap-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input type="checkbox" className="rounded" {...form.register(`ticketTiers.${i}.isTransferable`)} />
                              <span className="text-xs text-muted-foreground">Transferable</span>
                            </label>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Step 3: Venue ── */}
                {step === 3 && (
                  <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                      <MapPin className="h-5 w-5 text-primary" />Location
                    </h2>
                    <div className="flex gap-3">
                      {[
                        { value: 'PHYSICAL', label: 'In-Person', desc: 'Physical venue' },
                        { value: 'VIRTUAL', label: 'Online', desc: 'Virtual event' },
                        { value: 'HYBRID', label: 'Hybrid', desc: 'Both' },
                      ].map((opt) => (
                        <label key={opt.value} className={cn(
                          'flex items-center gap-2 cursor-pointer rounded-xl border px-4 py-3 flex-1 transition-all',
                          locationType === opt.value ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30',
                        )}>
                          <input type="radio" className="text-primary" checked={locationType === opt.value} onChange={() => form.setValue('locationType', opt.value as any)} />
                          <div>
                            <p className="text-sm font-semibold">{opt.label}</p>
                            <p className="text-xs text-muted-foreground">{opt.desc}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                    {(locationType === 'PHYSICAL' || locationType === 'HYBRID') && (
                      <div className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div>
                            <Label>City</Label>
                            <Input placeholder="San Francisco" className="mt-1.5" {...form.register('locationCity')} />
                          </div>
                          <div>
                            <Label>Country</Label>
                            <Input placeholder="US" className="mt-1.5" {...form.register('locationCountry')} />
                          </div>
                        </div>
                        <div>
                          <Label>Full Address (optional)</Label>
                          <Input placeholder="747 Howard St, San Francisco, CA" className="mt-1.5" {...form.register('locationAddress')} />
                        </div>
                      </div>
                    )}
                    {(locationType === 'VIRTUAL' || locationType === 'HYBRID') && (
                      <div>
                        <Label htmlFor="virtualLink">Virtual Meeting Link</Label>
                        <Input id="virtualLink" placeholder="https://zoom.us/j/..." className="mt-1.5" {...form.register('virtualLink')} />
                        {form.formState.errors.virtualLink && <p className="mt-1 text-xs text-red-500">{form.formState.errors.virtualLink.message}</p>}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Step 4: Publish (Stake + On-chain) ── */}
                {isPublishStep && (
                  <div className="space-y-5">
                    {/* Preview card */}
                    <div className="rounded-2xl border border-border bg-card overflow-hidden">
                      <div className="h-32 bg-gradient-to-br from-violet-600 to-indigo-700 relative">
                        {values.bannerUrl && <img src={values.bannerUrl} alt="" className="h-full w-full object-cover" />}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                        <div className="absolute bottom-3 left-4">
                          <span className="rounded-full bg-black/40 px-3 py-1 text-xs text-white backdrop-blur-md">{values.category}</span>
                        </div>
                      </div>
                      <div className="p-4">
                        <p className="font-semibold text-foreground">{values.title}</p>
                        <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                          {values.startsAt && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{new Date(values.startsAt).toLocaleDateString()}</span>}
                          {values.locationCity && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{values.locationCity}</span>}
                          {values.locationType === 'VIRTUAL' && <span className="flex items-center gap-1"><Globe className="h-3 w-3" />Online</span>}
                        </div>
                      </div>
                    </div>

                    {!draft ? (
                      /* Before draft is created — show checklist + create button */
                      <div className="space-y-4">
                        <div className="rounded-2xl border border-border bg-card p-5">
                          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                            <Shield className="h-4 w-4 text-primary" />
                            Publishing checklist
                          </h3>
                          {[
                            { check: values.title.length >= 3, label: 'Event title' },
                            { check: values.description.length >= 10, label: 'Description' },
                            { check: !!values.category, label: 'Category' },
                            { check: !!values.startsAt, label: 'Start date' },
                            { check: !!values.endsAt, label: 'End date' },
                            { check: values.ticketTiers.every(t => t.name && parseInt(t.totalSupply) > 0), label: 'Ticket tiers configured' },
                          ].map((item) => (
                            <div key={item.label} className="flex items-center gap-2.5 py-1.5 text-sm">
                              {item.check
                                ? <Check className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                                : <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0" />}
                              <span className={item.check ? 'text-foreground' : 'text-muted-foreground'}>{item.label}</span>
                            </div>
                          ))}
                        </div>

                        <div className="rounded-2xl border border-violet-200 bg-violet-50 dark:border-violet-800 dark:bg-violet-950/20 p-4">
                          <div className="flex items-start gap-3">
                            <Sparkles className="h-5 w-5 text-violet-600 dark:text-violet-400 flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="text-sm font-semibold text-violet-700 dark:text-violet-300">What happens when you publish</p>
                              <ol className="mt-2 space-y-1.5 text-xs text-violet-600/80 dark:text-violet-400/80 list-decimal list-inside">
                                <li>Your event is saved to the database</li>
                                <li>You stake XLM as organizer accountability (sign in Freighter)</li>
                                <li>Your event is registered on the Stellar EventFactory contract (sign in Freighter)</li>
                                <li>Event goes <span className="font-semibold">ACTIVE</span> — visible to everyone</li>
                              </ol>
                            </div>
                          </div>
                        </div>

                        {createDraft.isError && (
                          <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/20">
                            <p className="text-sm text-red-700 dark:text-red-400">{(createDraft.error as any)?.message ?? 'Failed to create event'}</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Draft exists — show publish progress */
                      <PublishProgress
                        state={publishState}
                        stepLabel={stepLabel}
                        onRetry={resetPublish}
                      />
                    )}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

            {/* Navigation */}
            <div className="mt-8 flex items-center justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={prevStep}
                disabled={isPublishStep || step === 0}
                className="gap-2"
              >
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>

              {!isPublishStep ? (
                /* Steps 0-3: Next button — last step submits form to create draft */
                step < STEPS.length - 2 ? (
                  <Button type="button" variant="gradient" onClick={nextStep} className="gap-2">
                    Next <ArrowRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button type="submit" variant="gradient" disabled={createDraft.isPending} className="gap-2 px-8">
                    {createDraft.isPending
                      ? <><Loader2 className="h-4 w-4 animate-spin" />Saving…</>
                      : <><ArrowRight className="h-4 w-4" />Review & Publish</>}
                  </Button>
                )
              ) : (
                /* Publish step: start the on-chain flow */
                draft && publishState.step === 'idle' && (
                  <Button
                    type="button"
                    variant="gradient"
                    className="gap-2 px-8"
                    onClick={() => publish(draft.id, draft.slug)}
                  >
                    <Zap className="h-4 w-4" />
                    Stake & Publish on Stellar
                  </Button>
                )
              )}
            </div>
          </form>
        </div>
      </main>
    </>
  )
}
