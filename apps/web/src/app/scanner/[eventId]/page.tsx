'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, CheckCircle2, XCircle, AlertCircle, Users,
  Camera, Keyboard, RefreshCw, Shield, Clock, Search, Zap,
  CameraOff,
} from 'lucide-react'
import Link from 'next/link'
import { useQuery, useMutation } from '@tanstack/react-query'
import jsQR from 'jsqr'
import { api } from '@/lib/api'
import { useOrganizerRealtime } from '@/hooks/use-realtime'
import { Button } from '@/components/ui/button'
import { Navbar } from '@/components/layout/navbar'
import { cn } from '@/lib/utils'

type ScanState = 'idle' | 'scanning' | 'success' | 'error' | 'already_used' | 'invalid'

interface ScanResult {
  state: ScanState
  message: string
  attendeeName?: string
  tierName?: string
  onChainLock?: boolean
}

// ── Result overlay ─────────────────────────────────────────────────────────────

function ResultOverlay({ result, onReset }: { result: ScanResult; onReset: () => void }) {
  const cfg = {
    success:      { bg: 'bg-emerald-500', Icon: CheckCircle2, title: 'Checked In!' },
    already_used: { bg: 'bg-amber-500',   Icon: AlertCircle,  title: 'Already Scanned' },
    error:        { bg: 'bg-red-500',     Icon: XCircle,      title: 'Rejected' },
    invalid:      { bg: 'bg-red-600',     Icon: XCircle,      title: 'Invalid QR' },
    idle:         { bg: '',               Icon: Camera,        title: '' },
    scanning:     { bg: '',               Icon: Camera,        title: '' },
  }[result.state]

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92 }}
      transition={{ type: 'spring', stiffness: 360, damping: 28 }}
      className={cn(
        'absolute inset-0 flex flex-col items-center justify-center rounded-2xl p-8 text-center z-10',
        cfg.bg,
      )}
    >
      <motion.div
        initial={{ scale: 0, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 400, delay: 0.05 }}
      >
        <cfg.Icon className="h-24 w-24 text-white mb-4" />
      </motion.div>
      <h2 className="text-3xl font-bold text-white mb-1">{cfg.title}</h2>
      {result.attendeeName && (
        <p className="text-xl font-semibold text-white/90 mt-1">{result.attendeeName}</p>
      )}
      {result.tierName && (
        <p className="text-sm text-white/70 mt-0.5">{result.tierName} Ticket</p>
      )}
      <p className="text-sm text-white/80 mt-3 max-w-xs">{result.message}</p>
      {result.onChainLock && (
        <div className="mt-3 flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1">
          <Zap className="h-3.5 w-3.5 text-white" />
          <span className="text-xs text-white font-medium">Locked on Stellar</span>
        </div>
      )}
      <Button
        onClick={onReset}
        variant="outline"
        className="mt-7 border-white/30 text-white hover:bg-white/20"
        size="lg"
      >
        Scan Next
      </Button>
    </motion.div>
  )
}

// ── Viewfinder corners ─────────────────────────────────────────────────────────

function ViewfinderCorners({ active }: { active: boolean }) {
  const cls = cn('absolute h-8 w-8 transition-colors duration-300', active ? 'border-violet-400' : 'border-white/40')
  return (
    <>
      <div className={cn(cls, 'top-4 left-4 border-t-2 border-l-2 rounded-tl-sm')} />
      <div className={cn(cls, 'top-4 right-4 border-t-2 border-r-2 rounded-tr-sm')} />
      <div className={cn(cls, 'bottom-4 left-4 border-b-2 border-l-2 rounded-bl-sm')} />
      <div className={cn(cls, 'bottom-4 right-4 border-b-2 border-r-2 rounded-br-sm')} />
    </>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ScannerPage() {
  const params = useParams()
  const eventId = params.eventId as string

  const [mode, setMode] = useState<'camera' | 'manual'>('camera')
  const [manualCode, setManualCode] = useState('')
  const [scanResult, setScanResult] = useState<ScanResult>({ state: 'idle', message: '' })
  const [sessionCount, setSessionCount] = useState(0)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [cameraReady, setCameraReady] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number>(0)
  const processingRef = useRef(false)
  const manualInputRef = useRef<HTMLInputElement>(null)

  // ── Event info ───────────────────────────────────────────────────────────────

  const { data: event } = useQuery({
    queryKey: ['event-scanner', eventId],
    queryFn: () => api.get<any>(`/scanner/${eventId}/info`),
    refetchInterval: 10_000,
  })

  // Live realtime updates from organizer namespace
  const { lastEvent: realtimeEvent } = useOrganizerRealtime(eventId)
  useEffect(() => {
    if (!realtimeEvent) return
    const e = realtimeEvent as { type: string }
    if (e.type === 'checkin:complete') {
      setSessionCount((c) => c + 1)
    }
  }, [realtimeEvent])

  // ── Validate mutation ────────────────────────────────────────────────────────

  const checkin = useMutation({
    mutationFn: (payload: string) =>
      api.post<any>('/scanner/validate', { eventId, payload }),
    onSuccess: (data) => {
      setSessionCount((c) => c + 1)
      setScanResult({
        state: 'success',
        message: 'Welcome! Enjoy the event.',
        attendeeName: data.attendeeName,
        tierName: data.tierName,
        onChainLock: data.onChainLock,
      })
    },
    onError: (err: any) => {
      const code = err.code ?? ''
      if (code === 'ALREADY_CHECKED_IN') {
        setScanResult({ state: 'already_used', message: 'This ticket has already been scanned.' })
      } else if (code === 'EXPIRED_QR' || code === 'NONCE_USED') {
        setScanResult({ state: 'error', message: 'QR code has expired — ask the attendee to refresh.' })
      } else if (code === 'WRONG_EVENT' || code === 'INVALID_FORMAT' || code === 'INVALID_SIGNATURE') {
        setScanResult({ state: 'invalid', message: 'This QR code is not valid for this event.' })
      } else {
        setScanResult({ state: 'error', message: err.message ?? 'Verification failed.' })
      }
    },
  })

  const resetScan = useCallback(() => {
    setScanResult({ state: 'idle', message: '' })
    processingRef.current = false
    if (mode === 'manual' && manualInputRef.current) manualInputRef.current.focus()
  }, [mode])

  // Auto-reset after success
  useEffect(() => {
    if (scanResult.state === 'success') {
      const t = setTimeout(resetScan, 3000)
      return () => clearTimeout(t)
    }
  }, [scanResult.state, resetScan])

  // ── Camera management ────────────────────────────────────────────────────────

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setCameraReady(false)
  }, [])

  const startCamera = useCallback(async () => {
    setCameraError(null)
    setCameraReady(false)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
        setCameraReady(true)
      }
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        setCameraError('Camera access denied. Please allow camera permission and try again.')
      } else if (err.name === 'NotFoundError') {
        setCameraError('No camera found. Use manual entry instead.')
      } else {
        setCameraError('Could not start camera: ' + (err.message ?? 'Unknown error'))
      }
    }
  }, [])

  // ── QR scan loop ─────────────────────────────────────────────────────────────

  const scanFrame = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(scanFrame)
      return
    }

    // Skip if already processing a scan or result is showing
    if (processingRef.current || scanResult.state !== 'idle') {
      rafRef.current = requestAnimationFrame(scanFrame)
      return
    }

    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) { rafRef.current = requestAnimationFrame(scanFrame); return }

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    ctx.drawImage(video, 0, 0)

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'dontInvert',
    })

    if (code?.data) {
      processingRef.current = true
      setScanResult({ state: 'scanning', message: 'Verifying…' })
      checkin.mutate(code.data)
      return // don't schedule next frame yet — resetScan will clear processingRef
    }

    rafRef.current = requestAnimationFrame(scanFrame)
  }, [scanResult.state, checkin])

  // Start/stop scan loop when camera is ready
  useEffect(() => {
    if (cameraReady && mode === 'camera') {
      rafRef.current = requestAnimationFrame(scanFrame)
    }
    return () => cancelAnimationFrame(rafRef.current)
  }, [cameraReady, mode, scanFrame])

  // Start camera when in camera mode, stop when switching to manual
  useEffect(() => {
    if (mode === 'camera') {
      startCamera()
    } else {
      stopCamera()
      setTimeout(() => manualInputRef.current?.focus(), 100)
    }
    return () => { if (mode === 'camera') stopCamera() }
  }, [mode, startCamera, stopCamera])

  // Cleanup on unmount
  useEffect(() => () => stopCamera(), [stopCamera])

  // ── Manual submit ─────────────────────────────────────────────────────────────

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!manualCode.trim() || checkin.isPending) return
    setScanResult({ state: 'scanning', message: 'Verifying…' })
    checkin.mutate(manualCode.trim())
    setManualCode('')
  }

  const isResultShowing = ['success', 'error', 'already_used', 'invalid'].includes(scanResult.state)
  const totalCheckedIn = sessionCount + (event?.checkinCount ?? 0)

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-[#06070D] text-white">
        {/* Header */}
        <div className="border-b border-white/10 bg-white/5 backdrop-blur-md sticky top-0 z-20">
          <div className="mx-auto max-w-3xl px-4 py-3">
            <div className="flex items-center justify-between gap-4">
              <Link href="/organizer" className="flex items-center gap-2 text-sm text-white/70 hover:text-white transition-colors">
                <ArrowLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Dashboard</span>
              </Link>
              <div className="text-center min-w-0">
                <h1 className="text-sm font-bold text-white truncate">Check-in Scanner</h1>
                {event?.title && <p className="text-xs text-white/50 truncate">{event.title}</p>}
              </div>
              <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 px-3 py-1 flex-shrink-0">
                <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-semibold text-emerald-400">{totalCheckedIn}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-md px-4 py-6 space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Checked In', value: totalCheckedIn, Icon: CheckCircle2, color: 'text-emerald-400' },
              { label: 'Sold',       value: event?.ticketsSold ?? '—', Icon: Users,       color: 'text-blue-400' },
              { label: 'Capacity',   value: event?.totalTickets ?? '—', Icon: Shield,      color: 'text-violet-400' },
            ].map(({ label, value, Icon, color }) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-white/5 p-3 text-center">
                <Icon className={cn('mx-auto mb-1.5 h-4 w-4', color)} />
                <p className="text-lg font-bold tabular-nums">{typeof value === 'number' ? value.toLocaleString() : value}</p>
                <p className="text-[11px] text-white/40 mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {/* Scanner box */}
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black aspect-square">
            {/* Result overlay */}
            <AnimatePresence>
              {isResultShowing && (
                <ResultOverlay result={scanResult} onReset={resetScan} />
              )}
            </AnimatePresence>

            {/* Processing overlay */}
            <AnimatePresence>
              {scanResult.state === 'scanning' && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 z-10"
                >
                  <RefreshCw className="h-12 w-12 animate-spin text-violet-400 mb-3" />
                  <p className="text-sm text-white/80 font-medium">Verifying ticket…</p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Camera mode */}
            {mode === 'camera' && (
              <>
                {/* Live video */}
                <video
                  ref={videoRef}
                  className="absolute inset-0 w-full h-full object-cover"
                  playsInline
                  muted
                  autoPlay
                />
                {/* Hidden canvas for QR decoding */}
                <canvas ref={canvasRef} className="hidden" />

                {/* Camera error */}
                {cameraError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-black/90">
                    <CameraOff className="h-12 w-12 text-red-400 mb-3" />
                    <p className="text-sm text-white/80 mb-4">{cameraError}</p>
                    <Button
                      size="sm"
                      onClick={startCamera}
                      className="bg-violet-600 hover:bg-violet-500 text-white"
                    >
                      <RefreshCw className="h-4 w-4 mr-2" /> Retry Camera
                    </Button>
                  </div>
                )}

                {/* Starting up */}
                {!cameraReady && !cameraError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80">
                    <Camera className="h-10 w-10 text-white/40 mb-3 animate-pulse" />
                    <p className="text-sm text-white/50">Starting camera…</p>
                  </div>
                )}

                {/* Viewfinder overlay */}
                {cameraReady && !isResultShowing && (
                  <div className="absolute inset-0 pointer-events-none">
                    {/* Dark vignette corners */}
                    <div className="absolute inset-0 bg-gradient-radial from-transparent to-black/40" />

                    {/* Finder frame */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="relative w-56 h-56">
                        <ViewfinderCorners active />
                        {/* Animated scan line */}
                        <motion.div
                          className="absolute left-1 right-1 h-0.5 bg-gradient-to-r from-transparent via-violet-400 to-transparent opacity-80"
                          animate={{ y: [0, 208, 0] }}
                          transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }}
                        />
                      </div>
                    </div>

                    {/* Instruction */}
                    <div className="absolute bottom-4 left-0 right-0 text-center">
                      <p className="text-xs text-white/60 bg-black/40 inline-block px-3 py-1 rounded-full">
                        Point camera at attendee's QR code
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Manual mode */}
            {mode === 'manual' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center px-8">
                <Keyboard className="h-10 w-10 text-white/30 mb-4" />
                <p className="text-sm text-white/50 mb-5 text-center">
                  Paste or type the ticket code
                </p>
                <form onSubmit={handleManualSubmit} className="w-full space-y-3">
                  <input
                    ref={manualInputRef}
                    type="text"
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    placeholder="Ticket QR payload…"
                    className="w-full rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-400/20 transition-all"
                  />
                  <Button
                    type="submit"
                    className="w-full gap-2 bg-violet-600 hover:bg-violet-500 text-white rounded-xl"
                    disabled={!manualCode.trim() || checkin.isPending}
                  >
                    {checkin.isPending
                      ? <><RefreshCw className="h-4 w-4 animate-spin" />Verifying…</>
                      : <><Search className="h-4 w-4" />Verify Ticket</>}
                  </Button>
                </form>
              </div>
            )}
          </div>

          {/* Mode toggle */}
          <div className="flex rounded-2xl border border-white/10 bg-white/5 p-1 gap-1">
            {([
              { id: 'camera', label: 'Camera Scan', Icon: Camera },
              { id: 'manual', label: 'Manual Entry', Icon: Keyboard },
            ] as const).map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => { setMode(id); resetScan() }}
                className={cn(
                  'flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium transition-all',
                  mode === id ? 'bg-violet-600 text-white shadow-sm' : 'text-white/50 hover:text-white',
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>

          {/* Legend */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <h3 className="text-xs font-semibold text-white/70 uppercase tracking-wide mb-3">Check-in Guide</h3>
            <div className="space-y-2 text-xs text-white/50">
              {[
                { Icon: CheckCircle2, color: 'text-emerald-400', text: 'Green — Valid ticket, let them in' },
                { Icon: AlertCircle,  color: 'text-amber-400',  text: 'Amber — Already scanned, reject re-entry' },
                { Icon: XCircle,      color: 'text-red-400',    text: 'Red — Invalid or expired QR, reject entry' },
                { Icon: Clock,        color: 'text-blue-400',   text: 'QR codes rotate every 30s' },
                { Icon: Zap,          color: 'text-violet-400', text: 'Ticket locked on Stellar after check-in' },
              ].map(({ Icon, color, text }) => (
                <div key={text} className="flex items-start gap-2">
                  <Icon className={cn('h-4 w-4 flex-shrink-0 mt-0.5', color)} />
                  <span>{text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </>
  )
}
