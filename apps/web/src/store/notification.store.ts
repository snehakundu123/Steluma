import { create } from 'zustand'

export interface Notification {
  id: string
  type: 'purchase' | 'checkin' | 'sale' | 'stake' | 'system' | 'resale'
  title: string
  body: string
  eventTitle?: string
  read: boolean
  createdAt: Date
  href?: string
}

interface NotificationState {
  notifications: Notification[]
  unreadCount: number
  addNotification(n: Omit<Notification, 'id' | 'read' | 'createdAt'>): void
  markRead(id: string): void
  markAllRead(): void
  clearAll(): void
}

export const useNotificationStore = create<NotificationState>()((set) => ({
  notifications: [],
  unreadCount: 0,

  addNotification(n) {
    const notification: Notification = {
      ...n,
      id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      read: false,
      createdAt: new Date(),
    }
    set((state) => {
      const notifications = [notification, ...state.notifications].slice(0, 50)
      return { notifications, unreadCount: notifications.filter((m) => !m.read).length }
    })
  },

  markRead(id) {
    set((state) => {
      const notifications = state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n,
      )
      return {
        notifications,
        unreadCount: notifications.filter((n) => !n.read).length,
      }
    })
  },

  markAllRead() {
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    }))
  },

  clearAll() {
    set({ notifications: [], unreadCount: 0 })
  },
}))
