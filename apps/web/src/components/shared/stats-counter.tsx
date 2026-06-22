'use client'

import { useEffect, useRef, useState } from 'react'
import { useInView } from 'framer-motion'
import { cn } from '@/lib/utils'

interface StatsCounterProps {
  value: number
  label: string
  prefix?: string
  suffix?: string
  duration?: number
  className?: string
  valueClassName?: string
  labelClassName?: string
}

function easeOutExpo(t: number): number {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t)
}

export function StatsCounter({
  value,
  label,
  prefix = '',
  suffix = '',
  duration = 2000,
  className,
  valueClassName,
  labelClassName,
}: StatsCounterProps) {
  const [displayValue, setDisplayValue] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-50px' })
  const hasAnimated = useRef(false)

  useEffect(() => {
    if (!isInView || hasAnimated.current || value === 0) return
    hasAnimated.current = true

    const startTime = performance.now()
    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)
      const easedProgress = easeOutExpo(progress)
      setDisplayValue(Math.round(easedProgress * value))
      if (progress < 1) requestAnimationFrame(animate)
    }

    requestAnimationFrame(animate)
  }, [isInView, value, duration])

  const formatted = displayValue.toLocaleString()

  return (
    <div ref={ref} className={cn('text-center', className)}>
      <div className={cn(
        'text-3xl font-bold tabular-nums text-foreground transition-all',
        valueClassName,
      )}>
        {prefix}{formatted}{suffix}
      </div>
      <div className={cn('mt-1 text-sm text-muted-foreground', labelClassName)}>
        {label}
      </div>
    </div>
  )
}

export function LiveCounter({
  value,
  label,
  className,
}: {
  value: number
  label: string
  className?: string
}) {
  const [prev, setPrev] = useState(value)
  const [flash, setFlash] = useState(false)

  useEffect(() => {
    if (value !== prev) {
      setFlash(true)
      setPrev(value)
      const t = setTimeout(() => setFlash(false), 600)
      return () => clearTimeout(t)
    }
  }, [value, prev])

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className="live-dot" />
      <span className={cn(
        'tabular-nums font-semibold transition-colors duration-300',
        flash ? 'text-primary' : 'text-foreground',
      )}>
        {value.toLocaleString()}
      </span>
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  )
}
