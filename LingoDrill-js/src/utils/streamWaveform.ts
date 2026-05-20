// utils/streamWaveform.ts
//
// Build an RMS waveform from a compressed audio blob WITHOUT ever holding the
// whole decoded file in memory.
//
// For MP3 the file is decoded in frame-aligned ~30s chunks (see mp3Frames.ts):
// each chunk is decoded on its own, its RMS is folded into the output buckets,
// then the chunk's PCM is released. Memory stays constant regardless of file
// length, so multi-hour files work — the previous approach decoded the whole
// file into one AudioBuffer (~3 GB for a 145-minute file) and ran out of
// memory ("Audio decoding failed").
//
// The partially-filled waveform is emitted after every chunk so the caller can
// render it progressively, filling in left-to-right.
//
// Non-MP3 formats (WAV / m4a / ogg) fall back to a single full decode — fine
// for the short trimmed/normalized WAV files this app produces.

import { buildWaveform } from "./buildWaveform"
import { safeDecodeAudioBuffer } from "../infrastructure/audio/safeDecodeAudioBuffer"
import { looksLikeMp3, planMp3Chunks } from "./mp3Frames"

export interface StreamWaveformOptions {
  /** Called after each chunk with the waveform built so far (0..1, normalized). */
  onProgress?: (waveform: number[]) => void
  signal?: AbortSignal
}

/** Decode RMS for the waveform — quality is fine well below CD rate. */
const DECODE_SAMPLE_RATE = 16_000

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/**
 * Build a normalized RMS waveform (`outputSamples` points, values 0..1) from a
 * compressed audio blob.
 */
export async function streamWaveform(
  blob: Blob,
  outputSamples: number,
  opts: StreamWaveformOptions = {},
): Promise<number[]> {
  const { onProgress, signal } = opts
  if (outputSamples <= 0) throw new Error("outputSamples must be > 0")

  const bytes = new Uint8Array(await blob.arrayBuffer())
  if (signal?.aborted) throw new DOMException("Waveform build aborted", "AbortError")

  // Non-MP3 → single full decode (short files only).
  if (!looksLikeMp3(bytes)) {
    const buffer = await safeDecodeAudioBuffer(blob)
    return buildWaveform(buffer, outputSamples, signal)
  }

  let plan
  try {
    plan = planMp3Chunks(bytes, 30)
  } catch {
    // Frame parsing failed — fall back to a whole-file decode.
    const buffer = await safeDecodeAudioBuffer(blob)
    return buildWaveform(buffer, outputSamples, signal)
  }

  const { chunks, totalDuration } = plan
  if (chunks.length === 0 || totalDuration <= 0) {
    const buffer = await safeDecodeAudioBuffer(blob)
    return buildWaveform(buffer, outputSamples, signal)
  }

  const bucketDur = totalDuration / outputSamples
  // Sum of squares and sample counts per output bucket — accumulated across
  // chunks so buckets spanning a chunk boundary still get every sample.
  const sumSq = new Float64Array(outputSamples)
  const counts = new Float64Array(outputSamples)
  const waveform = new Array<number>(outputSamples).fill(0)

  const emit = () => {
    let max = 0
    for (let i = 0; i < outputSamples; i++) {
      const c = counts[i]
      const v = c > 0 ? Math.sqrt(sumSq[i] / c) : 0
      waveform[i] = v
      if (v > max) max = v
    }
    if (max > 0) {
      for (let i = 0; i < outputSamples; i++) waveform[i] = waveform[i] / max
    }
    onProgress?.(waveform.slice())
  }

  const ctx = new AudioContext({ sampleRate: DECODE_SAMPLE_RATE })
  let decodedTime = 0
  let decodedChunks = 0

  try {
    for (const chunk of chunks) {
      if (signal?.aborted) throw new DOMException("Waveform build aborted", "AbortError")

      // A fresh copy — decodeAudioData() detaches the ArrayBuffer it is given.
      const slice = bytes.slice(chunk.byteStart, chunk.byteEnd)
      let decoded: AudioBuffer | null = null
      try {
        decoded = await ctx.decodeAudioData(slice.buffer)
      } catch (err) {
        // Skip a chunk that won't decode; keep the timeline aligned with the
        // chunk's expected duration so later chunks land in the right place.
        console.warn("[streamWaveform] chunk decode failed, skipping:", err)
        decodedTime += chunk.durationSec
        continue
      }

      foldChunkRms(decoded, decodedTime, bucketDur, outputSamples, sumSq, counts)
      decodedTime += decoded.duration
      decodedChunks++
      emit()
      await yieldToMain()
    }
  } finally {
    ctx.close().catch(() => {})
  }

  if (decodedChunks === 0) {
    throw new Error("Could not decode any audio from this file")
  }

  emit()
  return waveform
}

/** Fold one decoded chunk's channel-0 RMS into the output buckets. */
function foldChunkRms(
  decoded: AudioBuffer,
  chunkStartT: number,
  bucketDur: number,
  outputSamples: number,
  sumSq: Float64Array,
  counts: Float64Array,
): void {
  const ch0 = decoded.getChannelData(0)
  const sr = decoded.sampleRate
  const n = ch0.length
  const chunkEndT = chunkStartT + n / sr

  let bStart = Math.floor(chunkStartT / bucketDur)
  let bEnd = Math.floor((chunkEndT - 1e-9) / bucketDur)
  if (bStart < 0) bStart = 0
  if (bEnd >= outputSamples) bEnd = outputSamples - 1

  for (let b = bStart; b <= bEnd; b++) {
    const t0 = b * bucketDur
    const t1 = t0 + bucketDur
    let s0 = Math.floor((t0 - chunkStartT) * sr)
    let s1 = Math.ceil((t1 - chunkStartT) * sr)
    if (s0 < 0) s0 = 0
    if (s1 > n) s1 = n
    if (s1 <= s0) continue
    let sum = 0
    for (let j = s0; j < s1; j++) {
      const s = ch0[j]
      sum += s * s
    }
    sumSq[b] += sum
    counts[b] += s1 - s0
  }
}
