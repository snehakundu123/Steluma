import * as StellarSdk from '@stellar/stellar-sdk'
import { rpc } from '@stellar/stellar-sdk'

export { StellarSdk }

export const networkPassphrase: string =
  process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE ?? StellarSdk.Networks.TESTNET

const SOROBAN_RPC_URL: string =
  process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ?? 'https://soroban-testnet.stellar.org'

export const server = new rpc.Server(SOROBAN_RPC_URL, { allowHttp: false })
