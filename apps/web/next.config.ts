import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Required for Docker standalone build — packages server + deps into one folder
  output: 'standalone',

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'gateway.pinata.cloud' },
      { protocol: 'https', hostname: 'ipfs.io' },
      { protocol: 'https', hostname: '*.ipfs.dweb.link' },
    ],
  },

  experimental: {
    serverActions: { allowedOrigins: ['localhost:3000'] },
  },

  // Suppress noisy build warnings for edge-only packages used by stellar-sdk
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
      }
    }
    return config
  },
}

export default nextConfig
