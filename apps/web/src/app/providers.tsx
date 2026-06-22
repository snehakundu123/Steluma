'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { Toaster } from 'react-hot-toast'
import { useState, useEffect } from 'react'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  )

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster
        position="top-right"
        gutter={8}
        toastOptions={{
          duration: 4000,
          style: {
            background: 'hsl(var(--card))',
            color: 'hsl(var(--card-foreground))',
            borderRadius: '12px',
            fontSize: '14px',
            fontWeight: '500',
            border: '1px solid hsl(var(--border))',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            padding: '12px 16px',
            maxWidth: '380px',
          },
          success: {
            iconTheme: { primary: '#10B981', secondary: '#fff' },
            style: {
              borderLeft: '3px solid #10B981',
            },
          },
          error: {
            iconTheme: { primary: '#EF4444', secondary: '#fff' },
            style: {
              borderLeft: '3px solid #EF4444',
            },
          },
          loading: {
            iconTheme: { primary: '#7C3AED', secondary: 'rgba(124,58,237,0.2)' },
          },
        }}
      />
      {process.env.NODE_ENV === 'development' && <ReactQueryDevtools position="bottom" />}
    </QueryClientProvider>
  )
}
