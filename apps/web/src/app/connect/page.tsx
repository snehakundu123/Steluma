'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Wallet, AlertCircle, ExternalLink, Shield, Lock, Zap,
  CheckCircle2, ChevronRight, ArrowRight,
} from 'lucide-react'
import toast from 'react-hot-toast'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/auth.store'
import { cn } from '@/lib/utils'

const STEPS = [
  {
    id: 1,
    icon: ExternalLink,
    title: 'Install Freighter',
    description: 'Add the Freighter browser extension to your Chromium or Firefox browser.',
    href: 'https://freighter.app',
  },
  {
    id: 2,
    icon: Wallet,
    title: 'Connect your wallet',
    description: 'Click the button below and approve the connection in Freighter.',
  },
  {
    id: 3,
    icon: Shield,
    title: 'Sign the challenge',
    description: 'Freighter will ask you to sign a zero-cost authentication transaction — never submitted to the network.',
  },
  {
    id: 4,
    icon: CheckCircle2,
    title: 'You\'re in',
    description: 'Your identity is verified and you\'re ready to create or attend events.',
  },
]

const TRUST_SIGNALS = [
  {
    icon: Shield,
    label: 'Non-custodial',
    desc: 'We never hold your keys or assets.',
    color: 'text-violet-400',
    bg: 'bg-violet-500/10 border-violet-500/20',
  },
  {
    icon: Lock,
    label: 'No passwords',
    desc: 'Your wallet is your identity.',
    color: 'text-indigo-400',
    bg: 'bg-indigo-500/10 border-indigo-500/20',
  },
  {
    icon: Zap,
    label: 'Instant auth',
    desc: 'One signature, done.',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10 border-amber-500/20',
  },
]

export default function ConnectPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { connect, isConnecting, isAuthenticated } = useAuthStore()
  const [error, setError] = useState<string | null>(null)
  const [currentStep, setCurrentStep] = useState(0)
  const [isDone, setIsDone] = useState(false)

  useEffect(() => {
    if (isAuthenticated) {
      router.push('/events')
    }
  }, [isAuthenticated, router])

  async function handleConnect() {
    setError(null)
    setCurrentStep(1)
    try {
      setCurrentStep(2)
      await connect()
      setCurrentStep(3)
      setIsDone(true)
      toast.success('Wallet connected!')
      const redirect = searchParams.get('redirect')
      setTimeout(() => router.push(redirect ?? '/events'), 800)
    } catch (err: any) {
      setCurrentStep(0)
      if (err.message?.includes('not installed') || err.message?.includes('Freighter')) {
        setError('Freighter wallet not found. Please install the extension first.')
      } else if (err.message?.includes('rejected') || err.message?.includes('User declined')) {
        setError('Connection rejected. Please approve the request in Freighter and try again.')
      } else {
        setError(err.message ?? 'Connection failed. Please try again.')
      }
    }
  }

  return (
    <div
      className="relative min-h-screen overflow-hidden flex flex-col items-center justify-center px-4 py-16"
      style={{ background: '#06070D' }}
    >
      {/* Mesh gradient blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div
          className="absolute -top-40 left-1/2 -translate-x-1/2 h-[600px] w-[600px] rounded-full opacity-25 blur-[100px]"
          style={{ background: 'radial-gradient(circle, #7C3AED 0%, transparent 70%)' }}
        />
        <div
          className="absolute top-1/3 -right-32 h-[400px] w-[400px] rounded-full opacity-15 blur-[80px]"
          style={{ background: 'radial-gradient(circle, #4F46E5 0%, transparent 70%)' }}
        />
        <div
          className="absolute bottom-0 -left-40 h-[500px] w-[500px] rounded-full opacity-10 blur-[100px]"
          style={{ background: 'radial-gradient(circle, #8B5CF6 0%, transparent 70%)' }}
        />
        {/* Grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      {/* Logo */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative mb-10 text-center"
      >
        <Link href="/" className="inline-flex flex-col items-center gap-3 group">
          <div className="relative h-14 w-14 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 shadow-lg shadow-violet-500/40 transition-all duration-300 group-hover:shadow-violet-500/60 group-hover:scale-105">
            <div className="absolute inset-0 rounded-2xl bg-white/10" />
            <svg className="absolute inset-2.5" viewBox="0 0 20 20" fill="none">
              <path d="M10 2L2 7l8 5 8-5-8-5z" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M2 12l8 5 8-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="text-2xl font-bold tracking-tight text-white">Steluma</span>
        </Link>
      </motion.div>

      {/* Main card */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-md"
      >
        {/* Glow border */}
        <div
          className="absolute -inset-px rounded-3xl opacity-60"
          style={{
            background: 'linear-gradient(135deg, rgba(124,58,237,0.4) 0%, rgba(79,70,229,0.2) 50%, transparent 100%)',
          }}
        />

        <div
          className="relative rounded-3xl border border-white/[0.08] p-8"
          style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(24px)' }}
        >
          {/* Heading */}
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold text-white">Connect your wallet</h1>
            <p className="mt-2 text-sm text-white/50">
              No seed phrases. No passwords. Just your wallet.
            </p>
          </div>

          {/* CTA Button */}
          <Button
            onClick={handleConnect}
            loading={isConnecting}
            variant="gradient"
            size="xl"
            className={cn(
              'w-full text-base font-semibold rounded-2xl',
              isDone && 'from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 shadow-emerald-500/20',
            )}
          >
            {isDone ? (
              <>
                <CheckCircle2 className="h-5 w-5" />
                Connected!
              </>
            ) : isConnecting ? (
              <>
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Connecting…
              </>
            ) : (
              <>
                <Wallet className="h-5 w-5" />
                Connect with Freighter
              </>
            )}
          </Button>

          {/* Don't have Freighter */}
          <div className="mt-3 text-center">
            <a
              href="https://freighter.app"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-white/40 hover:text-white/70 transition-colors"
            >
              Don&apos;t have Freighter? Install it free
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>

          {/* Error state */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0, marginTop: 0 }}
                animate={{ opacity: 1, height: 'auto', marginTop: 16 }}
                exit={{ opacity: 0, height: 0, marginTop: 0 }}
                className="overflow-hidden"
              >
                <div className="flex items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
                  <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <div className="flex-1">
                    <p>{error}</p>
                    {error.includes('not found') && (
                      <a
                        href="https://freighter.app"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1 font-semibold text-red-300 hover:text-red-200 transition-colors"
                      >
                        Install Freighter <ArrowRight className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Divider */}
          <div className="mt-8 mb-6 flex items-center gap-3">
            <div className="flex-1 h-px bg-white/[0.06]" />
            <span className="text-xs text-white/25 uppercase tracking-wider">How it works</span>
            <div className="flex-1 h-px bg-white/[0.06]" />
          </div>

          {/* Steps */}
          <div className="space-y-4">
            {STEPS.map((step, i) => {
              const Icon = step.icon
              const isActive = currentStep === i
              const isComplete = (isDone && i < 4) || (currentStep > i && i > 0)

              return (
                <motion.div
                  key={step.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 + i * 0.07 }}
                  className={cn(
                    'flex items-start gap-3.5 rounded-xl p-3 transition-all duration-300',
                    isActive && 'bg-violet-500/10 border border-violet-500/20',
                    isComplete && 'opacity-60',
                  )}
                >
                  <div
                    className={cn(
                      'mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-sm font-bold transition-all duration-300',
                      isComplete
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : isActive
                          ? 'bg-violet-500/20 text-violet-300'
                          : 'bg-white/5 text-white/30',
                    )}
                  >
                    {isComplete ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <Icon className="h-4 w-4" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        'text-sm font-semibold transition-colors',
                        isActive ? 'text-white' : 'text-white/60',
                      )}>
                        {step.title}
                      </span>
                      {step.href && (
                        <a
                          href={step.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-violet-400 hover:text-violet-300 transition-colors"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                    <p className={cn(
                      'mt-0.5 text-xs leading-relaxed transition-colors',
                      isActive ? 'text-white/50' : 'text-white/30',
                    )}>
                      {step.description}
                    </p>
                  </div>
                  <div className={cn(
                    'mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full transition-all',
                    isActive ? 'bg-violet-400 animate-pulse' : isComplete ? 'bg-emerald-400' : 'bg-white/10',
                  )} />
                </motion.div>
              )
            })}
          </div>
        </div>
      </motion.div>

      {/* Trust signals */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.35 }}
        className="mt-6 grid w-full max-w-md grid-cols-3 gap-3"
      >
        {TRUST_SIGNALS.map(({ icon: Icon, label, desc, color, bg }) => (
          <div
            key={label}
            className={cn(
              'flex flex-col items-center gap-2 rounded-2xl border p-3.5 text-center',
              bg,
            )}
          >
            <Icon className={cn('h-5 w-5', color)} />
            <div>
              <p className="text-xs font-semibold text-white/80">{label}</p>
              <p className="mt-0.5 text-[11px] text-white/35 leading-tight">{desc}</p>
            </div>
          </div>
        ))}
      </motion.div>

      {/* Testnet notice */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-6 text-center text-xs text-white/25"
      >
        Running on Stellar Testnet — ensure Freighter is set to Testnet before connecting.
      </motion.p>
    </div>
  )
}
