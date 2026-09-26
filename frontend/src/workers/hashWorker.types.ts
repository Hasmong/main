export type WorkerRequest = {
  type: 'HASH'
  requestId: string
  input: WorkerHashInput
}

export type WorkerHashInput = {
  data: ArrayBuffer
  signal?: AbortSignal
}

export type WorkerResponse =
  | { type: 'RESULT'; requestId: string; hash: string }
  | { type: 'PROGRESS'; requestId: string; stage: string }
  | { type: 'ERROR'; requestId: string; code: string; message: string }
  | { type: 'READY' }