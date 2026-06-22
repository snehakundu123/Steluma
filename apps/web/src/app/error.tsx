'use client'

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50">
        <AlertTriangle className="h-8 w-8 text-red-500" />
      </div>
      <h1 className="mb-2 text-2xl font-bold text-gray-900">Something went wrong</h1>
      <p className="mb-8 max-w-sm text-gray-500">
        An unexpected error occurred. Our team has been notified.
      </p>
      <div className="flex gap-3">
        <Button variant="gradient" onClick={reset}>Try again</Button>
        <Button variant="outline" onClick={() => (window.location.href = '/')}>Go home</Button>
      </div>
      {error.digest && (
        <p className="mt-6 font-mono text-xs text-gray-300">Error ID: {error.digest}</p>
      )}
    </div>
  )
}
