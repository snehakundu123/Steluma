import Link from 'next/link'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-50">
        <Search className="h-8 w-8 text-violet-500" />
      </div>
      <h1 className="mb-2 text-5xl font-bold text-gray-900">404</h1>
      <p className="mb-2 text-xl font-semibold text-gray-700">Page not found</p>
      <p className="mb-8 max-w-sm text-gray-500">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <div className="flex gap-3">
        <Link href="/events">
          <Button variant="gradient">Browse Events</Button>
        </Link>
        <Link href="/">
          <Button variant="outline">Go Home</Button>
        </Link>
      </div>
    </div>
  )
}
