'use client'

import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Star, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'

export function EventRating({ eventId }: { eventId: string }) {
  const { isAuthenticated } = useAuthStore()
  const [rating, setRating] = useState(0)
  const [hover, setHover] = useState(0)
  const [review, setReview] = useState('')
  const [submitted, setSubmitted] = useState(false)

  // Check if user has a check-in for this event (can rate)
  const { data: tickets } = useQuery({
    queryKey: ['my-tickets'],
    queryFn: () => api.get<{ data: any[] }>('/users/me/tickets'),
    enabled: isAuthenticated,
  })

  const canRate = isAuthenticated && tickets?.data?.some(
    (t: any) => t.eventId === eventId && t.status === 'CHECKED_IN',
  )

  const submit = useMutation({
    mutationFn: () => api.post(`/reputation/events/${eventId}/rate`, { rating, review: review.trim() || undefined }),
    onSuccess: () => {
      setSubmitted(true)
      toast.success('Rating submitted! Thank you.')
    },
    onError: (err: any) => {
      if (err.code === 'ALREADY_RATED') {
        setSubmitted(true)
        toast('You have already rated this event')
      } else {
        toast.error(err.message ?? 'Failed to submit rating')
      }
    },
  })

  if (!isAuthenticated || !canRate) return null

  if (submitted) {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-5 text-center">
        <Check className="mx-auto mb-2 h-8 w-8 text-green-500" />
        <p className="text-sm font-medium text-green-800">Rating submitted — thanks!</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">Rate This Event</h2>
      <p className="mb-4 text-sm text-gray-500">You attended this event — share your experience.</p>

      {/* Star picker */}
      <div className="mb-4 flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => setRating(star)}
            onMouseEnter={() => setHover(star)}
            onMouseLeave={() => setHover(0)}
            className="transition-transform hover:scale-110"
          >
            <Star
              className={`h-8 w-8 transition-colors ${
                star <= (hover || rating) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-200'
              }`}
            />
          </button>
        ))}
      </div>

      <Textarea
        placeholder="Optional: share what you loved or what could improve…"
        value={review}
        onChange={(e) => setReview(e.target.value)}
        rows={3}
        maxLength={1000}
        className="mb-4"
      />

      <Button
        variant="gradient"
        onClick={() => submit.mutate()}
        disabled={rating === 0 || submit.isPending}
        loading={submit.isPending}
        className="w-full"
      >
        Submit Rating
      </Button>
    </div>
  )
}
