import { Navbar } from '@/components/layout/navbar'

export default function EventDetailLoading() {
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-background pb-20">
        {/* Hero banner skeleton */}
        <div className="skeleton h-64 sm:h-80 lg:h-96 w-full" />

        {/* Content area */}
        <div className="mx-auto max-w-7xl px-4 sm:px-6 pt-8">
          <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
            {/* Left column */}
            <div className="space-y-6">
              {/* Title */}
              <div className="space-y-3">
                <div className="skeleton h-10 w-3/4 rounded-xl" />
                <div className="skeleton h-5 w-1/2 rounded-lg" />
              </div>

              {/* Meta row — date, location, attendees */}
              <div className="flex flex-wrap gap-4">
                <div className="skeleton h-5 w-36 rounded-md" />
                <div className="skeleton h-5 w-28 rounded-md" />
                <div className="skeleton h-5 w-24 rounded-md" />
              </div>

              {/* Progress bar */}
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <div className="skeleton h-3 w-16 rounded" />
                  <div className="skeleton h-3 w-20 rounded" />
                </div>
                <div className="skeleton h-1.5 w-full rounded-full" />
              </div>

              {/* Description block */}
              <div className="space-y-2 pt-2">
                <div className="skeleton h-5 w-40 rounded" />
                <div className="skeleton h-4 w-full rounded" />
                <div className="skeleton h-4 w-full rounded" />
                <div className="skeleton h-4 w-5/6 rounded" />
                <div className="skeleton h-4 w-4/5 rounded" />
                <div className="skeleton h-4 w-3/4 rounded" />
              </div>

              {/* Organizer card */}
              <div className="rounded-2xl border border-border bg-card p-5">
                <div className="skeleton h-4 w-28 rounded mb-4" />
                <div className="flex items-center gap-4">
                  <div className="skeleton h-12 w-12 rounded-full flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="skeleton h-4 w-36 rounded" />
                    <div className="skeleton h-3 w-24 rounded" />
                  </div>
                </div>
              </div>
            </div>

            {/* Right column — purchase card */}
            <div className="hidden lg:block">
              <div className="sticky top-24">
                <div className="skeleton h-96 w-full rounded-2xl" />
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  )
}
