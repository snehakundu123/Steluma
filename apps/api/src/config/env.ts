import { z } from 'zod'

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_PORT: z.coerce.number().default(4000),
  API_HOST: z.string().default('0.0.0.0'),
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  JWT_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),
  // Separate secret for QR code signing — keep distinct from JWT_SECRET
  QR_SIGNING_SECRET: z.string().min(32).optional(),

  STELLAR_NETWORK: z.enum(['testnet', 'mainnet']).default('testnet'),
  STELLAR_HORIZON_URL: z.string().url(),
  STELLAR_RPC_URL: z.string().url(),
  STELLAR_NETWORK_PASSPHRASE: z.string().min(1),
  STELLAR_ADMIN_SECRET: z.string().min(1),

  EVENT_FACTORY_CONTRACT_ID: z.string().default(''),
  TICKET_NFT_CONTRACT_ID: z.string().default(''),
  ATTENDANCE_BADGE_CONTRACT_ID: z.string().default(''),
  STAKING_CONTRACT_ID: z.string().default(''),
  MARKETPLACE_CONTRACT_ID: z.string().default(''),

  PINATA_JWT: z.string().default(''),
  IPFS_GATEWAY: z.string().default('https://gateway.pinata.cloud/ipfs'),
})

function parseEnv() {
  const result = schema.safeParse(process.env)
  if (!result.success) {
    console.error('❌ Invalid environment variables:')
    console.error(result.error.flatten().fieldErrors)
    process.exit(1)
  }
  return result.data
}

export const env = parseEnv()
export type Env = typeof env
