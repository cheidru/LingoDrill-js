// utils/normalizeFragments.ts
//
// Normalizes audio so that the average loudness (RMS) of every fragment
// matches the loudest fragment. Non-fragment regions are left unchanged.
//
// Algorithm:
// 1. For each fragment, compute the RMS (root mean square) of its samples.
// 2. Find the fragment with the highest RMS — this is the target level.
// 3. For each other fragment, compute gain = targetRMS / fragmentRMS.
// 4. Apply gain with soft clipping to avoid distortion.
// 5. Use short crossfade at fragment boundaries to prevent clicks.
// 6. Encode the result as a WAV blob.
//
// STREAMED (was: whole-file decode). The previous version took a decoded
// AudioBuffer and allocated a full second copy plus the entire output WAV in
// one ArrayBuffer. For a big file that is three multi-gigabyte allocations at
// once, which desktop browsers refuse — the user saw "Normalize volume failed".
// Now the file is walked in ~30 s chunks (see streamAudioChunks) and the WAV is
// assembled piece by piece (see wavBlobWriter), so peak memory is one chunk
// regardless of file length.
//
// Two passes are needed because a fragment's gain depends on the loudest
// fragment in the whole file, which is only known once every fragment has been
// measured. Pass 1 measures at 16 kHz — loudness ratios are what matter and
// they survive the lower rate — so only pass 2 pays for a full-rate decode.

import type { SequenceFragment } from "../core/domain/types"
import { streamAudioChunks } from "./streamAudioChunks"
import { WavBlobWriter } from "./wavBlobWriter"
import { WaveformAccumulator } from "./buildWaveformProgressive"

export interface NormalizeResult {
  /** The normalized audio as a WAV blob */
  blob: Blob
  /** Waveform of the normalized audio (values 0..1), ready to cache */
  waveform: number[]
  /** Per-fragment info for the result modal */
  fragmentGains: { index: number; rms: number; gainApplied: number }[]
  /** RMS of the loudest fragment (target) */
  targetRms: number
}

export interface NormalizeOptions {
  /** Called with overall progress 0..1 across both passes. */
  onProgress?: (progress: number) => void
  signal?: AbortSignal
  /** Number of waveform points to produce (default 4000). */
  waveformPoints?: number
}

/** Crossfade duration in seconds at fragment boundaries to prevent clicks */
const CROSSFADE_SECONDS = 0.005

/** Rate used to measure fragment loudness — only the ratios matter. */
const ANALYSIS_RATE = 16_000

/** Share of the progress bar spent on the measuring pass. */
const ANALYSIS_PROGRESS_SHARE = 0.3

/** 20x max amplification (~26 dB) — keeps very quiet fragments from turning into noise. */
const MAX_GAIN = 20

interface FragmentGain {
  index: number
  rms: number
  gainApplied: number
  startSample: number
  endSample: number
}

/**
 * Soft-clip a sample value to prevent harsh digital clipping.
 * Uses tanh-based soft clipping for values beyond [-1, 1].
 */
function softClip(sample: number): number {
  if (sample >= -1 && sample <= 1) return sample
  return Math.tanh(sample)
}

/**
 * Normalize all fragments in an audio file so that each fragment's average
 * loudness (RMS) matches the loudest fragment.
 *
 * @param blob - the source audio file
 * @param fragments - array of fragments with start/end times
 * @returns NormalizeResult with the new WAV blob and metadata
 */
export async function normalizeFragments(
  blob: Blob,
  fragments: SequenceFragment[],
  opts: NormalizeOptions = {},
): Promise<NormalizeResult> {
  const { onProgress, signal, waveformPoints = 4000 } = opts

  // Sort fragments by start time
  const sorted = [...fragments].sort((a, b) => a.start - b.start)

  console.log(`[normalizeFragments] Starting: ${fragments.length} fragments`)

  // --- Pass 1: measure each fragment's RMS ---------------------------------

  const rms = await measureFragmentRms(blob, sorted, {
    signal,
    onProgress: p => onProgress?.(p * ANALYSIS_PROGRESS_SHARE),
  })

  let maxRms = 0
  for (const value of rms) {
    if (value > maxRms) maxRms = value
  }
  console.log(`[normalizeFragments] Target RMS (loudest fragment): ${maxRms.toFixed(6)}`)

  // --- Pass 2: apply the gains and write the result ------------------------

  let writer: WavBlobWriter | null = null
  let waveform: WaveformAccumulator | null = null
  let gains: FragmentGain[] = []

  const info = await streamAudioChunks(
    blob,
    (chunk, streamInfo) => {
      if (!writer) {
        writer = new WavBlobWriter(streamInfo.numChannels, streamInfo.sampleRate)
        waveform = new WaveformAccumulator(streamInfo.totalSamples, waveformPoints)
        gains = buildGains(sorted, rms, maxRms, streamInfo.sampleRate)
      }

      applyGains(
        chunk.channels,
        chunk.startSample,
        chunk.length,
        gains,
        Math.round(CROSSFADE_SECONDS * streamInfo.sampleRate),
      )

      waveform!.push(chunk.channels[0], 0, chunk.length)
      writer!.append(chunk.channels, 0, chunk.length)
    },
    {
      signal,
      onProgress: p =>
        onProgress?.(ANALYSIS_PROGRESS_SHARE + p * (1 - ANALYSIS_PROGRESS_SHARE)),
    },
  )

  if (!writer || !waveform) {
    throw new Error("Could not read any audio from this file")
  }
  const wavWriter: WavBlobWriter = writer
  const waveformAcc: WaveformAccumulator = waveform

  const result = wavWriter.finish()
  console.log(
    `[normalizeFragments] Done. ${info.duration.toFixed(1)}s, ` +
    `output WAV size: ${(result.size / 1e6).toFixed(1)} MB`,
  )

  return {
    blob: result,
    waveform: waveformAcc.result(),
    fragmentGains: gains.map(g => ({ index: g.index, rms: g.rms, gainApplied: g.gainApplied })),
    targetRms: maxRms,
  }
}

/**
 * Pass 1 — RMS of every fragment, measured at ANALYSIS_RATE from channel 0.
 */
async function measureFragmentRms(
  blob: Blob,
  sorted: SequenceFragment[],
  opts: { signal?: AbortSignal; onProgress?: (p: number) => void },
): Promise<number[]> {
  const sumSq = new Float64Array(sorted.length)
  const counts = new Float64Array(sorted.length)

  await streamAudioChunks(
    blob,
    (chunk, info) => {
      const ch0 = chunk.channels[0]
      const chunkStart = chunk.startSample
      const chunkEnd = chunkStart + chunk.length

      for (let i = 0; i < sorted.length; i++) {
        const from = Math.max(chunkStart, Math.round(sorted[i].start * info.sampleRate))
        const to = Math.min(chunkEnd, Math.round(sorted[i].end * info.sampleRate))
        if (to <= from) continue

        let sum = 0
        for (let j = from - chunkStart; j < to - chunkStart; j++) {
          const sample = ch0[j]
          sum += sample * sample
        }
        sumSq[i] += sum
        counts[i] += to - from
      }
    },
    { sampleRate: ANALYSIS_RATE, signal: opts.signal, onProgress: opts.onProgress },
  )

  const rms: number[] = []
  for (let i = 0; i < sorted.length; i++) {
    const value = counts[i] > 0 ? Math.sqrt(sumSq[i] / counts[i]) : 0
    rms.push(value)
    console.log(
      `[normalizeFragments] Fragment ${i}: ` +
      `${sorted[i].start.toFixed(2)}s–${sorted[i].end.toFixed(2)}s, RMS=${value.toFixed(6)}`,
    )
  }
  return rms
}

/** Gain per fragment, in output samples. A gain of 1 leaves the region untouched. */
function buildGains(
  sorted: SequenceFragment[],
  rms: number[],
  maxRms: number,
  sampleRate: number,
): FragmentGain[] {
  return sorted.map((frag, index) => {
    // No usable reference (every fragment silent) → leave the audio alone.
    const gainApplied =
      maxRms > 0 && rms[index] > 0 ? Math.min(maxRms / rms[index], MAX_GAIN) : 1
    if (gainApplied !== 1) {
      console.log(
        `[normalizeFragments] Fragment ${index}: gain=${gainApplied.toFixed(3)}x ` +
        `(${(20 * Math.log10(gainApplied)).toFixed(1)} dB)`,
      )
    }
    return {
      index,
      rms: rms[index],
      gainApplied,
      startSample: Math.round(frag.start * sampleRate),
      endSample: Math.round(frag.end * sampleRate),
    }
  })
}

/**
 * Apply fragment gains to one chunk, in place.
 *
 * `startSample` is the chunk's position on the file timeline, so a fragment
 * spanning a chunk boundary keeps a single continuous crossfade envelope.
 */
function applyGains(
  channels: Float32Array[],
  startSample: number,
  length: number,
  gains: FragmentGain[],
  crossfadeSamples: number,
): void {
  const chunkEnd = startSample + length

  for (const g of gains) {
    if (g.gainApplied === 1) continue

    const from = Math.max(startSample, g.startSample)
    const to = Math.min(chunkEnd, g.endSample)
    if (to <= from) continue

    for (const channel of channels) {
      // Read from a snapshot so overlapping fragments each scale the original
      // sample rather than compounding on one another's output.
      const src = channel.slice(from - startSample, to - startSample)

      for (let i = from; i < to; i++) {
        let gain = g.gainApplied

        // Crossfade in at the start of the fragment and out at its end.
        const fromStart = i - g.startSample
        if (fromStart < crossfadeSamples) {
          gain = 1 + (g.gainApplied - 1) * (fromStart / crossfadeSamples)
        }
        const fromEnd = g.endSample - 1 - i
        if (fromEnd < crossfadeSamples) {
          gain = 1 + (g.gainApplied - 1) * (fromEnd / crossfadeSamples)
        }

        channel[i - startSample] = softClip(src[i - from] * gain)
      }
    }
  }
}
