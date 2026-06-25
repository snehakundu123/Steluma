'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2, CheckCircle, XCircle, Shield, ExternalLink, Sparkles } from 'lucide-react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { signXdr } from '@/lib/freighter'
import { useAuthStore } from '@/store/auth.store'
import { formatXLM } from '@/lib/utils'
import { getEvent, CONTRACT_IDS } from '@/lib/soroban'

type Tier = {
  id: string
  name: string
  description?: string
  price: string
  priceAsset: string
  totalSupply: number
  sold: number
  available: number
  perks: string[]
}

type Props = {
  event: {
    id: string
    slug: string
    status: string
    royaltyBps: number
    onChainEventId?: bigint | null
    ticketTiers: Tier[]
    stake?: { amount: string } | null
  }
}

type PurchaseStep = 'idle' | 'confirming' | 'signing' | 'submitting' | 'done' | 'error'

function TierCard({
  tier,
  eventSlug,
  onBuy,
}: {
  tier: Tier
  eventSlug: string
  onBuy: (tier: Tier) => void
}) {
  const { isAuthenticated } = useAuthStore()
  const soldOut = tier.available === 0

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">{tier.name}</h3>
          {tier.description && (
            <p className="mt-0.5 text-sm text-gray-500">{tier.description}</p>
          )}
        </div>
        <div className="text-right">
          {Number(tier.price) > 0 ? (
            <>
              <div className="text-xl font-bold text-gray-900">{formatXLM(tier.price)}</div>
              <div className="text-sm text-gray-500">{tier.priceAsset}</div>
            </>
          ) : (
            <div className="text-xl font-bold text-green-600">Free</div>
          )}
        </div>
      </div>

      {tier.perks?.length > 0 && (
        <ul className="mb-4 space-y-1">
          {tier.perks.map((perk) => (
            <li key={perk} className="flex items-center gap-2 text-sm text-gray-600">
              <span className="text-green-500">✓</span> {perk}
            </li>
          ))}
        </ul>
      )}

      <div className="mb-4">
        <div className="mb-1 flex justify-between text-xs text-gray-400">
          <span>{tier.available} remaining</span>
          <span>{tier.totalSupply} total</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-violet-500"
            style={{ width: `${(tier.sold / tier.totalSupply) * 100}%` }}
          />
        </div>
      </div>

      {soldOut ? (
        <Button variant="outline" className="w-full" disabled>Sold Out</Button>
      ) : isAuthenticated ? (
        <Button variant="gradient" className="w-full" onClick={() => onBuy(tier)}>
          Get Ticket
        </Button>
      ) : (
        <Link href={`/connect?redirect=/events/${eventSlug}`}>
          <Button variant="gradient" className="w-full">Connect Wallet to Buy</Button>
        </Link>
      )}
    </div>
  )
}

export function TicketPurchasePanel({ event }: Props) {
  const router = useRouter()
  const { wallet } = useAuthStore()
  const [selectedTier, setSelectedTier] = useState<Tier | null>(null)
  const [step, setStep] = useState<PurchaseStep>('idle')
  const [purchasedTicket, setPurchasedTicket] = useState<{ id: string; ticketNumber: number } | null>(null)
  const [mintedTokenId, setMintedTokenId] = useState<string | null>(null)
  const [mintTxHash, setMintTxHash] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [onChainSold, setOnChainSold] = useState<number | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Query EventFactory.get_event on-chain to show live sold/remaining count
  useEffect(() => {
    if (!wallet || event.onChainEventId == null) return
    getEvent(wallet, event.onChainEventId).then((data) => {
      if (data) setOnChainSold(data.ticketsSold)
    }).catch(() => { /* non-critical */ })
  }, [wallet, event.onChainEventId])

  async function handleBuy(tier: Tier) {
    if (!wallet) return
    setSelectedTier(tier)
    setStep('confirming')
  }

  async function executePurchase() {
    if (!selectedTier || !wallet) return
    setStep('signing')
    setErrorMsg('')

    try {
      // 1. Initiate purchase — get XDR to sign
      const purchase = await api.post<{
        purchaseId: string
        transaction: { xdr: string; networkPassphrase: string }
        totalAmount: string
      }>('/tickets/purchase', {
        eventId: event.id,
        tierId: selectedTier.id,
        quantity: 1,
        buyerWallet: wallet,
      })

      // 2. Sign with Freighter
      const signedXdr = await signXdr(
        purchase.transaction.xdr,
        purchase.transaction.networkPassphrase,
      )

      setStep('submitting')

      // 3. Submit to Stellar Horizon
      const params = new URLSearchParams({ tx: signedXdr })
      const horizonUrl = process.env.NEXT_PUBLIC_STELLAR_NETWORK === 'mainnet'
        ? 'https://horizon.stellar.org/transactions'
        : 'https://horizon-testnet.stellar.org/transactions'

      const horizonRes = await fetch(horizonUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params,
      })
      const horizonData = await horizonRes.json()
      if (!horizonData.hash) {
        throw new Error(horizonData.extras?.result_codes?.transaction ?? 'Transaction failed')
      }

      // 4. Confirm purchase with our API
      const confirmation = await api.post<{
        tickets: Array<{ id: string; ticketNumber: number }>
      }>(`/tickets/purchase/${purchase.purchaseId}/confirm`, { txHash: horizonData.hash })

      const ticket = confirmation.tickets[0]
      setPurchasedTicket(ticket)
      setStep('done')
      toast.success('Ticket purchased! Your NFT is minting on Stellar…')

      // Poll until the NFT is minted (backend mints async in ~5-30s)
      let attempts = 0
      pollRef.current = setInterval(async () => {
        attempts++
        if (attempts > 30) { clearInterval(pollRef.current!); return }
        try {
          const t = await api.get<{ onChainTokenId?: string; mintTxHash?: string; status: string }>(
            `/tickets/${ticket.id}`
          )
          if (t.onChainTokenId) {
            setMintedTokenId(t.onChainTokenId)
            setMintTxHash(t.mintTxHash ?? null)
            clearInterval(pollRef.current!)
            toast.success(`NFT #${t.onChainTokenId} minted on Stellar! 🎉`)
          }
        } catch { /* ignore poll errors */ }
      }, 3000)
    } catch (err: any) {
      const msg = err.message?.includes('User declined')
        ? 'Signing cancelled'
        : err.message ?? 'Purchase failed'
      setErrorMsg(msg)
      setStep('error')
      toast.error(msg)
    }
  }

  function closeModal() {
    if (pollRef.current) clearInterval(pollRef.current)
    setSelectedTier(null)
    setStep('idle')
    setErrorMsg('')
    setPurchasedTicket(null)
    setMintedTokenId(null)
    setMintTxHash(null)
  }

  return (
    <>
      {/* Draft / Staked state */}
      {(event.status === 'DRAFT' || event.status === 'STAKED') && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-start gap-3">
            <div className="text-2xl">🔒</div>
            <div>
              <h3 className="font-semibold text-amber-900">
                {event.status === 'DRAFT' ? 'Stake Required to Publish' : 'Awaiting Stake Confirmation'}
              </h3>
              <p className="mt-1 text-sm text-amber-700">
                Stake XLM to make this event visible and open for ticket sales.
              </p>
              <Link href={`/events/${event.slug}/stake`} className="mt-3 block">
                <Button variant="gradient" size="sm" className="w-full">Stake & Publish →</Button>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Tier cards */}
      {event.ticketTiers?.map((tier) => (
        <TierCard key={tier.id} tier={tier} eventSlug={event.slug} onBuy={handleBuy} />
      ))}

      {/* Blockchain info */}
      <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 text-xs text-gray-500">
        <div className="mb-1 font-medium text-gray-700">Blockchain Info</div>
        <div>Network: Stellar Testnet</div>
        {event.onChainEventId != null && (
          <>
            <div>Event ID: #{String(event.onChainEventId)}</div>
            {onChainSold !== null && (
              <div className="text-violet-600 font-medium">
                On-chain sold: {onChainSold} (via EventFactory.get_event)
              </div>
            )}
            <a
              href={`https://stellar.expert/explorer/testnet/contract/${CONTRACT_IDS.eventFactory}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-violet-500 hover:text-violet-700 mt-1"
            >
              <ExternalLink className="h-3 w-3" />
              View EventFactory contract
            </a>
          </>
        )}
        <div>Royalty: {(event.royaltyBps ?? 500) / 100}% on resales</div>
      </div>

      {/* Purchase modal */}
      <AnimatePresence>
        {selectedTier && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
            >
              {step === 'confirming' && (
                <>
                  <h3 className="mb-4 text-lg font-bold text-gray-900">Confirm Purchase</h3>
                  <div className="mb-4 rounded-xl bg-gray-50 p-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Ticket</span>
                      <span className="font-medium text-gray-900">{selectedTier.name}</span>
                    </div>
                    <div className="mt-2 flex justify-between text-sm">
                      <span className="text-gray-500">Price</span>
                      <span className="font-bold text-gray-900">
                        {Number(selectedTier.price) === 0 ? 'Free' : `${formatXLM(selectedTier.price)} ${selectedTier.priceAsset}`}
                      </span>
                    </div>
                  </div>
                  <div className="mb-4 flex items-start gap-2 rounded-xl bg-violet-50 p-3 text-xs text-violet-700">
                    <Shield className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    Freighter will ask you to sign & submit a Stellar transaction. This is real XLM on testnet.
                  </div>
                  <div className="flex gap-3">
                    <Button variant="outline" className="flex-1" onClick={closeModal}>Cancel</Button>
                    <Button variant="gradient" className="flex-1" onClick={executePurchase}>
                      Sign & Buy
                    </Button>
                  </div>
                </>
              )}

              {(step === 'signing' || step === 'submitting') && (
                <div className="py-6 text-center">
                  <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-violet-500" />
                  <p className="font-semibold text-gray-900">
                    {step === 'signing' ? 'Waiting for signature…' : 'Submitting to Stellar…'}
                  </p>
                  <p className="mt-1 text-sm text-gray-500">
                    {step === 'signing'
                      ? 'Approve the transaction in Freighter'
                      : 'Broadcasting to the network'}
                  </p>
                </div>
              )}

              {step === 'done' && purchasedTicket && (
                <div className="py-2">
                  <div className="mb-4 text-center">
                    <CheckCircle className="mx-auto mb-3 h-12 w-12 text-green-500" />
                    <h3 className="text-lg font-bold text-gray-900">
                      Ticket #{purchasedTicket.ticketNumber} is yours!
                    </h3>
                  </div>

                  {/* NFT status card */}
                  <div className={`mb-4 rounded-xl border p-4 ${mintedTokenId ? 'border-green-200 bg-green-50' : 'border-violet-100 bg-violet-50'}`}>
                    {mintedTokenId ? (
                      <div>
                        <div className="flex items-center gap-2 text-green-700 font-medium text-sm mb-2">
                          <Sparkles className="h-4 w-4" /> NFT minted on Stellar!
                        </div>
                        <div className="text-xs text-green-600 space-y-1">
                          <div>Token ID: <span className="font-mono font-bold">#{mintedTokenId}</span></div>
                          <div className="text-xs text-gray-500">
                            This NFT lives in your Stellar wallet (<span className="font-mono">{wallet?.slice(0, 12)}…</span>).
                            Freighter doesn&apos;t display Soroban NFTs visually, but ownership is on-chain.
                          </div>
                        </div>
                        {mintTxHash && (
                          <a
                            href={`https://stellar.expert/explorer/testnet/tx/${mintTxHash}`}
                            target="_blank" rel="noopener noreferrer"
                            className="mt-2 inline-flex items-center gap-1 text-xs text-violet-600 hover:underline"
                          >
                            <ExternalLink className="h-3 w-3" /> View mint transaction on Stellar Expert
                          </a>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <Loader2 className="h-4 w-4 animate-spin text-violet-500 flex-shrink-0" />
                        <div>
                          <div className="text-sm font-medium text-violet-700">Minting your NFT…</div>
                          <div className="text-xs text-violet-500 mt-0.5">Usually takes 5–30 seconds on Stellar testnet</div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Where to find it */}
                  <div className="mb-4 rounded-xl bg-gray-50 border border-gray-100 p-3 text-xs text-gray-500 space-y-1.5">
                    <div className="font-medium text-gray-700 mb-1">Where to find your ticket</div>
                    <div className="flex items-start gap-2">
                      <span className="text-violet-500 font-bold mt-0.5">①</span>
                      <span><strong>My Tickets</strong> — QR code to show at the door, resale options</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-violet-500 font-bold mt-0.5">②</span>
                      <span><strong>Stellar Expert</strong> — verify NFT ownership on-chain</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-violet-500 font-bold mt-0.5">③</span>
                      <span><strong>Your Freighter wallet</strong> holds the NFT (Soroban tokens aren&apos;t shown in Freighter UI yet, but ownership is provable)</span>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <Button variant="outline" className="flex-1" onClick={closeModal}>Back to Event</Button>
                    <Button variant="gradient" className="flex-1" onClick={() => router.push('/user')}>
                      My Tickets →
                    </Button>
                  </div>

                  {wallet && (
                    <div className="mt-3 text-center">
                      <a
                        href={`https://stellar.expert/explorer/testnet/account/${wallet}`}
                        target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-violet-600"
                      >
                        <ExternalLink className="h-3 w-3" />
                        View your wallet on Stellar Expert
                      </a>
                    </div>
                  )}
                </div>
              )}

              {step === 'error' && (
                <div className="py-4 text-center">
                  <XCircle className="mx-auto mb-3 h-12 w-12 text-red-400" />
                  <h3 className="text-lg font-bold text-gray-900">Purchase Failed</h3>
                  <p className="mt-1 text-sm text-gray-500">{errorMsg}</p>
                  <div className="mt-4 flex gap-3">
                    <Button variant="outline" className="flex-1" onClick={closeModal}>Cancel</Button>
                    <Button variant="gradient" className="flex-1" onClick={() => setStep('confirming')}>
                      Try Again
                    </Button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  )
}
