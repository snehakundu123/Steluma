import { describe, it, expect } from 'vitest'
import { ApiError } from '@/lib/api'

// ── ApiError ──────────────────────────────────────────────────────────────────

describe('ApiError', () => {
  it('is an instance of Error', () => {
    const err = new ApiError('something went wrong', 400)
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(ApiError)
  })

  it('stores the HTTP status code', () => {
    const err = new ApiError('not found', 404)
    expect(err.status).toBe(404)
    expect(err.message).toBe('not found')
  })

  it('stores an optional error code', () => {
    const err = new ApiError('unauthorized', 401, 'TOKEN_EXPIRED')
    expect(err.code).toBe('TOKEN_EXPIRED')
  })

  it('has name set to ApiError', () => {
    const err = new ApiError('server error', 500)
    expect(err.name).toBe('ApiError')
  })

  it('works without an error code', () => {
    const err = new ApiError('forbidden', 403)
    expect(err.code).toBeUndefined()
  })

  it('can be caught as a standard Error', () => {
    const thrower = () => {
      throw new ApiError('conflict', 409, 'DUPLICATE')
    }
    expect(thrower).toThrowError(ApiError)
  })

  it('differentiates 4xx from 5xx', () => {
    const clientErr = new ApiError('bad request', 400)
    const serverErr = new ApiError('internal error', 500)

    expect(clientErr.status).toBeLessThan(500)
    expect(serverErr.status).toBeGreaterThanOrEqual(500)
  })
})
