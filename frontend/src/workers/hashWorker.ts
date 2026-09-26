/// <reference lib="webworker" />
import type { WorkerRequest, WorkerResponse } from './hashWorker.types'

let activeRequestId: string | null = null

function post(msg: WorkerResponse) {
  ;(self as unknown as Worker).postMessage(msg)
}

function bufToStr(buf: ArrayBuffer): string {
  return new TextDecoder().decode(buf)
}

function zero(buf: ArrayBuffer) {
  new Uint8Array(buf).fill(0)
}

const MAX_HASH_CHUNK_BYTES = 4 * 1024 * 1024 // 4MB per chunk for memory cap

async function ensureArrayBuffer(data: ArrayBuffer | string): Promise<ArrayBuffer> {
  if (typeof data === 'string') {
    return new TextEncoder().encode(data).buffer
  }
  return data
}

async function hashData(data: ArrayBuffer | string, signal?: AbortSignal): Promise<string> {
  const buf = await ensureArrayBuffer(data)
  if (signal?.aborted) {
    throw new Error('Operation cancelled.')
  }
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return new TextDecoder().decode(digest)
}

async function handleGenerate(requestId: string, input: WorkerRequest['hash']) {
  if (activeRequestId !== null) {
    post({ type: 'ERROR', requestId, code: 'BUSY', message: 'A hash is already being computed.' })
    return
  }
  activeRequestId = requestId
  try {
    post({ type: 'PROGRESS', requestId, stage: 'computing' })
    const hash = await hashData(input.data, input.signal)
    post({ type: 'RESULT', requestId, hash })
  } catch (err) {
    post({
      type: 'ERROR',
      requestId,
      code: err instanceof Error ? err.code : 'HASH_FAILED',
      message: err instanceof Error ? err.message : 'Unknown error during hashing.',
    })
  } finally {
    activeRequestId = null
  }
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data
  if (msg.type === 'HASH') {
    void handleGenerate(msg.requestId, msg.input)
  }
}

post({ type: 'READY' })