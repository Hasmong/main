import type {
  WorkerRequest,
  WorkerResponse,
  WorkerHashInput,
  WorkerHashResult,
} from './hashWorker.types'

const DEFAULT_CHUNK_SIZE = 4 * 1024 * 1024 // 4MB memory cap per chunk
const HASH_TIMEOUT_MS = 30_000

export type HashStatus =
  | 'idle'
  | 'hashing'
  | 'completed'
  | 'cancelled'
  | 'error'
  | 'oversized'

export type HashResult = {
  hash: string
  status: HashStatus
  message?: string
}

export type HashProgress = {
  stage: string
}

export class HashWorkerError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

type PendingJob = {
  resolve: (hash: string) => void
  reject: (err: HashWorkerError) => void
  onProgress?: (stage: string) => void
}

export class HashWorkerClient {
  private worker: Worker
  private pending: Map<string, PendingJob> = new Map()

  constructor() {
    this.worker = this.spawn()
  }

  private spawn(): Worker {
    const worker = new Worker(new URL('./hashWorker.ts', import.meta.url), {
      type: 'module',
    })
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => this.handleMessage(event.data)
    worker.onerror = () => this.handleCrash()
    worker.onmessageerror = () => this.handleCrash()
    return worker
  }

  private handleMessage(msg: WorkerResponse) {
    if (msg.type === 'READY') return
    const requestId = msg.requestId
    const job = this.pending.get(requestId)
    if (!job) return

    if (msg.type === 'PROGRESS') {
      job.onProgress?.(msg.stage)
    } else if (msg.type === 'RESULT') {
      this.pending.delete(requestId)
      job.resolve(msg.hash)
    } else if (msg.type === 'ERROR') {
      this.pending.delete(requestId)
      job.reject(new HashWorkerError(msg.code, msg.message))
    }
  }

  private handleCrash() {
    for (const [, job] of this.pending) {
      job.reject(new HashWorkerError('CRASHED', 'The hash worker crashed unexpectedly.'))
    }
    this.pending.clear()
    this.worker.terminate()
    this.worker = this.spawn()
  }

  private timeoutJob(requestId: string) {
    const job = this.pending.get(requestId)
    if (!job) return
    this.pending.delete(requestId)
    job.reject(new HashWorkerError('TIMEOUT', 'Hash computation timed out.'))
    this.worker.terminate()
    this.worker = this.spawn()
  }

  private async arrayBufferFromInput(input: ArrayBuffer | string): Promise<ArrayBuffer> {
    if (typeof input === 'string') {
      return new TextEncoder().encode(input).buffer
    }
    return input
  }

  hash(
    input: ArrayBuffer | string,
    signal?: AbortSignal,
    onProgress?: (stage: string) => void,
  ): { requestId: string; result: Promise<string> } {
    if (signal?.aborted) {
      return {
        requestId: '',
        result: Promise.reject(new HashWorkerError('CANCELLED', 'Hash operation cancelled before starting.')),
      }
    }

    const requestId = crypto.randomUUID()
    const result = new Promise<string>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.timeoutJob(requestId)
      }, HASH_TIMEOUT_MS)

      this.pending.set(requestId, {
        resolve: (hash) => {
          clearTimeout(timeoutId)
          resolve(hash)
        },
        reject: (err) => {
          clearTimeout(timeoutId)
          reject(err)
        },
        onProgress,
      })

      const msg: WorkerRequest = {
        type: 'HASH',
        requestId,
        input: { data: input, signal },
      }
      this.worker.postMessage(msg, [input])
    })

    return { requestId, result }
  }

  cancel(requestId: string) {
    const job = this.pending.get(requestId)
    if (!job) return
    this.pending.delete(requestId)
    job.reject(new HashWorkerError('CANCELLED', 'Hash computation was cancelled.'))
    this.worker.terminate()
    this.worker = this.spawn()
  }

  destroy() {
    this.worker.terminate()
  }
}