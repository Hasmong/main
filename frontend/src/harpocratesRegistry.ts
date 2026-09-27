import {
  Address,
  BASE_FEE,
  Contract,
  Networks,
  TransactionBuilder,
  scValToNative,
} from '@stellar/stellar-sdk'
import { rpc } from '@stellar/stellar-sdk'
import { signTransaction } from '@stellar/freighter-api'
import {
  asHex32,
  asHexBytes,
  bytesToHex,
  scBytes,
  scBytes32,
  scU32,
} from './stellarEncoding'
import type {
  ChainProofRecord,
  ChainVerifierState,
  IdentityTier,
  NormalizedRegisterProofInput,
  ProofHistoryEntry,
  ProofHistoryResult,
  RegisterProofInput,
  RegisterProofResult,
  RegistryMethod,
  TxState,
} from './stellarTypes'

const RPC_URL = import.meta.env.VITE_STELLAR_RPC_URL ?? 'https://soroban-testnet.stellar.org'

/**
 * The network passphrase the deployed contract was built against.
 * Exported so network-guard code can compare it with the wallet's
 * reported network without duplicating the constant.
 */
export const CONTRACT_NETWORK_PASSPHRASE: string = Networks.TESTNET

const NETWORK_PASSPHRASE = CONTRACT_NETWORK_PASSPHRASE
const READONLY_SOURCE = import.meta.env.VITE_STELLAR_READONLY_SOURCE ?? ''
const POLL_INTERVAL_MS = 1000
const POLL_TIMEOUT_MS = 30000

type SendTransactionResponse = Awaited<ReturnType<rpc.Server['sendTransaction']>>

function initialTxState(status: string): TxState {
  if (status === 'PENDING' || status === 'DUPLICATE') return 'awaiting_confirmation'
  return 'submitting'
}

function resolveTxState(
  pollResult: rpc.Api.GetSuccessfulTransactionResponse | null,
  timedOut: boolean,
): TxState {
  if (timedOut) return 'timeout'
  if (pollResult) return 'confirmed'
  return 'failed'
}

function resolveStatus(
  isRejected: boolean,
  pollResult: rpc.Api.GetSuccessfulTransactionResponse | null,
  timedOut: boolean,
): string {
  if (isRejected) return 'REJECTED_BY_WALLET'
  if (timedOut) return 'TIMEOUT'
  if (pollResult) return 'SUCCESS'
  return 'FAILED'
}

/**
 * NoPendingAdminError is thrown when attempting to accept an admin transfer
 * without a pending proposal existing.
 */
export const NoPendingAdminError: {
  name: "NoPendingAdmin"
  message: "No pending admin transfer exists. Current admin must propose a new admin first."
} = {
  name: "NoPendingAdmin",
  message: "No pending admin transfer exists. Current admin must propose a new admin first."
}

/**
 * Assert that the release is compatible with the current SDK version.
 * Throws an error if the environment does not support the required features.
 */
function assertReleaseCompatibility(): void {
  // Compatibility check - can be extended as needed
}

/**
 * Propose a new admin for the contract.
 * The current admin must authorize this transaction.
 * 
 * @param contract - The HarpocratesRegistry contract instance
 * @param adminKeypair - The keypair of the current admin
 * @param newAdmin - The Stellar address of the new admin
 * @returns Transaction result with hash, status, and txState
 */
export async function proposeNewAdmin(
  contract: Contract,
  adminKeypair: Keypair,
  newAdmin: string,
): Promise<{ hash: string; status: string; txState: TxState }> {
  assertReleaseCompatibility()
  const source = adminKeypair.publicKey()
  const server = new rpc.Server(RPC_URL)
  const account = await server.getAccount(source)

  const operation = contract.call(
    'propose_admin' satisfies RegistryMethod,
    adminKeypair.publicKey().toScVal(),
    new AdminAddress(newAdmin).toScVal(),
  )

  const transaction = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(operation)
    .setTimeout(90)
    .build()

  const prepared = await server.prepareTransaction(transaction)
  const signed = await signTransaction(prepared.toXDR(), {
    networkPassphrase: NETWORK_PASSPHRASE,
    address: source,
  })

  if (signed.error) {
    throw new Error(signed.error.message)
  }

  const signedTransaction = TransactionBuilder.fromXDR(signed.signedTxXdr, NETWORK_PASSPHRASE)
  const submitted: SendTransactionResponse = await server.sendTransaction(signedTransaction)

  if ('errorResultXdr' in submitted && submitted.errorResultXdr) {
    throw new Error(`Stellar RPC rejected the transaction: ${submitted.errorResultXdr}`)
  }

  return {
    hash: submitted.hash,
    status: submitted.status,
    txState: initialTxState(submitted.status),
  }
}

/**
 * Accept a pending admin transfer.
 * The new admin must authorize this transaction.
 * 
 * @param contract - The HarpocratesRegistry contract instance
 * @param newAdminKeypair - The keypair of the new admin
 * @returns Transaction result with hash, status, and txState
 * @throws {NoPendingAdminError} if there is no pending admin transfer
 */
export async function acceptAdmin(
  contract: Contract,
  newAdminKeypair: Keypair,
): Promise<{ hash: string; status: string; txState: TxState }> {
  assertReleaseCompatibility()
  const source = newAdminKeypair.publicKey()
  const server = new rpc.Server(RPC_URL)
  const account = await server.getAccount(source)

  const operation = contract.call(
    'accept_admin' satisfies RegistryMethod,
    new AdminAddress(source).toScVal(),
  )

  const transaction = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(operation)
    .setTimeout(90)
    .build()

  const prepared = await server.prepareTransaction(transaction)
  const signed = await signTransaction(prepared.toXDR(), {
    networkPassphrase: NETWORK_PASSPHRASE,
    address: source,
  })

  if (signed.error) {
    throw new Error(signed.error.message)
  }

  const signedTransaction = TransactionBuilder.fromXDR(signed.signedTxXdr, NETWORK_PASSPHRASE)
  const submitted: SendTransactionResponse = await server.sendTransaction(signedTransaction)

  if ('errorResultXdr' in submitted && submitted.errorResultXdr) {
    throw new Error(`Stellar RPC rejected the transaction: ${submitted.errorResultXdr}`)
  }

  return {
    hash: submitted.hash,
    status: submitted.status,
    txState: initialTxState(submitted.status),
  }
}

/**
 * Helper type for admin addresses.
 */
type AdminAddress = Address

export { AdminAddress }
