'use client'

import { useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import { useAuthStore } from '@/store/auth.store'
import { useNotificationStore } from '@/store/notification.store'

const isDev = process.env.NODE_ENV === 'development'
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

/**
 * Connects to the public /event namespace for a specific event.
 * Receives: ticket:sold, marketplace:activity
 */
export function useEventRealtime(eventId: string | null) {
  const socketRef = useRef<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [lastEvent, setLastEvent] = useState<unknown>(null)

  useEffect(() => {
    if (!eventId) return

    const socket = io(`${API_URL}/event`, {
      query: { eventId },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10_000,
    })
    socketRef.current = socket

    socket.on('connect', () => {
      setIsConnected(true)
      if (isDev) console.log('[realtime/event] connected', socket.id)
    })
    socket.on('disconnect', (reason) => {
      setIsConnected(false)
      if (isDev) console.log('[realtime/event] disconnected:', reason)
    })
    socket.on('ticket:sold', (data: unknown) => setLastEvent({ type: 'ticket:sold', data }))
    socket.on('marketplace:activity', (data: unknown) => setLastEvent({ type: 'marketplace:activity', data }))

    return () => {
      socket.disconnect()
      socketRef.current = null
      setIsConnected(false)
    }
  }, [eventId])

  return { isConnected, lastEvent, socket: socketRef }
}

/**
 * Connects to the authenticated /organizer namespace.
 * Receives: checkin:complete, revenue:update, badge:minted
 * Requires: valid access token + eventId
 */
export function useOrganizerRealtime(eventId: string | null) {
  const { isAuthenticated, accessToken } = useAuthStore()
  const addNotification = useNotificationStore((s) => s.addNotification)
  const socketRef = useRef<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [lastEvent, setLastEvent] = useState<unknown>(null)

  useEffect(() => {
    if (!isAuthenticated || !eventId) return

    const token = accessToken ?? (typeof window !== 'undefined' ? localStorage.getItem('steluma:access_token') : null)
    if (!token) return

    const socket = io(`${API_URL}/organizer`, {
      auth: { token },
      query: { eventId },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10_000,
    })
    socketRef.current = socket

    socket.on('connect', () => {
      setIsConnected(true)
      if (isDev) console.log('[realtime/organizer] connected', socket.id)
    })
    socket.on('disconnect', (reason) => {
      setIsConnected(false)
      if (isDev) console.log('[realtime/organizer] disconnected:', reason)
    })
    socket.on('connect_error', (err) => {
      if (isDev) console.warn('[realtime/organizer] connect error:', err.message)
    })

    socket.on('checkin:complete', (data: unknown) => {
      if (isDev) console.log('[realtime/organizer] checkin:complete', data)
      setLastEvent({ type: 'checkin:complete', data })
      const d = data as { attendee?: { displayName?: string | null } }
      addNotification({
        type: 'checkin',
        title: 'Check-in complete',
        body: d?.attendee?.displayName
          ? `${d.attendee.displayName} checked in successfully.`
          : 'An attendee just checked in.',
        href: '/organizer',
      })
    })

    socket.on('revenue:update', (data: unknown) => {
      if (isDev) console.log('[realtime/organizer] revenue:update', data)
      setLastEvent({ type: 'revenue:update', data })
    })

    socket.on('badge:minted', (data: unknown) => {
      if (isDev) console.log('[realtime/organizer] badge:minted', data)
      setLastEvent({ type: 'badge:minted', data })
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
      setIsConnected(false)
    }
  }, [isAuthenticated, eventId, accessToken])

  return { isConnected, lastEvent, socket: socketRef }
}

/**
 * Connects to the public /marketplace namespace.
 * Receives: listing:created, listing:sold
 */
export function useMarketplaceRealtime() {
  const addNotification = useNotificationStore((s) => s.addNotification)
  const socketRef = useRef<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [lastEvent, setLastEvent] = useState<unknown>(null)

  useEffect(() => {
    const socket = io(`${API_URL}/marketplace`, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10_000,
    })
    socketRef.current = socket

    socket.on('connect', () => {
      setIsConnected(true)
      if (isDev) console.log('[realtime/marketplace] connected', socket.id)
    })
    socket.on('disconnect', (reason) => {
      setIsConnected(false)
      if (isDev) console.log('[realtime/marketplace] disconnected:', reason)
    })

    socket.on('listing:created', (data: unknown) => {
      if (isDev) console.log('[realtime/marketplace] listing:created', data)
      setLastEvent({ type: 'listing:created', data })
      const d = data as { tierName?: string } | undefined
      addNotification({
        type: 'resale',
        title: 'New resale listing',
        body: d?.tierName ? `A ${d.tierName} ticket is now available.` : 'A new ticket listing appeared.',
        href: '/marketplace',
      })
    })

    socket.on('listing:sold', (data: unknown) => {
      if (isDev) console.log('[realtime/marketplace] listing:sold', data)
      setLastEvent({ type: 'listing:sold', data })
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
      setIsConnected(false)
    }
  }, [])

  return { isConnected, lastEvent, socket: socketRef }
}
