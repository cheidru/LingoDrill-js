// infrastructure/audio/watchdogDecode.ts
//
// Декодирование аудио в Web Worker с hard-kill таймаутом.
//
// При таймауте worker.terminate() мгновенно уничтожает поток
// вместе со ВСЕЙ памятью нативного декодера.
// Если Web Workers недоступны — fallback на main-thread decode + ctx.close().

import { decodeInWorker, resultToAudioBuffer, type WorkerDecodeResult } from "./decodeWorker"

/** Default watchdog timeout in ms */
const DEFAULT_WATCHDOG_MS = 5_000

export class DecodeTimeoutError extends Error {
  constructor(chunkInfo?: string) {
    const detail = chunkInfo ? ` (${chunkInfo})` : ""
    super(
      `Audio decoding timed out${detail}. ` +
      `The file is too large for this device. ` +
      `Please use a desktop browser or split the audio file.`
    )
    this.name = "DecodeTimeoutError"
  }
}

/**
 * Decode audio in a Web Worker with a hard-kill timeout.
 *
 * When the timeout fires, worker.terminate() instantly destroys
 * the worker thread AND the native decoder's memory allocation.
 */
export async function watchdogDecode(
  ctx: AudioContext,
  arrayBuffer: ArrayBuffer,
  timeoutMs: number = DEFAULT_WATCHDOG_MS,
  chunkInfo?: string,
): Promise<AudioBuffer> {
  try {
    const result: WorkerDecodeResult = await decodeInWorker(
      arrayBuffer,
      timeoutMs,
      chunkInfo ?? "",
    )

    const audioBuffer = resultToAudioBuffer(result)
    return audioBuffer
  } catch (workerErr) {
    const msg = workerErr instanceof Error ? workerErr.message : String(workerErr)

    if (msg.includes("timed out")) {
      ctx.close().catch(() => {})
      throw new DecodeTimeoutError(chunkInfo)
    }

    if (msg.includes("not supported")) {
      console.warn("[watchdogDecode] Workers unavailable, falling back to main thread")
      return mainThreadDecodeFallback(ctx, arrayBuffer, timeoutMs, chunkInfo)
    }

    throw workerErr
  }
}

/**
 * Fallback: main-thread decode with setTimeout race.
 */
async function mainThreadDecodeFallback(
  ctx: AudioContext,
  arrayBuffer: ArrayBuffer,
  timeoutMs: number,
  chunkInfo?: string,
): Promise<AudioBuffer> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      ctx.close().catch(() => {})
      reject(new DecodeTimeoutError(chunkInfo))
    }, timeoutMs)
  })

  try {
    const audioBuffer = await Promise.race([
      ctx.decodeAudioData(arrayBuffer),
      timeoutPromise,
    ])
    return audioBuffer
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId)
    }
  }
}

/**
 * Generic watchdog race for any async operation.
 */
export async function watchdogRace<T>(
  promise: Promise<T>,
  timeoutMs: number = DEFAULT_WATCHDOG_MS,
  operationName = "Operation",
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(
        `${operationName} timed out after ${(timeoutMs / 1000).toFixed(1)}s. ` +
        `The file may be too large for this device.`
      ))
    }, timeoutMs)
  })

  try {
    return await Promise.race([promise, timeoutPromise])
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId)
    }
  }
}