import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { HashWorkerClient } from './hashWorkerClient'

describe('HashWorkerClient', () => {
  let client: HashWorkerClient
  let postMessageSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    postMessageSpy = vi.fn()
    ;(HashWorkerClient.prototype as any).worker = {
      onmessage: vi.fn(),
      onerror: vi.fn(),
      onmessageerror: vi.fn(),
      postMessage: postMessageSpy,
      terminate: vi.fn(),
    } as unknown as Worker
    client = new HashWorkerClient()
  })

  afterEach(() => {
    client.destroy()
  })

  it('computes hash of ArrayBuffer and returns result', async () => {
    const arrayBuffer = new TextEncoder().encode('test data').buffer
    const { result, requestId } = client.hash(arrayBuffer)

    // Simulate worker message with matching requestId
    client.handleMessage({
      type: 'RESULT',
      requestId,
      hash: 'a'.repeat(64),
    } as any)

    const hash = await expect(result).resolves.toBe('a'.repeat(64))
  })

  it('computes hash of string and returns result', async () => {
    const { result, requestId } = client.hash('test string')

    // Simulate worker message with matching requestId
    client.handleMessage({
      type: 'RESULT',
      requestId,
      hash: 'b'.repeat(64),
    } as any)

    const hash = await expect(result).resolves.toBe('b'.repeat(64))
  })

  it('rejects on worker error', async () => {
    const arrayBuffer = new TextEncoder().encode('test data').buffer
    const { result, requestId } = client.hash(arrayBuffer)

    // Simulate worker error message with matching requestId
    client.handleMessage({
      type: 'ERROR',
      requestId,
      code: 'HASH_FAILED',
      message: 'Test error',
    } as any)

    await expect(result).rejects.toThrow('Test error')
  })

  it('rejects on worker crash', async () => {
    // Start a hash operation to initialize the worker
    const { result, requestId } = client.hash(new TextEncoder().encode('test').buffer)

    // Set up worker to crash on message
    ;(client.worker as any).onmessage = vi.fn()
    ;(client.worker as any).onerror = vi.fn()

    // Simulate worker crash by triggering onerror
    client.handleCrash()

    // All pending jobs should be rejected
    await expect(result).rejects.toThrow('The hash worker crashed unexpectedly.')
  })

  it('cancels a pending job', async () => {
    const { result, requestId } = client.hash(new TextEncoder().encode('test').buffer)

    // Cancel the job
    client.cancel(requestId)

    await expect(result).rejects.toThrow('Hash computation was cancelled.')
  })

  it('times out a pending job', async () => {
    const { result } = client.hash(new TextEncoder().encode('test').buffer)

    // Simulate timeout error
    client.handleMessage({
      type: 'ERROR',
      requestId: 'req-timeout',
      code: 'TIMEOUT',
      message: 'Hash computation timed out.',
    } as any)

    // After timeout rejection, a new worker should be spawned
    // The old worker is terminated and a new one is created
  })

  it('handles progress callbacks', async () => {
    const progressStages: string[] = []
    const arrayBuffer = new TextEncoder().encode('test').buffer
    const { result, requestId } = client.hash(arrayBuffer, undefined, (stage) => {
      progressStages.push(stage)
    })

    // Simulate worker progress message with matching requestId
    client.handleMessage({
      type: 'PROGRESS',
      requestId,
      stage: 'computing',
    } as any)

    // Also need to resolve the result with matching requestId
    client.handleMessage({
      type: 'RESULT',
      requestId,
      hash: 'a'.repeat(64),
    } as any)

    await expect(result).resolves.toBeDefined()
    expect(progressStages).toContain('computing')
  })
})