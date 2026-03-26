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
// 6. Все вызовы decodeAudioData обёрнуты в watchdogDecode с таймаутом.
// 7. decodeFull() теперь тоже использует watchdogDecode.
// 8. ИСПРАВЛЕНИЕ: таймауты адаптивные — на десктопе щедрые (60-120с),
//    на мобильных короткие (5-8с) чтобы не ждать OOM-kill браузера.

import { watchdogDecode, watchdogRace, DecodeTimeoutError } from "./watchdogDecode"

export { DecodeTimeoutError }

// ---------------------------------------------------------------------------
// Adaptive timeouts: mobile vs desktop
// ---------------------------------------------------------------------------

/**
 * Detect if we're running on a mobile device.
 * Uses the same heuristic as main.tsx (screen dimension check).
 */
function isMobile(): boolean {
  if (typeof document !== "undefined") {
    return document.documentElement.classList.contains("mobile")
  }
  if (typeof screen !== "undefined") {
    return Math.min(screen.width, screen.height) < 500
  }
  return false
}

/** Timeout for reading blob into ArrayBuffer */
function getReadTimeoutMs(blobSize: number): number {
  if (isMobile()) return 8_000
  // Desktop: 10s base + 5s per 100MB
  return 10_000 + Math.ceil(blobSize / (100 * 1e6)) * 5_000
}

/** Timeout for decoding a single chunk */
function getChunkTimeoutMs(chunkSizeBytes: number): number {
  if (isMobile()) return 5_000
  // Desktop: 15s base + 10s per 10MB of compressed data
  return 15_000 + Math.ceil(chunkSizeBytes / (10 * 1e6)) * 10_000
}

/** Timeout for full-file decode */
function getFullDecodeTimeoutMs(blobSize: number): number {
  if (isMobile()) return 8_000
  // Desktop: 30s base + 15s per 10MB
  return 30_000 + Math.ceil(blobSize / (10 * 1e6)) * 15_000
}

/** Timeout for probe decode (always small) */
function getProbeTimeoutMs(): number {
  return isMobile() ? 3_000 : 10_000
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

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

  console.log(`[chunkedDecode] start: ${(blob.size / 1e6).toFixed(1)}MB, ${totalDuration.toFixed(1)}s, chunkSec=${chunkDurationSec}, mobile=${isMobile()}`)

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

  const readTimeout = getReadTimeoutMs(blob.size)
  console.log(`[decodeFull] calling blob.arrayBuffer()... (timeout ${readTimeout}ms)`)
  const arrayBuffer = await watchdogRace(
    blob.arrayBuffer(),
    readTimeout,
    "Reading audio file into memory",
  )
  console.log(`[decodeFull] arrayBuffer ready, ${(arrayBuffer.byteLength / 1e6).toFixed(1)}MB`)

  onProgress?.(0.1)

  if (signal?.aborted) {
    throw new DOMException("Decode aborted", "AbortError")
  }

  const decodeTimeout = getFullDecodeTimeoutMs(blob.size)
  console.log(`[decodeFull] calling watchdogDecode (${decodeTimeout}ms timeout)...`)
  const ctx = new AudioContext()
  try {
    const audioBuffer = await watchdogDecode(ctx, arrayBuffer, decodeTimeout, "full file decode")
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
    const chunkSizeBytes = end - start
    console.log(`[decodeInChunks] chunk ${i}/${numChunks}: ${(chunkSizeBytes / 1024).toFixed(0)}KB`)

    let chunkBuffer: AudioBuffer | null = null
    const chunkCtx = new AudioContext()
    try {
      const chunkArrayBuf = await chunkBlob.arrayBuffer()

      if (signal?.aborted) {
        throw new DOMException("Decode aborted", "AbortError")
      }

      const chunkTimeout = getChunkTimeoutMs(chunkSizeBytes)
      chunkBuffer = await watchdogDecode(
        chunkCtx,
        chunkArrayBuf,
        chunkTimeout,
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

  const probeTimeout = getProbeTimeoutMs()

  for (const probeSize of probeSizes) {
    if (signal?.aborted) {
      throw new DOMException("Decode aborted", "AbortError")
    }

    const probeBlob = blob.slice(0, probeSize)
    const probeCtx = new AudioContext()
    try {
      const probeArrayBuf = await probeBlob.arrayBuffer()
      const probeBuffer = await watchdogDecode(probeCtx, probeArrayBuf, probeTimeout, "probe decode")
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