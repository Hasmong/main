import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('hashWorker', () => {
  beforeEach(() => {
    ;(self as any).postMessage = vi.fn()
    ;(self as any).onmessage = vi.fn()
  })

  it('computes SHA-256 hash of an ArrayBuffer', async () => {
    const worker = new Worker(
      new URL('./hashWorker.ts', import.meta.url),
      { type: 'module' }
    )

    const testData = new TextEncoder().encode('hello world').buffer
    const promise = new Promise<void>((resolve, reject) => {
      ;(worker as any).onmessage = (e: MessageEvent) => {
        const msg = e.data
        if (msg.type === 'RESULT' && msg.requestId === 'test-1') {
          expect(msg.hash).toHaveLength(64)
          expect(/^[0-9a-f]{64}$/.test(msg.hash)).toBe(true)
          resolve()
        }
      }
      ;(worker as any).onerror = (e: MessageEvent) => {
        reject(e)
      }
    })

    ;(worker as any).postMessage({
      type: 'HASH',
      requestId: 'test-1',
      input: { data: testData },
    })

    await promise
    worker.terminate()
  })

  it('computes SHA-256 hash of a string', async () => {
    const worker = new Worker(
      new URL('./hashWorker.ts', import.meta.url),
      { type: 'module' }
    )

    const promise = new Promise<void>((resolve, reject) => {
      ;(worker as any).onmessage = (e: MessageEvent) => {
        const msg = e.data
        if (msg.type === 'RESULT' && msg.requestId === 'test-2') {
          expect(msg.hash).toHaveLength(64)
          expect(/^[0-9a-f]{64}$/.test(msg.hash)).toBe(true)
          resolve()
        }
      }
      ;(worker as any).onerror = (e: MessageEvent) => {
        reject(e)
      }
    })

    ;(worker as any).postMessage({
      type: 'HASH',
      requestId: 'test-2',
      input: { data: 'hello world' },
    })

    await promise
    worker.terminate()
  })
})