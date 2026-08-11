// utils/streamAudioChunks.ts
//
// Walk an audio blob as a sequence of short PCM chunks, without ever holding
// the whole decoded file in memory.
//
// WHY: Trim silence and Normalize volume used to call safeDecodeAudioBuffer()
// — one decodeAudioData() over the whole file at the platform rate. For a
// 2.5-hour MP3 that asks the browser for a stereo float32 AudioBuffer of ~3 GB,
// and then the operation allocates a second full copy for its output plus a
// WAV ArrayBuffer on top. On desktop that simply fails, and the failure reached
// the user as "Trim silence failed" / "Normalize volume failed". It was never a
// timeout — the decode watchdogs are already disabled on desktop.
//
// This is the same technique decodeMonoPcm/streamWaveform already use, lifted
// into one reader that both operations share:
//
//   MP3  — decoded in frame-aligned ~30 s chunks (see mp3Frames.ts). Every
//          chunk is positioned by its own frame headers rather than appended
//          after the previous one, so the per-stream padding MP3 decoders emit
//          cannot accumulate into seconds of drift over a long file. This is
//          the same timeline decodeMonoPcm produces, so fragment positions
//          found by auto-detect line up with what these chunks contain.
//   WAV  — read straight out of the RIFF data chunk with blob.slice(); no
//          decodeAudioData at all. Matters because Trim/Normalize write WAVs,
//          and a user may run a second operation on a big result.
//   else — (m4a/ogg/…) one whole-file decode, sliced up for the consumer.
//          Nothing about those containers allows byte-range splitting.
//
// Chunk lengths always sum to exactly `totalSamples`: a chunk the decoder
// returns short (or cannot decode at all) is padded with silence, and one it
// returns long is truncated. Consumers can therefore treat the chunks as one
// continuous, correctly-timed stream and simply append what they produce.

import { looksLikeMp3, planMp3Chunks, type Mp3Plan } from "./mp3Frames"
import {
  isWavSignature,
  parseWavHeader,
  readWavSamples,
} from "../infrastructure/audio/decodeWav"

/** Audio duration per emitted chunk. */
const CHUNK_SEC = 30

/** Bytes read up front to locate the RIFF fmt/data headers of a WAV. */
const WAV_HEADER_PROBE_BYTES = 256 * 1024

export interface AudioStreamInfo {
  sampleRate: number
  numChannels: number
  /** Total frames the stream will emit, summed over all chunks. */
  totalSamples: number
  duration: number
}

export interface AudioChunk {
  /**
   * One Float32Array per channel, each holding exactly `length` samples.
   * The handler owns these arrays and may mutate them in place.
   */
  channels: Float32Array[]
  length: number
  /** Frame index of this chunk's first sample on the source timeline. */
  startSample: number
}

export interface StreamAudioOptions {
  /**
   * Rate to decode compressed audio at. Omit for the platform default.
   * Ignored for WAV, which is always read at its own rate.
   */
  sampleRate?: number
  /** Called after each chunk: progress 0..1. */
  onProgress?: (progress: number) => void
  signal?: AbortSignal
}

export type AudioChunkHandler = (
  chunk: AudioChunk,
  info: AudioStreamInfo,
) => void | Promise<void>

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Audio streaming aborted", "AbortError")
}

/**
 * Stream `blob` to `onChunk` in ~30 s pieces.
 *
 * `onChunk` is awaited, so a handler that yields keeps the tab responsive.
 * Resolves with the stream's info once every chunk has been handled.
 */
export async function streamAudioChunks(
  blob: Blob,
  onChunk: AudioChunkHandler,
  opts: StreamAudioOptions = {},
): Promise<AudioStreamInfo> {
  const { signal } = opts

  const head = new Uint8Array(
    await blob.slice(0, Math.min(blob.size, WAV_HEADER_PROBE_BYTES)).arrayBuffer(),
  )
  throwIfAborted(signal)

  if (isWavSignature(head)) {
    try {
      return await streamWav(blob, head.buffer, onChunk, opts)
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err
      // Not a WAV we can parse (compressed ADPCM in a .wav, headers past the
      // probe window) — let the browser decoder have it.
      console.warn("[streamAudioChunks] WAV parsing failed, decoding instead:", err)
    }
  }

  const bytes = new Uint8Array(await blob.arrayBuffer())
  throwIfAborted(signal)

  if (looksLikeMp3(bytes)) {
    let plan: Mp3Plan | null = null
    try {
      plan = planMp3Chunks(bytes, CHUNK_SEC)
    } catch (err) {
      console.warn("[streamAudioChunks] MP3 frame parsing failed, decoding whole file:", err)
    }
    if (plan && plan.chunks.length > 0 && plan.totalDuration > 0) {
      return await streamMp3(bytes, plan, onChunk, opts)
    }
  }

  return await streamWhole(blob, onChunk, opts)
}

// ---------------------------------------------------------------------------
// WAV — read the data chunk directly, no decoder involved
// ---------------------------------------------------------------------------

async function streamWav(
  blob: Blob,
  headerBytes: ArrayBuffer,
  onChunk: AudioChunkHandler,
  opts: StreamAudioOptions,
): Promise<AudioStreamInfo> {
  const { onProgress, signal } = opts

  // The probe holds only the head of the file, so the real byte count has to be
  // passed in — otherwise the data chunk gets clamped to the probe window.
  const wav = parseWavHeader(headerBytes, blob.size)
  const bytesPerSample = wav.bitsPerSample >> 3
  const frameBytes = bytesPerSample * wav.numChannels

  const info: AudioStreamInfo = {
    sampleRate: wav.sampleRate,
    numChannels: wav.numChannels,
    totalSamples: wav.frameCount,
    duration: wav.frameCount / wav.sampleRate,
  }

  console.log(
    `[streamAudioChunks] WAV: ${wav.numChannels}ch ${wav.sampleRate}Hz ` +
    `${wav.bitsPerSample}-bit, ${info.duration.toFixed(1)}s`,
  )

  const framesPerChunk = Math.max(1, Math.round(CHUNK_SEC * wav.sampleRate))

  for (let frame = 0; frame < wav.frameCount; frame += framesPerChunk) {
    throwIfAborted(signal)

    const length = Math.min(framesPerChunk, wav.frameCount - frame)
    const byteStart = wav.dataOffset + frame * frameBytes
    const slice = await blob.slice(byteStart, byteStart + length * frameBytes).arrayBuffer()

    const channels: Float32Array[] = []
    for (let ch = 0; ch < wav.numChannels; ch++) {
      channels.push(new Float32Array(length))
    }
    readWavSamples(slice, { ...wav, dataOffset: 0, frameCount: length }, channels)

    await onChunk({ channels, length, startSample: frame }, info)
    onProgress?.((frame + length) / wav.frameCount)
    await yieldToMain()
  }

  return info
}

// ---------------------------------------------------------------------------
// MP3 — frame-aligned chunks
// ---------------------------------------------------------------------------

async function streamMp3(
  bytes: Uint8Array,
  plan: Mp3Plan,
  onChunk: AudioChunkHandler,
  opts: StreamAudioOptions,
): Promise<AudioStreamInfo> {
  const { sampleRate, onProgress, signal } = opts
  const { chunks, totalDuration } = plan

  const ctx = sampleRate ? new AudioContext({ sampleRate }) : new AudioContext()
  const rate = ctx.sampleRate
  const totalSamples = Math.round(totalDuration * rate)

  console.log(
    `[streamAudioChunks] MP3: ${chunks.length} chunks, ` +
    `${totalDuration.toFixed(1)}s @${rate}Hz`,
  )

  let info: AudioStreamInfo | null = null
  let written = 0
  /** Frames owed as silence because no chunk has decoded yet. */
  let pendingSilence = 0
  let decodedChunks = 0

  const maxSilenceRun = Math.max(1, Math.round(CHUNK_SEC * rate))

  const emit = async (channels: Float32Array[], length: number) => {
    if (length <= 0) return
    await onChunk({ channels, length, startSample: written }, info!)
    written += length
  }

  const flushSilence = async () => {
    while (pendingSilence > 0) {
      const length = Math.min(pendingSilence, maxSilenceRun)
      const channels: Float32Array[] = []
      for (let ch = 0; ch < info!.numChannels; ch++) {
        channels.push(new Float32Array(length))
      }
      pendingSilence -= length
      await emit(channels, length)
    }
  }

  try {
    let timelineSec = 0

    for (let i = 0; i < chunks.length; i++) {
      throwIfAborted(signal)

      const chunk = chunks[i]
      timelineSec += chunk.durationSec
      const nominalEnd =
        i === chunks.length - 1
          ? totalSamples
          : Math.min(totalSamples, Math.round(timelineSec * rate))
      const expected = Math.max(0, nominalEnd - written - pendingSilence)

      let decoded: AudioBuffer | null = null
      try {
        // A fresh copy — decodeAudioData() detaches the ArrayBuffer it is given.
        const slice = bytes.slice(chunk.byteStart, chunk.byteEnd)
        decoded = await ctx.decodeAudioData(slice.buffer)
      } catch (err) {
        console.warn("[streamAudioChunks] chunk decode failed, leaving silence:", err)
      }

      if (!decoded) {
        pendingSilence += expected
      } else {
        if (!info) {
          info = {
            sampleRate: rate,
            numChannels: decoded.numberOfChannels,
            totalSamples,
            duration: totalDuration,
          }
        }
        await flushSilence()
        await emit(takeChannels(decoded, info.numChannels, expected), expected)
        decodedChunks++
      }

      onProgress?.(Math.min(1, (written + pendingSilence) / Math.max(1, totalSamples)))
      await yieldToMain()
    }

    if (decodedChunks === 0 || !info) {
      throw new Error("Could not decode any audio from this file")
    }

    // Trailing silence for chunks that failed at the very end, plus whatever
    // per-chunk rounding left short of the nominal total.
    pendingSilence += Math.max(0, totalSamples - written - pendingSilence)
    await flushSilence()

    onProgress?.(1)
    return info
  } finally {
    ctx.close().catch(() => {})
  }
}

/**
 * Extract exactly `length` samples per channel from `decoded`, padding with
 * silence or truncating as needed, and forcing the channel count to `channels`.
 */
function takeChannels(
  decoded: AudioBuffer,
  channels: number,
  length: number,
): Float32Array[] {
  const out: Float32Array[] = []
  const copied = Math.min(decoded.length, length)

  for (let ch = 0; ch < channels; ch++) {
    // A file whose channel count changes mid-stream (or a mono chunk inside a
    // stereo file) reuses channel 0 — copied, never aliased, since handlers are
    // allowed to mutate what they get.
    const src = decoded.getChannelData(Math.min(ch, decoded.numberOfChannels - 1))
    if (decoded.length === length && ch < decoded.numberOfChannels) {
      out.push(src)
      continue
    }
    const buf = new Float32Array(length)
    buf.set(src.subarray(0, copied))
    out.push(buf)
  }

  return out
}

// ---------------------------------------------------------------------------
// Everything else — one decode, sliced up for the consumer
// ---------------------------------------------------------------------------

async function streamWhole(
  blob: Blob,
  onChunk: AudioChunkHandler,
  opts: StreamAudioOptions,
): Promise<AudioStreamInfo> {
  const { sampleRate, onProgress, signal } = opts

  const ctx = sampleRate ? new AudioContext({ sampleRate }) : new AudioContext()
  let decoded: AudioBuffer
  try {
    decoded = await ctx.decodeAudioData(await blob.arrayBuffer())
  } finally {
    ctx.close().catch(() => {})
  }
  throwIfAborted(signal)

  const info: AudioStreamInfo = {
    sampleRate: decoded.sampleRate,
    numChannels: decoded.numberOfChannels,
    totalSamples: decoded.length,
    duration: decoded.duration,
  }

  console.log(
    `[streamAudioChunks] whole-file decode: ${info.duration.toFixed(1)}s @${info.sampleRate}Hz`,
  )

  const full: Float32Array[] = []
  for (let ch = 0; ch < info.numChannels; ch++) {
    full.push(decoded.getChannelData(ch))
  }

  const framesPerChunk = Math.max(1, Math.round(CHUNK_SEC * info.sampleRate))

  for (let frame = 0; frame < info.totalSamples; frame += framesPerChunk) {
    throwIfAborted(signal)

    const length = Math.min(framesPerChunk, info.totalSamples - frame)
    const channels = full.map(c => c.subarray(frame, frame + length))

    await onChunk({ channels, length, startSample: frame }, info)
    onProgress?.((frame + length) / info.totalSamples)
    await yieldToMain()
  }

  return info
}
