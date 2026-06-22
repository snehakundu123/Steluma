const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

const ACCESS_KEY = 'steluma:access_token'
const REFRESH_KEY = 'steluma:refresh_token'

export class ApiError extends Error {
  code?: string
  status: number
  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

class ApiClient {
  private baseUrl: string
  private refreshPromise: Promise<string | null> | null = null

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  private getAccessToken(): string | null {
    if (typeof window === 'undefined') return null
    return localStorage.getItem(ACCESS_KEY)
  }

  private getRefreshToken(): string | null {
    if (typeof window === 'undefined') return null
    return localStorage.getItem(REFRESH_KEY)
  }

  private setAccessToken(token: string) {
    if (typeof window !== 'undefined') localStorage.setItem(ACCESS_KEY, token)
  }

  private clearTokens() {
    if (typeof window === 'undefined') return
    localStorage.removeItem(ACCESS_KEY)
    localStorage.removeItem(REFRESH_KEY)
  }

  /** Notify the rest of the app (auth store) that the session is dead. */
  private emitLogout() {
    if (typeof window === 'undefined') return
    this.clearTokens()
    window.dispatchEvent(new CustomEvent('steluma:session-expired'))
  }

  /**
   * Exchange the refresh token for a new access token.
   * De-duplicated: concurrent 401s share a single refresh request.
   */
  private async refreshAccessToken(): Promise<string | null> {
    if (this.refreshPromise) return this.refreshPromise

    const refreshToken = this.getRefreshToken()
    if (!refreshToken) return null

    this.refreshPromise = (async () => {
      try {
        const res = await fetch(`${this.baseUrl}/api/v1/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        })
        if (!res.ok) {
          this.emitLogout()
          return null
        }
        const data = await res.json()
        if (data.accessToken) {
          this.setAccessToken(data.accessToken)
          return data.accessToken as string
        }
        this.emitLogout()
        return null
      } catch {
        // Network error — don't nuke the session, just fail this request
        return null
      } finally {
        this.refreshPromise = null
      }
    })()

    return this.refreshPromise
  }

  private async request<T>(path: string, init: RequestInit = {}, isRetry = false): Promise<T> {
    const token = this.getAccessToken()
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...((init.headers as Record<string, string>) ?? {}),
    }

    const res = await fetch(`${this.baseUrl}/api/v1${path}`, { ...init, headers })

    // Token expired / invalid → try one refresh + retry, then give up.
    if (res.status === 401 && !isRetry && !path.startsWith('/auth/')) {
      const newToken = await this.refreshAccessToken()
      if (newToken) {
        return this.request<T>(path, init, true)
      }
    }

    if (!res.ok) {
      const err = await res
        .json()
        .catch(() => ({ error: { code: 'UNKNOWN', message: res.statusText } }))
      throw new ApiError(
        err.error?.message ?? err.message ?? 'Request failed',
        res.status,
        err.error?.code ?? err.code,
      )
    }

    if (res.status === 204) return undefined as T
    return res.json()
  }

  get = <T>(path: string) => this.request<T>(path)
  post = <T>(path: string, body?: unknown) =>
    this.request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined })
  patch = <T>(path: string, body?: unknown) =>
    this.request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined })
  delete = <T>(path: string) => this.request<T>(path, { method: 'DELETE' })
}

export const api = new ApiClient(BASE)
