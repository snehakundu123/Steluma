import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@steluma/types'
import { api } from '@/lib/api'
import { connectFreighter, signXdr } from '@/lib/freighter'

const ACCESS_KEY = 'steluma:access_token'
const REFRESH_KEY = 'steluma:refresh_token'

interface AuthState {
  user: User | null
  wallet: string | null
  accessToken: string | null
  isConnecting: boolean
  isAuthenticated: boolean
  hydrated: boolean

  connect: () => Promise<void>
  disconnect: () => void
  refreshUser: () => Promise<void>
  restoreSession: () => Promise<void>
  setHydrated: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      wallet: null,
      accessToken: null,
      isConnecting: false,
      isAuthenticated: false,
      hydrated: false,

      connect: async () => {
        set({ isConnecting: true })
        try {
          const walletAddress = await connectFreighter()
          set({ wallet: walletAddress })

          // 1. Get challenge — a Stellar tx XDR the wallet must sign (never submitted)
          const challenge = await api.post<{
            nonce: string
            xdr: string
            networkPassphrase: string
          }>('/auth/challenge', { walletAddress })

          // 2. Sign the challenge with Freighter (zero XLM cost)
          const signedXdr = await signXdr(challenge.xdr, challenge.networkPassphrase)

          // 3. Verify with backend → receive JWT pair
          const tokens = await api.post<{
            accessToken: string
            refreshToken: string
            user: User & { isNewUser: boolean }
          }>('/auth/verify', { walletAddress, signedXdr, nonce: challenge.nonce })

          localStorage.setItem(ACCESS_KEY, tokens.accessToken)
          localStorage.setItem(REFRESH_KEY, tokens.refreshToken)

          set({
            user: tokens.user,
            wallet: walletAddress,
            accessToken: tokens.accessToken,
            isAuthenticated: true,
            isConnecting: false,
          })
        } catch (err) {
          set({ isConnecting: false })
          throw err
        }
      },

      disconnect: () => {
        localStorage.removeItem(ACCESS_KEY)
        localStorage.removeItem(REFRESH_KEY)
        api.delete('/auth/logout').catch(() => {})
        set({ user: null, wallet: null, accessToken: null, isAuthenticated: false })
      },

      refreshUser: async () => {
        if (!get().isAuthenticated) return
        try {
          const user = await api.get<User>('/users/me')
          set({ user })
        } catch {
          /* handled by session-expired listener */
        }
      },

      /**
       * On app load, if we have a persisted session, verify it's still valid
       * by fetching the current user. The api client auto-refreshes the access
       * token; if the refresh token is also dead, it fires 'session-expired'.
       */
      restoreSession: async () => {
        const hasToken =
          typeof window !== 'undefined' && !!localStorage.getItem(REFRESH_KEY)

        if (!get().isAuthenticated || !hasToken) {
          // Persisted flag but no token → stale; clear it.
          if (get().isAuthenticated && !hasToken) {
            set({ user: null, wallet: null, accessToken: null, isAuthenticated: false })
          }
          return
        }

        try {
          const user = await api.get<User>('/users/me')
          set({ user, isAuthenticated: true })
        } catch {
          /* session-expired event will reset state */
        }
      },

      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: 'steluma:auth',
      partialize: (s) => ({ wallet: s.wallet, isAuthenticated: s.isAuthenticated }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated()
        // Validate the session once the store has rehydrated.
        state?.restoreSession()
      },
    },
  ),
)

// When the api client gives up refreshing, hard-reset auth state.
if (typeof window !== 'undefined') {
  window.addEventListener('steluma:session-expired', () => {
    useAuthStore.setState({
      user: null,
      wallet: null,
      accessToken: null,
      isAuthenticated: false,
    })
  })
}
