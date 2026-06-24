'use client'

/**
 * WalletConnect — Stellar Freighter wallet connection component.
 *
 * This component imports directly from @stellar/freighter-api and implements:
 *  - Wallet detection (isConnected)
 *  - Permission request (requestAccess / isAllowed)
 *  - Address retrieval (getAddress)
 *  - Transaction signing (signTransaction)
 *
 * Usage:
 *   <WalletConnect />  — renders a "Connect Wallet" button when disconnected,
 *                        or the connected address with a disconnect option when connected.
 */

import {
  isConnected,
  isAllowed,
  requestAccess,
  getAddress,
  signTransaction,
  getNetworkDetails,
} from '@stellar/freighter-api'
import { useState, useEffect } from 'react'
import { Wallet, LogOut, ExternalLink, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/auth.store'
import { cn, truncateWallet } from '@/lib/utils'

export { isConnected, isAllowed, requestAccess, getAddress, signTransaction, getNetworkDetails }

type ConnectionStatus = 'idle' | 'checking' | 'not-installed' | 'connecting' | 'connected' | 'error'

interface WalletConnectProps {
  className?: string
  size?: 'sm' | 'default' | 'lg'
  showAddress?: boolean
}

export function WalletConnect({ className, size = 'default', showAddress = true }: WalletConnectProps) {
  const { connect, disconnect, isConnecting, isAuthenticated, wallet } = useAuthStore()
  const [status, setStatus] = useState<ConnectionStatus>('idle')
  const [networkName, setNetworkName] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isAuthenticated && wallet) {
      setStatus('connected')
      fetchNetwork()
    }
  }, [isAuthenticated, wallet])

  async function fetchNetwork() {
    try {
      const result = await getNetworkDetails()
      if (!result.error) {
        setNetworkName(result.network ?? 'Testnet')
      }
    } catch {
      setNetworkName('Testnet')
    }
  }

  /**
   * Full wallet connection flow:
   * 1. Detect Freighter via isConnected()
   * 2. Request permission via requestAccess() / isAllowed()
   * 3. Get wallet address via getAddress()
   * 4. Sign auth challenge via signTransaction() (in auth.store)
   */
  async function handleConnect() {
    setError(null)
    setStatus('checking')

    try {
      // Step 1: Detect if Freighter is installed
      const connectedResult = await isConnected()
      if (!connectedResult.isConnected) {
        setStatus('not-installed')
        return
      }

      setStatus('connecting')

      // Steps 2-4 handled by auth store (requestAccess → getAddress → signTransaction)
      await connect()
      setStatus('connected')
      await fetchNetwork()
    } catch (err: any) {
      const msg = err.message?.includes('User declined') || err.message?.includes('rejected')
        ? 'Connection declined — please approve in Freighter'
        : err.message ?? 'Failed to connect wallet'
      setError(msg)
      setStatus('error')
    }
  }

  function handleDisconnect() {
    setStatus('idle')
    setNetworkName('')
    setError(null)
    disconnect()
  }

  if (status === 'not-installed') {
    return (
      <div className={cn('flex flex-col gap-2', className)}>
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>Freighter wallet not found.</span>
        </div>
        <a
          href="https://freighter.app"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-1.5 text-sm text-violet-600 hover:text-violet-700 font-medium"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Install Freighter (free)
        </a>
      </div>
    )
  }

  if (status === 'connected' && wallet) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2">
          <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
          <div className="min-w-0">
            {showAddress && (
              <p className="font-mono text-xs font-medium text-green-800 truncate">
                {truncateWallet(wallet, 6)}
              </p>
            )}
            {networkName && (
              <p className="text-xs text-green-600">{networkName}</p>
            )}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDisconnect}
          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
          aria-label="Disconnect wallet"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Button
        variant="gradient"
        size={size}
        onClick={handleConnect}
        disabled={isConnecting || status === 'checking' || status === 'connecting'}
        className="gap-2 font-semibold"
      >
        {isConnecting || status === 'checking' || status === 'connecting' ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Connecting…
          </>
        ) : (
          <>
            <Wallet className="h-4 w-4" />
            Connect Wallet
          </>
        )}
      </Button>

      {error && (
        <div className="flex items-start gap-1.5 text-xs text-red-500">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  )
}

/**
 * WalletAddress — shows the connected wallet address with a link to Stellar Expert.
 * Returns null when not connected.
 */
export function WalletAddress({ className }: { className?: string }) {
  const { wallet } = useAuthStore()
  if (!wallet) return null

  return (
    <a
      href={`https://stellar.expert/explorer/testnet/account/${wallet}`}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'inline-flex items-center gap-1.5 font-mono text-sm text-muted-foreground hover:text-foreground transition-colors',
        className,
      )}
    >
      {truncateWallet(wallet, 8)}
      <ExternalLink className="h-3 w-3" />
    </a>
  )
}
