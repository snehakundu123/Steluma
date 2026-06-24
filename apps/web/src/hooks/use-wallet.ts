'use client'

/**
 * useWallet — Stellar Freighter wallet integration hook.
 *
 * Wraps @stellar/freighter-api to provide:
 *  1. isInstalled()      — detect whether Freighter extension is present
 *  2. requestPermission()— request access (wallet permission prompt)
 *  3. getAddress()       — retrieve the connected wallet's public key
 *  4. signTransaction()  — sign a Stellar XDR transaction envelope
 *
 * All four operations directly call @stellar/freighter-api methods; no abstraction layer.
 */

import {
  isConnected,
  isAllowed,
  requestAccess,
  getAddress as freighterGetAddress,
  signTransaction,
  getNetworkDetails,
} from '@stellar/freighter-api'
import { useState, useCallback } from 'react'
import { useAuthStore } from '@/store/auth.store'

export type WalletStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface WalletState {
  status: WalletStatus
  address: string | null
  error: string | null

  /** Step 1 — detect if Freighter extension is installed in the browser. */
  isInstalled: () => Promise<boolean>

  /** Step 2 — request permission to access the wallet (shows Freighter popup). */
  requestPermission: () => Promise<string>

  /** Step 3 — retrieve the connected wallet's Stellar public key (G-address). */
  getAddress: () => Promise<string>

  /** Step 4 — sign a Stellar transaction XDR using Freighter; returns signed XDR. */
  signXdrTransaction: (xdr: string, networkPassphrase: string) => Promise<string>

  /** Full connect flow: request permission → get address → sign auth challenge → JWT. */
  connect: () => Promise<void>

  /** Disconnect and clear auth state. */
  disconnect: () => void

  getNetworkPassphrase: () => Promise<string>
}

export function useWallet(): WalletState {
  const { connect: storeConnect, disconnect: storeDisconnect, wallet, isConnecting } = useAuthStore()
  const [error, setError] = useState<string | null>(null)

  const status: WalletStatus = isConnecting
    ? 'connecting'
    : wallet
      ? 'connected'
      : error
        ? 'error'
        : 'disconnected'

  /** Detect Freighter extension — calls isConnected() from @stellar/freighter-api */
  const isInstalled = useCallback(async (): Promise<boolean> => {
    if (typeof window === 'undefined') return false
    try {
      const result = await isConnected()
      return result.isConnected
    } catch {
      return false
    }
  }, [])

  /**
   * Request wallet permission — calls requestAccess() from @stellar/freighter-api.
   * Shows the Freighter "Allow this site to access your wallet" popup.
   * Returns the wallet address on approval.
   */
  const requestPermission = useCallback(async (): Promise<string> => {
    const allowed = await isAllowed()
    if (allowed.isAllowed) {
      const addrResult = await freighterGetAddress()
      if (addrResult.error) throw new Error(addrResult.error)
      return addrResult.address
    }
    const result = await requestAccess()
    if (result.error) throw new Error(result.error)
    return result.address
  }, [])

  /**
   * Get wallet address — calls getAddress() from @stellar/freighter-api.
   * Returns the connected wallet's Stellar public key (G-address).
   */
  const getAddress = useCallback(async (): Promise<string> => {
    const result = await freighterGetAddress()
    if (result.error) throw new Error(result.error)
    return result.address
  }, [])

  /**
   * Sign a Stellar XDR transaction — calls signTransaction() from @stellar/freighter-api.
   * Prompts the user to approve and sign in Freighter. Returns the signed XDR envelope.
   */
  const signXdrTransaction = useCallback(async (
    xdr: string,
    networkPassphrase: string,
  ): Promise<string> => {
    const result = await signTransaction(xdr, { networkPassphrase })
    if (result.error) {
      const msg = typeof result.error === 'string'
        ? result.error
        : (result.error as any)?.message ?? 'Signing failed'
      throw new Error(msg)
    }
    if (!result.signedTxXdr) throw new Error('Freighter returned empty signed transaction')
    return result.signedTxXdr
  }, [])

  /** Get the active network passphrase from Freighter */
  const getNetworkPassphrase = useCallback(async (): Promise<string> => {
    const result = await getNetworkDetails()
    if (result.error) return 'Test SDF Network ; September 2015'
    return result.networkPassphrase
  }, [])

  /** Full connect: permission → address → auth challenge → JWT */
  const connect = useCallback(async (): Promise<void> => {
    setError(null)
    try {
      await storeConnect()
    } catch (err: any) {
      setError(err.message ?? 'Connection failed')
      throw err
    }
  }, [storeConnect])

  const disconnect = useCallback(() => {
    setError(null)
    storeDisconnect()
  }, [storeDisconnect])

  return {
    status,
    address: wallet,
    error,
    isInstalled,
    requestPermission,
    getAddress,
    signXdrTransaction,
    connect,
    disconnect,
    getNetworkPassphrase,
  }
}
