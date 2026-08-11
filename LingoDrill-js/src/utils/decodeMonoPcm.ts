// utils/decodeMonoPcm.ts
//
// Decode a compressed audio blob into ONE mono PCM channel at a low sample
// rate, without ever holding the full-rate decoded file in memory.
//
// Silero VAD (auto-detect speech) only ever looks at 16 kHz mono. Decoding a
// 2.5-hour MP3 the naive way — a single decodeAudioData() at the platform rate
// — asks the browser for a stereo float32 AudioBuffer of ~3 GB. On desktop
// that decode simply fails, and the failure surfaced to the user as
// "Auto-detect speech failed" (it was never a timeout — the watchdogs are
// already disabled on desktop).
//
// MP3 is decoded in frame-aligned ~30 s chunks (see mp3Frames.ts) straight
// into a pre-allocated 16 kHz mono buffer, so peak memory is the output buffer
// (~64 KB per second of audio) plus one chunk. Same technique streamWaveform
// already uses for the waveform.
//
// Each chunk is written at the offset its own frame headers put it at, rather
// than appended after the previous one. MP3 decoders emit a little extra
// padding for every independently-decoded stream, so appending would let that
// padding accumulate into seconds of drift by the end of a long file, pushing
// every detected fragment off its real position.

import { looksLikeMp3, planMp3Chunks, type Mp3Plan } from "./mp3Frames"

/** Sample rate Silero VAD works at — feeding it 16 kHz avoids a resample. */
export const VAD_SAMPLE_RATE = 16_000

/** Audio duration per decoded chunk. */
const CHUNK_SEC = 30

export interface MonoPcm {
  /** Mono samples at `sampleRate`. */
  samples: Float32Array
  sampleRate: number
}

export interface DecodeMonoPcmOptions {
  /** Rate to decode at (default: `VAD_SAMPLE_RATE`). */
  targetRate?: number
  /** Called as chunks land: progress 0..1. */
  onProgress?: (progress: number) => void
  signal?: AbortSignal
}

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Decode aborted", "AbortError")
}

/**
 * Decode `blob` to mono PCM at `targetRate`.
 *
 * MP3 takes the chunked path; every other format falls back to a single decode
 * at the target rate (still far cheaper than a platform-rate decode, and the
 * other formats this app produces are short trimmed/normalized WAVs).
 */
export async function decodeMonoPcm(
  blob: Blob,
  opts: DecodeMonoPcmOptions = {},
): Promise<MonoPcm> {
  const { targetRate = VAD_SAMPLE_RATE, onProgress, signal } = opts

  const bytes = new Uint8Array(await blob.arrayBuffer())
  throwIfAborted(signal)

  const ctx = new AudioContext({ sampleRate: targetRate })
  try {
    let plan: Mp3Plan | null = null
    if (looksLikeMp3(bytes)) {
      try {
        plan = planMp3Chunks(bytes, CHUNK_SEC)
      } catch (err) {
        console.warn("[decodeMonoPcm] MP3 frame parsing failed, decoding whole file:", err)
      }
    }

    if (!plan || plan.chunks.length === 0 || plan.totalDuration <= 0) {
      const decoded = await ctx.decodeAudioData(await blob.arrayBuffer())
      onProgress?.(1)
      return { samples: mixToMono(decoded), sampleRate: decoded.sampleRate }
    }

    const { chunks, totalDuration } = plan
    // One extra second of headroom absorbs per-chunk rounding.
    const capacity = Math.ceil(totalDuration * targetRate) + targetRate
    console.log(
      `[decodeMonoPcm] ${chunks.length} chunks, ${totalDuration.toFixed(1)}s ` +
      `→ ${(capacity * 4 / 1e6).toFixed(0)}MB mono @${targetRate}Hz`,
    )
    const out = new Float32Array(capacity)

    let timelineSec = 0
    let decodedChunks = 0

    for (const chunk of chunks) {
      throwIfAborted(signal)

      const offset = Math.round(timelineSec * targetRate)
      const maxSamples = Math.round(chunk.durationSec * targetRate)

      // A fresh copy — decodeAudioData() detaches the ArrayBuffer it is given.
      const slice = bytes.slice(chunk.byteStart, chunk.byteEnd)
      try {
        const decoded = await ctx.decodeAudioData(slice.buffer)
        writeMono(decoded, out, offset, maxSamples)
        decodedChunks++
      } catch (err) {
        // A chunk we cannot decode stays silent; the timeline still advances by
        // its known duration so later chunks land in the right place.
        console.warn("[decodeMonoPcm] chunk decode failed, leaving silence:", err)
      }

      timelineSec += chunk.durationSec
      onProgress?.(Math.min(1, timelineSec / totalDuration))
      await yieldToMain()
    }

    if (decodedChunks === 0) {
      throw new Error("Could not decode any audio from this file")
    }

    const length = Math.min(capacity, Math.round(totalDuration * targetRate))
    return { samples: out.subarray(0, length), sampleRate: targetRate }
  } finally {
    ctx.close().catch(() => {})
  }
}

/** Downmix every channel of `src` into a new mono Float32Array. */
function mixToMono(src: AudioBuffer): Float32Array {
  if (src.numberOfChannels === 1) return src.getChannelData(0)
  const out = new Float32Array(src.length)
  writeMono(src, out, 0, src.length)
  return out
}

/**
 * Downmix `src` into `out` at `offset`, writing at most `maxSamples` samples
 * (and never past the end of `out`).
 */
function writeMono(
  src: AudioBuffer,
  out: Float32Array,
  offset: number,
  maxSamples: number,
): void {
  const n = Math.min(src.length, maxSamples, out.length - offset)
  if (n <= 0) return

  const channels = src.numberOfChannels
  out.set(src.getChannelData(0).subarray(0, n), offset)
  for (let ch = 1; ch < channels; ch++) {
    const data = src.getChannelData(ch)
    for (let i = 0; i < n; i++) out[offset + i] += data[i]
  }
  if (channels > 1) {
    for (let i = 0; i < n; i++) out[offset + i] /= channels
  }
}
