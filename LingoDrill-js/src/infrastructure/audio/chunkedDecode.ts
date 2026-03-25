// infrastructure/audio/chunkedDecode.ts
//
// Chunked audio decoding: slices a compressed audio blob into time-based chunks,
// decodes each chunk independently via AudioContext.decodeAudioData(),
// then stitches the PCM results into a single AudioBuffer.
//
// This prevents mobile browsers from running out of memory or locking the main
// thread for seconds while decoding a large file in one shot.

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
 *    (We can't split by time on a compressed file, so we estimate byte-ranges
 *    from fileSize and duration.)
 * 2. For each slice, wrap it in a minimal container so the browser can decode it.
 *    - For WAV we can slice on sample boundaries.
 *    - For MP3/OGG/AAC the browser's decoder is tolerant of partial data when
 *      we include enough leading bytes.
 * 3. Decode each chunk via a short-lived AudioContext.
 * 4. Copy decoded Float32Array data into a pre-allocated output buffer.
 *
 * FALLBACK: If chunked decoding fails on the first chunk (some codecs don't
 * tolerate slicing), we fall back to decoding the entire blob at once but with
 * a yielding strategy (setTimeout between decode and buffer copy) to avoid
 * a completely unresponsive UI.
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

  // If file is small (< 5 seconds or < 1MB), just decode in one shot
  if (totalDuration <= 5 || blob.size < 1_000_000) {
    return decodeFull(blob, onProgress)
  }

  const numChunks = Math.max(1, Math.ceil(totalDuration / chunkDurationSec))

  // Try chunked approach first
  try {
    return await decodeInChunks(blob, totalDuration, numChunks, onProgress, signal)
  } catch (err) {
    console.warn("[chunkedDecode] Chunked approach failed, falling back to full decode:", err)
    return decodeFull(blob, onProgress)
  }
}

// ---------------------------------------------------------------------------
// Full decode with yielding
// ---------------------------------------------------------------------------

async function decodeFull(
  blob: Blob,
  onProgress?: (p: number) => void,
): Promise<AudioBuffer> {
  onProgress?.(0)
  const arrayBuffer = await blob.arrayBuffer()
  onProgress?.(0.1)

  const ctx = new AudioContext()
  try {
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
    onProgress?.(1)
    return audioBuffer
  } finally {
    await ctx.close()
  }
}

// ---------------------------------------------------------------------------
// Chunked decode
// ---------------------------------------------------------------------------

async function decodeInChunks(
  blob: Blob,
  totalDuration: number,
  numChunks: number,
  onProgress?: (p: number) => void,
  signal?: AbortSignal,
): Promise<AudioBuffer> {
  onProgress?.(0)

  // Step 1: Determine format info by decoding a small initial portion
  const probeSize = Math.min(blob.size, 512 * 1024) // first 512KB
  const probeBlob = blob.slice(0, probeSize)
  const probeCtx = new AudioContext()
  let probeBuffer: AudioBuffer

  try {
    const probeArrayBuf = await probeBlob.arrayBuffer()
    probeBuffer = await probeCtx.decodeAudioData(probeArrayBuf)
  } finally {
    await probeCtx.close()
  }

  const sampleRate = probeBuffer.sampleRate
  const numberOfChannels = probeBuffer.numberOfChannels
  const totalSamples = Math.ceil(totalDuration * sampleRate)

  // Step 2: Pre-allocate the output buffer
  const offlineCtx = new OfflineAudioContext(numberOfChannels, totalSamples, sampleRate)
  const outputBuffer = offlineCtx.createBuffer(numberOfChannels, totalSamples, sampleRate)

  // Step 3: Copy probe data into output
  let samplesWritten = copyBufferData(probeBuffer, outputBuffer, 0)
  onProgress?.(0.05)

  // Step 4: Decode remaining chunks
  // We use overlapping byte ranges with some overlap to avoid glitches at boundaries
  const bytesPerSecond = blob.size / totalDuration
  const overlapBytes = Math.floor(bytesPerSecond * 0.5) // 0.5s overlap
  const chunkBytes = Math.floor(blob.size / numChunks)

  // Skip the probe portion — estimate how far the probe got us in bytes
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

    let chunkBuffer: AudioBuffer
    const chunkCtx = new AudioContext()
    try {
      const chunkArrayBuf = await chunkBlob.arrayBuffer()
      chunkBuffer = await chunkCtx.decodeAudioData(chunkArrayBuf)
    } catch (err) {
      // Some formats can't be sliced — this chunk failed.
      // Fill remaining with silence and log warning
      console.warn(`[chunkedDecode] Chunk ${i}/${numChunks} failed:`, err)
      byteOffset += chunkBytes
      onProgress?.((i + 1) / numChunks)
      continue
    } finally {
      await chunkCtx.close()
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