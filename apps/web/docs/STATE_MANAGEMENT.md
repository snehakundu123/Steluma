# State Management

## Architecture Overview

Three distinct state layers, each with clear ownership:

```
┌─────────────────────────────────────────┐
│  Server State (TanStack Query)           │
│  Events, tickets, organizers, badges     │
│  — fetched, cached, invalidated          │
├─────────────────────────────────────────┤
│  Client State (Zustand)                  │
│  Auth, UI preferences, notifications     │
│  — persistent where needed              │
├─────────────────────────────────────────┤
│  Real-time State (Socket.IO + Query)     │
│  Live counts, check-ins, sales           │
│  — socket events → query invalidation   │
└─────────────────────────────────────────┘
```

## TanStack Query — Server State

### Query Keys Convention
```ts
// Flat namespaced arrays
['events']                          // event list
['events', { category, sort, q }]   // filtered list
['event', slug]                     // single event
['event', slug, 'tickets']          // event's tickets
['user', 'me']                      // current user
['user', 'tickets']                 // my tickets
['user', 'badges']                  // my badges
['organizer', walletAddress]        // organizer profile
['marketplace', { filters }]        // listings
['notifications']                   // inbox
```

### Stale Times
```ts
events list:     30s   (fast-changing)
single event:    60s
organizer:       5min  (slow-changing)
user/me:         2min
tickets:         30s   (can sell)
notifications:   10s
```

### Optimistic Updates
Used for:
- Ticket purchase (show success immediately, rollback if tx fails)
- Resale listing (show listing immediately)
- QR check-in (mark as checked-in immediately)
- Follow/unfollow organizer

### Mutations Pattern
```ts
const mutation = useMutation({
  mutationFn: api.post,
  onMutate: async (variables) => {
    // Cancel outgoing refetches
    await queryClient.cancelQueries({ queryKey })
    // Snapshot previous value
    const previous = queryClient.getQueryData(queryKey)
    // Optimistically update
    queryClient.setQueryData(queryKey, optimisticUpdate(variables))
    return { previous }
  },
  onError: (err, variables, context) => {
    // Rollback
    queryClient.setQueryData(queryKey, context?.previous)
    toast.error(err.message)
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey })
  },
})
```

## Zustand Stores

### auth.store.ts
```ts
interface AuthState {
  user: User | null
  wallet: string | null
  accessToken: string | null
  isConnecting: boolean
  isAuthenticated: boolean
  connect(): Promise<void>
  disconnect(): void
  refreshUser(): Promise<void>
}
// Persisted: wallet address, isAuthenticated flag
```

### notification.store.ts
```ts
interface NotificationState {
  notifications: Notification[]
  unreadCount: number
  addNotification(n: Notification): void
  markRead(id: string): void
  markAllRead(): void
  clearAll(): void
}
// Not persisted — ephemeral session data
```

### ui.store.ts
```ts
interface UIState {
  theme: 'light' | 'dark' | 'system'
  sidebarCollapsed: boolean
  activeModal: string | null
  setTheme(t: Theme): void
  toggleSidebar(): void
  openModal(id: string): void
  closeModal(): void
}
// Persisted: theme, sidebarCollapsed
```

## Real-time State Flow

```
Socket.IO server emits event
    → Socket listener in realtime.provider.tsx
        → Dispatch to notification store (toast + inbox)
        → Invalidate relevant Query keys
            → Components re-render with fresh data
```

### Socket Events → Query Invalidations
```ts
'ticket:sold'       → invalidate ['event', slug]
'checkin:complete'  → invalidate ['event', slug, 'checkins']
'listing:created'   → invalidate ['marketplace']
'listing:sold'      → invalidate ['marketplace', 'user:tickets']
'stake:updated'     → invalidate ['organizer']
```

## Form State

React Hook Form handles all form state locally — no global store needed.

Pattern:
```ts
const form = useForm<EventFormData>({
  resolver: zodResolver(eventSchema),
  defaultValues: { ... },
  mode: 'onBlur',
})
```

Autosave pattern for event creation:
```ts
useEffect(() => {
  const sub = form.watch((values) => {
    debounceSaveDraft(values, 2000)
  })
  return () => sub.unsubscribe()
}, [form.watch])
```

## Anti-Patterns to Avoid

- ❌ Do NOT put server data in Zustand (use Query)
- ❌ Do NOT use useState for data that crosses component boundaries
- ❌ Do NOT use useContext for frequently-changing values
- ❌ Do NOT manually manage loading/error state for queries
- ❌ Do NOT fire socket events from components directly
