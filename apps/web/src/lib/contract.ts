import * as StellarSdk from '@stellar/stellar-sdk'
import { rpc, scValToNative } from '@stellar/stellar-sdk'
import { server, networkPassphrase } from './stellar-sdk'

export const CONTRACT_ID =
  process.env.NEXT_PUBLIC_CONTRACT_ID ??
  'CDEF2BFQPP47BC24VR2FESSMKZWNHWVZQA42YKFDO5JUBX5PSE5QEQQ7'

// Full mutation flow: simulate → assemble → sign → submit
export async function callContractFunction(
  contractId: string,
  method: string,
  args: StellarSdk.xdr.ScVal[],
  signerSecret: string,
): Promise<rpc.Api.SendTransactionResponse> {
  const keypair = StellarSdk.Keypair.fromSecret(signerSecret)
  const account = await server.getAccount(keypair.publicKey())
  const contract = new StellarSdk.Contract(contractId)

  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build()

  const simResult = await server.simulateTransaction(tx)
  if (rpc.Api.isSimulationError(simResult)) {
    throw new Error(`Simulation failed: ${simResult.error}`)
  }

  const assembledTx = rpc.assembleTransaction(tx, simResult).build()
  assembledTx.sign(keypair)
  return server.sendTransaction(assembledTx)
}

// Read-only simulation — no signing or submission required
export async function readContractFunction(
  contractId: string,
  method: string,
  args: StellarSdk.xdr.ScVal[],
  sourceAddress: string,
): Promise<unknown> {
  const account = await server.getAccount(sourceAddress)
  const contract = new StellarSdk.Contract(contractId)

  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build()

  const simResult = await server.simulateTransaction(tx)
  if (rpc.Api.isSimulationError(simResult) || !simResult.result) return null
  return scValToNative(simResult.result.retval)
}
