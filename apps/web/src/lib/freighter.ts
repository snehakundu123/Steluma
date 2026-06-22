'use client'

import {
  isConnected,
  getAddress,
  signTransaction,
  requestAccess,
  isAllowed,
  getNetworkDetails,
  signMessage as freighterSignMessage,
} from '@stellar/freighter-api'

const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015'

/** Returns null if Freighter is on testnet, or an error string if not. */
export async function checkFreighterNetwork(): Promise<string | null> {
  try {
    const result = await getNetworkDetails()
    if (result.error) return null // can't determine — don't block
    if (result.networkPassphrase === TESTNET_PASSPHRASE) return null
    const name = result.network ?? result.networkPassphrase?.split(';')[0]?.trim() ?? 'unknown'
    return `Freighter is set to "${name}". Please switch to Testnet in Freighter settings and try again.`
  } catch {
    return null // can't determine — don't block
  }
}

export async function isFreighterInstalled(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  try {
    const result = await isConnected()
    return result.isConnected
  } catch {
    return false
  }
}

export async function connectFreighter(): Promise<string> {
  const allowed = await isAllowed()
  if (!allowed.isAllowed) {
    const result = await requestAccess()
    if (result.error) throw new Error(result.error)
    return result.address
  }

  const result = await getAddress()
  if (result.error) throw new Error(result.error)
  return result.address
}

export async function getConnectedWallet(): Promise<string | null> {
  try {
    const allowed = await isAllowed()
    if (!allowed.isAllowed) return null
    const result = await getAddress()
    return result.error ? null : result.address
  } catch {
    return null
  }
}

export async function signXdr(xdr: string, network: string, address?: string): Promise<string> {
  const result = await signTransaction(xdr, {
    networkPassphrase: network,
    ...(address ? { address } : {}),
  })
  if (result.error) {
    const msg = typeof result.error === 'string' ? result.error : (result.error as any)?.message ?? 'Freighter signing failed'
    throw new Error(msg)
  }
  if (!result.signedTxXdr) throw new Error('Freighter returned an empty signed transaction')
  return result.signedTxXdr
}

export async function signMessage(message: string): Promise<string> {
  // Freighter requires the address of the signing key; fetch it first
  const addrResult = await getAddress()
  const address = addrResult.error ? '' : addrResult.address

  const result = await freighterSignMessage(message, { address })
  if (result.error) throw new Error(result.error)

  // signedMessage may be a Uint8Array, Buffer, or already-base64 string depending on Freighter version
  const signed = (result as any).signedMessage
  if (!signed) throw new Error('No signed message returned')

  if (typeof signed === 'string') {
    // Already base64 or hex — if it looks like base64 return as-is, else encode
    try {
      Buffer.from(signed, 'base64')
      return signed
    } catch {
      return Buffer.from(signed).toString('base64')
    }
  }
  // Uint8Array / Buffer
  return Buffer.from(signed).toString('base64')
}
