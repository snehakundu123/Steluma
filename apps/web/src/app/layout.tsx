import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'Steluma — The Future of Events',
    template: '%s | Steluma',
  },
  description:
    'Discover, host, and experience events powered by Stellar blockchain. NFT tickets, organizer staking, attendance badges — all seamlessly invisible.',
  keywords: ['events', 'web3', 'stellar', 'NFT tickets', 'blockchain', 'event platform'],
  authors: [{ name: 'Steluma' }],
  creator: 'Steluma',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Steluma',
  },
  openGraph: {
    title: 'Steluma — The Future of Events',
    description: 'Events you can trust. Tickets you truly own.',
    type: 'website',
    siteName: 'Steluma',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Steluma',
    description: 'Events you can trust. Tickets you truly own.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#06070D' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <body className="font-sans antialiased">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}
