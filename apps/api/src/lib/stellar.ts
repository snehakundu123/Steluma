import * as StellarSdk from '@stellar/stellar-sdk'
import { env } from '../config/env.js'
import { logger } from './logger.js'

const { rpc: SorobanRpc } = StellarSdk

export const stellarServer = new StellarSdk.Horizon.Server(env.STELLAR_HORIZON_URL)
export const sorobanRpc = new SorobanRpc.Server(env.STELLAR_RPC_URL)
export const adminKeypair = StellarSdk.Keypair.fromSecret(env.STELLAR_ADMIN_SECRET)
export const networkPassphrase = env.STELLAR_NETWORK_PASSPHRASE

export async function buildAndSubmitTx(
  operations: StellarSdk.xdr.Operation[],
  signerKeypair: StellarSdk.Keypair = adminKeypair,
): Promise<StellarSdk.Horizon.HorizonApi.SubmitTransactionResponse> {
  const account = await stellarServer.loadAccount(signerKeypair.publicKey())
  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase,
  })
  operations.forEach((op) => tx.addOperation(op))
  const built = tx.setTimeout(30).build()
  built.sign(signerKeypair)
  return stellarServer.submitTransaction(built)
}

// Serialize all admin invocations to prevent sequence number conflicts.
// Two concurrent admin calls would each get the same sequence number from
// getAccount() and one would be silently dropped on-chain.
const invokeQueue: Array<() => void> = []
let invokeRunning = false

async function withInvokeSerialize<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const run = async () => {
      invokeRunning = true
      try {
        resolve(await fn())
      } catch (err) {
        reject(err)
      } finally {
        invokeRunning = false
        const next = invokeQueue.shift()
        if (next) next()
      }
    }
    if (invokeRunning) {
      invokeQueue.push(run)
    } else {
      run()
    }
  })
}

export async function invokeContract(
  contractId: string,
  method: string,
  args: StellarSdk.xdr.ScVal[],
  signerKeypair: StellarSdk.Keypair = adminKeypair,
): Promise<string> {
  return withInvokeSerialize(async () => invokeContractInner(contractId, method, args, signerKeypair))
}

async function invokeContractInner(
  contractId: string,
  method: string,
  args: StellarSdk.xdr.ScVal[],
  signerKeypair: StellarSdk.Keypair,
): Promise<string> {
  const account = await sorobanRpc.getAccount(signerKeypair.publicKey())

  const contract = new StellarSdk.Contract(contractId)
  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: '5000000', // 0.5 XLM — above testnet p99 so tx always gets included
    networkPassphrase,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(300) // 300 ledgers ≈ 25 minutes — generous for testnet slowness
    .build()

  const simResult = await sorobanRpc.simulateTransaction(tx)

  if (!SorobanRpc.Api.isSimulationSuccess(simResult)) {
    logger.error('[Stellar] simulation failed', { method, contractId, error: simResult })
    throw new Error(`Contract simulation failed: ${JSON.stringify(simResult)}`)
  }

  const prepared = SorobanRpc.assembleTransaction(tx, simResult).build()
  prepared.sign(signerKeypair)

  const sendResult = await sorobanRpc.sendTransaction(prepared)

  if (sendResult.status === 'ERROR') {
    throw new Error(`Transaction send failed: ${JSON.stringify(sendResult)}`)
  }

  const txHash = sendResult.hash

  // Poll via raw JSON-RPC to avoid TransactionMetaV4 parse errors in SDK 13.x.
  // Poll every 3s for up to 5 minutes (100 attempts) — testnet confirmation can be slow.
  for (let attempts = 0; attempts < 100; attempts++) {
    await new Promise((r) => setTimeout(r, 3000))
    const res = await fetch(env.STELLAR_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTransaction', params: { hash: txHash } }),
    })
    const data = (await res.json()) as any
    const status = data.result?.status
    if (status === 'SUCCESS') {
      logger.debug('[Stellar] tx confirmed', { txHash, method })
      return txHash
    }
    if (status === 'FAILED') {
      throw new Error(`Transaction failed on-chain: ${txHash}`)
    }
    // NOT_FOUND = still pending — keep polling
  }

  // Throw a timeout error that callers can distinguish from a real failure.
  // The transaction may still confirm later — the Horizon poller will pick it up.
  const timeoutErr = new Error(`Transaction timed out: ${txHash}`) as Error & { txHash: string; isTimeout: boolean }
  timeoutErr.txHash = txHash
  timeoutErr.isTimeout = true
  throw timeoutErr
}

export function addressToScVal(address: string): StellarSdk.xdr.ScVal {
  return StellarSdk.nativeToScVal(address, { type: 'address' })
}

export function u64ToScVal(value: bigint): StellarSdk.xdr.ScVal {
  return StellarSdk.nativeToScVal(value, { type: 'u64' })
}

export function stringToScVal(value: string): StellarSdk.xdr.ScVal {
  return StellarSdk.xdr.ScVal.scvString(Buffer.from(value))
}

export function symbolToScVal(value: string): StellarSdk.xdr.ScVal {
  return StellarSdk.xdr.ScVal.scvSymbol(value)
}

export function boolToScVal(value: boolean): StellarSdk.xdr.ScVal {
  return StellarSdk.xdr.ScVal.scvBool(value)
}

export function bytesToScVal(bytes: Buffer): StellarSdk.xdr.ScVal {
  return StellarSdk.xdr.ScVal.scvBytes(bytes)
}

/**
 * Read-only contract call via simulation (never submits a transaction).
 * Returns the simulation return value as a native JS value, or null on error.
 */
export async function readContract(
  contractId: string,
  method: string,
  args: StellarSdk.xdr.ScVal[],
): Promise<unknown> {
  const account = await sorobanRpc.getAccount(adminKeypair.publicKey())
  const contract = new StellarSdk.Contract(contractId)
  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: '5000000',
    networkPassphrase,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(60)
    .build()

  const sim = await sorobanRpc.simulateTransaction(tx)
  if (!SorobanRpc.Api.isSimulationSuccess(sim)) return null

  const retval = sim.result?.retval
  if (!retval) return null

  try {
    return StellarSdk.scValToNative(retval)
  } catch {
    return null
  }
}
