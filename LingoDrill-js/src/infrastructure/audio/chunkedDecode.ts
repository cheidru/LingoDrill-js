// infrastructure/audio/chunkedDecode.ts
//
// Chunked audio decoding: slices a compressed audio blob into time-based chunks,
// decodes each chunk independently via AudioContext.decodeAudioData(),
// then stitches the PCM results into a single AudioBuffer.
//
// This prevents mobile browsers from running out of memory or locking the main
// thread for seconds while decoding a large file in one shot.
//
// ИСПРАВЛЕНИЯ:
// 1. AudioContext утечка: в цикле чанков ctx.close() вызывался в finally,
//    но если decodeAudioData выбросила — close() мог промолчать, а контекст
//    оставался в памяти. Теперь используем explicit try/finally с гарантией.
// 2. OfflineAudioContext.createBuffer() — некоторые мобильные браузеры
//    (Safari iOS < 17, старые WebView) не поддерживают createBuffer на OfflineAudioContext.
//    Заменено на new AudioBuffer() конструктор с fallback на обычный AudioContext.
// 3. Pre-allocation guard: для длинных файлов (>60 мин, 48kHz стерео ≈ ~1.3 GB Float32)
//    создание выходного буфера само по себе вызывает OOM. Добавлена проверка.
// 4. Probe-чанк 512KB мог быть слишком большим для сжатых форматов на мобильных.
//    Уменьшен до 256KB с fallback на 128KB.
// 5. Добавлен signal?.aborted check перед каждой тяжёлой операцией.
// 6. НОВОЕ: все вызовы decodeAudioData обёрнуты в watchdogDecode с таймаутом 5с.
//    Если нативный вызов зависает дольше — бросается DecodeTimeoutError ДО того,
//    как браузер убьёт вкладку (~10-15с watchdog).
// 7. НОВОЕ: decodeFull() теперь тоже использует watchdogDecode (с увеличенным
//    таймаутом 8с, т.к. декодирует весь файл).

import { watchdogDecode, watchdogRace, DecodeTimeoutError } from "./watchdogDecode"

export { DecodeTimeoutError }

export interface ChunkedDecodeOptions {
  /** Approximate duration of each chunk in seconds (default: 30) */
  chunkDurationSec?: number
  /** Called after each chunk is decoded: progress 0..1 */
  onProgress?: (progress: number) => void
  /** AbortSignal — allows cancellation when the user navigates away */
  signal?: AbortSignal
}

/**
 * Decode a compressed audio Blob in chunks, returning a complete AudioBuffer.
 *
 * Strategy:
 * 1. Split the raw Blob bytes into N equal-sized byte slices.
 * 2. Decode each chunk via a short-lived AudioContext.
 * 3. Copy decoded Float32Array data into a pre-allocated output buffer.
 *
 * FALLBACK: If chunked decoding fails on the first chunk, fall back to
 * decoding the entire blob at once with yielding between steps.
 */
export async function decodeAudioChunked(
  blob: Blob,
  totalDuration: number,
  options: ChunkedDecodeOptions = {},
): Promise<AudioBuffer> {
  const {
    chunkDurationSec = 30,
    onProgress,
    signal,
  } = options

  console.log(`[chunkedDecode] start: ${(blob.size / 1e6).toFixed(1)}MB, ${totalDuration.toFixed(1)}s, chunkSec=${chunkDurationSec}`)

  if (signal?.aborted) {
    throw new DOMException("Decode aborted", "AbortError")
  }

  // If file is small (< 5 seconds or < 1MB), just decode in one shot
  if (totalDuration <= 5 || blob.size < 1_000_000) {
    console.log("[chunkedDecode] small file → decodeFull")
    return decodeFull(blob, onProgress, signal)
  }

  const numChunks = Math.max(1, Math.ceil(totalDuration / chunkDurationSec))
  console.log(`[chunkedDecode] ${numChunks} chunks`)

  // Try chunked approach first
  try {
    return await decodeInChunks(blob, totalDuration, numChunks, onProgress, signal)
  } catch (err) {
    // If abort — don't fallback, just rethrow
    if (err instanceof DOMException && err.name === "AbortError") {
      throw err
    }
    // If timeout — don't retry with full decode (it will be even worse)
    if (err instanceof DecodeTimeoutError) {
      throw err
    }
    console.warn("[chunkedDecode] Chunked approach failed, falling back to full decode:", err)
    return decodeFull(blob, onProgress, signal)
  }
}

// ---------------------------------------------------------------------------
// Full decode with watchdog
// ---------------------------------------------------------------------------

async function decodeFull(
  blob: Blob,
  onProgress?: (p: number) => void,
  signal?: AbortSignal,
): Promise<AudioBuffer> {
  console.log(`[decodeFull] start, blob=${(blob.size / 1e6).toFixed(1)}MB`)

  if (signal?.aborted) {
    throw new DOMException("Decode aborted", "AbortError")
  }

  onProgress?.(0)

  console.log("[decodeFull] calling blob.arrayBuffer()...")
  // blob.arrayBuffer() can also hang on very large files on mobile
  const arrayBuffer = await watchdogRace(
    blob.arrayBuffer(),
    8_000,
    "Reading audio file into memory",
  )
  console.log(`[decodeFull] arrayBuffer ready, ${(arrayBuffer.byteLength / 1e6).toFixed(1)}MB`)

  onProgress?.(0.1)

  if (signal?.aborted) {
    throw new DOMException("Decode aborted", "AbortError")
  }

  console.log("[decodeFull] calling watchdogDecode (8s timeout)...")
  const ctx = new AudioContext()
  try {
    // Full file decode gets a longer timeout (8s) but still under browser kill threshold
    const audioBuffer = await watchdogDecode(ctx, arrayBuffer, 8_000, "full file decode")
    console.log(`[decodeFull] success! ${audioBuffer.duration.toFixed(1)}s, ${audioBuffer.sampleRate}Hz`)
    onProgress?.(1)
    return audioBuffer
  } finally {
    try {
      await ctx.close()
    } catch {
      // close() может бросить если контекст уже закрыт — игнорируем
    }
  }
}

// ---------------------------------------------------------------------------
// Chunked decode
// ---------------------------------------------------------------------------

/**
 * Максимальный размер выходного буфера в сэмплах (на один канал).
 * ~60 мин @ 48kHz = ~172M сэмплов × 4 bytes × 2 ch ≈ 1.3GB.
 * Для мобильных ограничиваем ~45 мин @ 48kHz стерео ≈ ~1GB.
 */
const MAX_OUTPUT_SAMPLES = 48_000 * 60 * 45 // ~129.6M samples

async function decodeInChunks(
  blob: Blob,
  totalDuration: number,
  numChunks: number,
  onProgress?: (p: number) => void,
  signal?: AbortSignal,
): Promise<AudioBuffer> {
  onProgress?.(0)

  if (signal?.aborted) {
    throw new DOMException("Decode aborted", "AbortError")
  }

  // Step 1: Determine format info by decoding a small initial portion.
  console.log("[decodeInChunks] probing format...")
  const probeResult = await decodeProbe(blob, signal)
  const { probeBuffer } = probeResult
  console.log(`[decodeInChunks] probe OK: ${probeBuffer.sampleRate}Hz, ${probeBuffer.numberOfChannels}ch`)

  const sampleRate = probeBuffer.sampleRate
  const numberOfChannels = probeBuffer.numberOfChannels
  const totalSamples = Math.ceil(totalDuration * sampleRate)

  // Guard против OOM при аллокации выходного буфера
  if (totalSamples > MAX_OUTPUT_SAMPLES) {
    const maxMinutes = Math.floor(MAX_OUTPUT_SAMPLES / sampleRate / 60)
    throw new Error(
      `Audio too long for in-browser decoding (~${Math.ceil(totalDuration / 60)} min). ` +
      `Maximum supported: ~${maxMinutes} min. ` +
      `Please split the file or use a desktop browser.`
    )
  }

  // Step 2: Pre-allocate the output buffer
  console.log(`[decodeInChunks] allocating output: ${totalSamples} samples (${(totalSamples * 4 / 1e6).toFixed(1)}MB per ch)`)
  const outputBuffer = createOutputBuffer(numberOfChannels, totalSamples, sampleRate)
  console.log("[decodeInChunks] allocation OK")

  // Step 3: Copy probe data into output
  let samplesWritten = copyBufferData(probeBuffer, outputBuffer, 0)
  onProgress?.(0.05)

  // Step 4: Decode remaining chunks
  const bytesPerSecond = blob.size / totalDuration
  const overlapBytes = Math.floor(bytesPerSecond * 0.5) // 0.5s overlap
  const chunkBytes = Math.floor(blob.size / numChunks)

  // Skip the probe portion
  const probeDuration = probeBuffer.duration
  let byteOffset = Math.floor(probeDuration * bytesPerSecond)

  for (let i = 1; i < numChunks; i++) {
    if (signal?.aborted) {
      throw new DOMException("Decode aborted", "AbortError")
    }

    // Yield to the event loop between chunks so UI stays responsive
    await yieldToMain()

    const start = Math.max(0, byteOffset - overlapBytes)
    const end = Math.min(blob.size, byteOffset + chunkBytes + overlapBytes)
    const chunkBlob = blob.slice(start, end)
    console.log(`[decodeInChunks] chunk ${i}/${numChunks}: ${((end - start) / 1024).toFixed(0)}KB`)

    let chunkBuffer: AudioBuffer | null = null
    const chunkCtx = new AudioContext()
    try {
      const chunkArrayBuf = await chunkBlob.arrayBuffer()

      if (signal?.aborted) {
        throw new DOMException("Decode aborted", "AbortError")
      }

      // WATCHDOG: 5s timeout per chunk — throws DecodeTimeoutError before browser kills tab
      chunkBuffer = await watchdogDecode(
        chunkCtx,
        chunkArrayBuf,
        5_000,
        `chunk ${i}/${numChunks}`,
      )
    } catch (err) {
      // Abort — rethrow immediately
      if (err instanceof DOMException && err.name === "AbortError") {
        throw err
      }
      // Timeout — rethrow (don't silently continue, the device can't handle this)
      if (err instanceof DecodeTimeoutError) {
        throw err
      }
      // Some formats can't be sliced — this chunk failed.
      // Fill remaining with silence and log warning
      console.warn(`[chunkedDecode] Chunk ${i}/${numChunks} failed:`, err)
      byteOffset += chunkBytes
      onProgress?.((i + 1) / numChunks)
      continue
    } finally {
      try {
        await chunkCtx.close()
      } catch {
        // ignore — context may already be closed (e.g. by watchdog)
      }
    }

    if (!chunkBuffer) {
      byteOffset += chunkBytes
      onProgress?.((i + 1) / numChunks)
      continue
    }

    // Calculate where this chunk's data starts in the timeline
    const chunkStartTime = (start / blob.size) * totalDuration
    const overlapDuration = (overlapBytes / blob.size) * totalDuration
    const trimStart = start === byteOffset - overlapBytes ? overlapDuration : 0

    const writeOffsetSamples = Math.floor((chunkStartTime + trimStart) * sampleRate)

    // Only write data that goes beyond what we've already written
    const actualWriteStart = Math.max(writeOffsetSamples, samplesWritten)
    const skipSamples = actualWriteStart - writeOffsetSamples

    if (skipSamples < chunkBuffer.length) {
      samplesWritten = copyBufferData(chunkBuffer, outputBuffer, actualWriteStart, skipSamples)
    }

    byteOffset += chunkBytes
    onProgress?.((i + 1) / numChunks)
  }

  return outputBuffer
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Decode a small probe from the beginning of the file to get format info.
 * Tries 256KB first, falls back to 128KB if that fails.
 */
async function decodeProbe(
  blob: Blob,
  signal?: AbortSignal,
): Promise<{ probeBuffer: AudioBuffer }> {
  const probeSizes = [
    Math.min(blob.size, 256 * 1024),
    Math.min(blob.size, 128 * 1024),
  ]

  for (const probeSize of probeSizes) {
    if (signal?.aborted) {
      throw new DOMException("Decode aborted", "AbortError")
    }

    const probeBlob = blob.slice(0, probeSize)
    const probeCtx = new AudioContext()
    try {
      const probeArrayBuf = await probeBlob.arrayBuffer()
      // Probe is tiny — 3s watchdog is plenty
      const probeBuffer = await watchdogDecode(probeCtx, probeArrayBuf, 3_000, "probe decode")
      return { probeBuffer }
    } catch (err) {
      console.warn(`[chunkedDecode] Probe at ${probeSize} bytes failed:`, err)
      // Try smaller probe
    } finally {
      try {
        await probeCtx.close()
      } catch {
        // ignore
      }
    }
  }

  // If both probes failed, try the full file (decodeFull will handle it)
  throw new Error("Probe decode failed — falling back to full decode")
}

/**
 * Create an AudioBuffer for output. Uses the AudioBuffer constructor (widely
 * supported since Chrome 55, Firefox 53, Safari 14.1). Falls back to
 * BaseAudioContext.createBuffer for older environments.
 */
function createOutputBuffer(
  numberOfChannels: number,
  length: number,
  sampleRate: number,
): AudioBuffer {
  // Preferred: AudioBuffer constructor (no context needed)
  try {
    return new AudioBuffer({ numberOfChannels, length, sampleRate })
  } catch {
    // Fallback: use a temporary AudioContext
    const tmpCtx = new AudioContext()
    try {
      return tmpCtx.createBuffer(numberOfChannels, length, sampleRate)
    } finally {
      tmpCtx.close().catch(() => {})
    }
  }
}

/**
 * Copy channel data from src into dst at the given sample offset.
 * Returns the new "end of written data" position in samples.
 */
function copyBufferData(
  src: AudioBuffer,
  dst: AudioBuffer,
  dstOffsetSamples: number,
  srcSkipSamples = 0,
): number {
  const samplesToWrite = Math.min(
    src.length - srcSkipSamples,
    dst.length - dstOffsetSamples,
  )
  if (samplesToWrite <= 0) return dstOffsetSamples

  for (let ch = 0; ch < Math.min(src.numberOfChannels, dst.numberOfChannels); ch++) {
    const srcData = src.getChannelData(ch)
    const dstData = dst.getChannelData(ch)
    // Use subarray + set for fast copy
    dstData.set(srcData.subarray(srcSkipSamples, srcSkipSamples + samplesToWrite), dstOffsetSamples)
  }

  return dstOffsetSamples + samplesToWrite
}

/**
 * Yield control back to the browser's event loop.
 * This prevents the "page unresponsive" dialog on mobile.
 */
function yieldToMain(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
}