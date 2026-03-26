// infrastructure/audio/watchdogDecode.ts
//
// Декодирование аудио в Web Worker с hard-kill таймаутом.
//
// При таймауте worker.terminate() мгновенно уничтожает поток
// вместе со ВСЕЙ памятью нативного декодера.
// Если Web Workers недоступны — fallback на main-thread decode + ctx.close().
//
// ИСПРАВЛЕНИЕ (detached ArrayBuffer):
// decodeInWorker() передаёт ArrayBuffer воркеру через transfer list,
// что ОТСОЕДИНЯЕТ (detach) оригинальный буфер. Если воркер падает
// и нужен fallback на main-thread decode, буфер уже недоступен.
// Решение: копируем ArrayBuffer ДО передачи в воркер, чтобы fallback
// мог использовать оригинал.

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
  // Копируем буфер ПЕРЕД передачей в воркер.
  // decodeInWorker() использует transfer list, что отсоединяет (detach) переданный
  // ArrayBuffer. Если воркер упадёт и нужен fallback на main-thread,
  // оригинальный arrayBuffer останется доступным.
  const bufferCopy = arrayBuffer.slice(0)

  try {
    const result: WorkerDecodeResult = await decodeInWorker(
      bufferCopy,
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
      // Используем оригинальный arrayBuffer — он НЕ был отсоединён,
      // т.к. в воркер передали копию.
      return mainThreadDecodeFallback(ctx, arrayBuffer, timeoutMs, chunkInfo)
    }

    // Для любых других ошибок воркера — тоже пробуем fallback на main thread.
    // Это покрывает случаи когда AudioContext недоступен в воркере,
    // ошибки формата и прочие проблемы декодирования в воркере.
    console.warn("[watchdogDecode] Worker decode failed, falling back to main thread:", msg)
    return mainThreadDecodeFallback(ctx, arrayBuffer, timeoutMs, chunkInfo)
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
 * Rejects with DecodeTimeoutError if the promise doesn't resolve within timeoutMs.
 */
export async function watchdogRace<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label?: string,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new DecodeTimeoutError(label))
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