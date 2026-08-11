// infrastructure/audio/watchdogDecode.ts
//
// Декодирование аудио на main thread с watchdog-таймаутом (Promise.race).
//
// ИСТОРИЯ / ПОЧЕМУ БЕЗ WORKER'А:
// Раньше decode пытался выполняться в Web Worker, чтобы worker.terminate()
// мог hard-kill'нуть нативный декодер при таймауте. Но Web Audio API
// (AudioContext / OfflineAudioContext) доступен ТОЛЬКО в Window — в обычном
// Worker'е его нет ни в одном браузере. Поэтому worker всегда отвечал
// "not supported", а реальный decode всё равно шёл на main thread.
//
// Хуже того: чтобы передать буфер в worker (transfer его detach'ит),
// watchdogDecode копировал ВЕСЬ ArrayBuffer через arrayBuffer.slice(0).
// Для крупного несжатого WAV эта лишняя копия (сотни МБ) сама по себе
// могла исчерпать память вкладки — slice() бросал RangeError или последующий
// decode падал в OOM, и пользователь видел "Audio decoding failed".
//
// Теперь decode идёт напрямую на main thread: без worker'а и без копии буфера.

/** Default watchdog timeout in ms */
const DEFAULT_WATCHDOG_MS = 5_000

/**
 * A timeout only makes sense when it is a finite, positive number of ms.
 * `Infinity` / `0` / `NaN` mean "no watchdog — wait as long as it takes".
 */
function isWatchdogEnabled(timeoutMs: number): boolean {
  return Number.isFinite(timeoutMs) && timeoutMs > 0
}

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
 * Decode audio data on the main thread with a watchdog timeout.
 *
 * `decodeAudioData()` resamples to `ctx.sampleRate`, so a reduced-rate
 * AudioContext (see makeDecodeContext in chunkedDecode.ts) already pins the
 * output rate — no separate sampleRate argument is needed here.
 *
 * NOTE: the watchdog rejects the JS promise on timeout but cannot abort the
 * browser's native decoder. It exists to surface a clear error instead of
 * hanging indefinitely; callers treat a timeout as "file too large for this
 * device". The caller owns `ctx` and is responsible for closing it.
 *
 * Pass `Infinity` (or 0) as `timeoutMs` to disable the watchdog entirely —
 * used on desktop, where a slow decode means "big file", not "dying tab".
 *
 * @param ctx          AudioContext to decode with (caller closes it)
 * @param arrayBuffer  compressed/encoded audio bytes (detached by decodeAudioData)
 * @param timeoutMs    max time before the decode promise is rejected
 * @param chunkInfo    optional label for error messages
 */
export async function watchdogDecode(
  ctx: AudioContext,
  arrayBuffer: ArrayBuffer,
  timeoutMs: number = DEFAULT_WATCHDOG_MS,
  chunkInfo?: string,
): Promise<AudioBuffer> {
  if (!isWatchdogEnabled(timeoutMs)) {
    return await ctx.decodeAudioData(arrayBuffer)
  }

  let timeoutId: ReturnType<typeof setTimeout> | null = null

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new DecodeTimeoutError(chunkInfo))
    }, timeoutMs)
  })

  try {
    return await Promise.race([
      ctx.decodeAudioData(arrayBuffer),
      timeoutPromise,
    ])
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId)
    }
  }
}

/**
 * Generic watchdog race for any async operation.
 * Rejects with DecodeTimeoutError if the promise doesn't resolve within timeoutMs.
 *
 * A non-finite or non-positive `timeoutMs` disables the watchdog — the promise
 * is simply awaited.
 */
export async function watchdogRace<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label?: string,
): Promise<T> {
  if (!isWatchdogEnabled(timeoutMs)) {
    return await promise
  }

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
