// utils/maximizeFragments.ts
//
// Makes every selected fragment as loud as it can be WITHOUT distortion.
// Non-fragment regions are left unchanged.
//
// Each fragment is amplified by target / itsOwnPeak, so its loudest sample
// lands just under full scale and nothing ever clips. This is the difference
// from normalizeFragments: that one matches every fragment's average loudness
// (RMS) to the loudest fragment, which can push peaks past full scale and rely
// on tanh soft clipping — audible as distortion on a quiet fragment with sharp
// transients. Here the ceiling is the constraint, so the result is
// mathematically clean amplification with no soft clipping at all.
//
// The trade-off, chosen deliberately: fragments do not keep their loudness
// relationships. A loud and a quiet fragment both end up peaking at the
// ceiling. Use normalizeFragments when relative dynamics matter.
//
// How much a fragment actually gains depends on its existing peak — one sharp
// transient limits its whole range. A fragment already peaking near full scale
// gains almost nothing, which is the honest answer rather than a defect.
//
// Streamed in ~30 s chunks (see streamAudioChunks); peak memory is one chunk
// regardless of file length.

import type { SequenceFragment } from "../core/domain/types"
import { streamAudioChunks } from "./streamAudioChunks"
import { WavBlobWriter } from "./wavBlobWriter"
import { WaveformAccumulator } from "./buildWaveformProgressive"

export interface MaximizeResult {
  /** The maximized audio as a WAV blob */
  blob: Blob
  /** Waveform of the result (values 0..1), ready to cache */
  waveform: number[]
  /** Per-fragment info for the result modal */
  fragmentGains: { index: number; peak: number; gainApplied: number }[]
  /** How many fragments hit the gain cap instead of the ceiling */
  cappedCount: number
}

export interface MaximizeOptions {
  /** Called with overall progress 0..1 across both passes. */
  onProgress?: (progress: number) => void
  signal?: AbortSignal
  /** Number of waveform points to produce (default 4000). */
  waveformPoints?: number
}

/**
 * Ceiling every fragment is raised to, ≈ -0.18 dBFS.
 *
 * Not exactly 1.0: MP3 decoding can already return samples slightly outside
 * ±1.0, and leaving a sliver of headroom keeps the 16-bit conversion from
 * landing on the clamp.
 */
const TARGET_PEAK = 0.98

/**
 * Ceiling on amplification, matching normalizeFragments. A fragment that is
 * nearly silent would otherwise be multiplied by hundreds, which does not
 * recover speech — it just lifts the noise floor into audibility.
 */
const MAX_GAIN = 20

/** Crossfade at fragment boundaries to prevent clicks (seconds). */
const CROSSFADE_SECONDS = 0.005

/** Share of the progress bar spent on the measuring pass. */
const MEASURE_PROGRESS_SHARE = 0.4

interface FragmentGain {
  index: number
  peak: number
  gainApplied: number
  startSample: number
  endSample: number
}

/**
 * Amplify each fragment to just under full scale.
 *
 * @param blob - the source audio file
 * @param fragments - fragments to maximize; everything else is copied as-is
 */
export async function maximizeFragments(
  blob: Blob,
  fragments: SequenceFragment[],
  opts: MaximizeOptions = {},
): Promise<MaximizeResult> {
  const { onProgress, signal, waveformPoints = 4000 } = opts

  const sorted = [...fragments].sort((a, b) => a.start - b.start)
  console.log(`[maximizeFragments] Starting: ${sorted.length} fragments`)

  // --- Pass 1: find each fragment's peak --------------------------------
  //
  // At the file's own rate, not a reduced one. Peaks do not survive
  // downsampling — resampling smooths transients, so a peak measured at 16 kHz
  // underestimates the real one and the gain derived from it would clip.
  // (normalizeFragments can measure at 16 kHz because RMS does survive.)

  const peaks = new Float64Array(sorted.length)

  await streamAudioChunks(
    blob,
    (chunk, info) => {
      const chunkStart = chunk.startSample
      const chunkEnd = chunkStart + chunk.length

      for (let i = 0; i < sorted.length; i++) {
        const from = Math.max(chunkStart, Math.round(sorted[i].start * info.sampleRate))
        const to = Math.min(chunkEnd, Math.round(sorted[i].end * info.sampleRate))
        if (to <= from) continue

        // Peak across every channel — gain is applied to all of them, so the
        // loudest channel is what decides whether the result clips.
        let peak = peaks[i]
        for (const channel of chunk.channels) {
          for (let j = from - chunkStart; j < to - chunkStart; j++) {
            const value = channel[j] < 0 ? -channel[j] : channel[j]
            if (value > peak) peak = value
          }
        }
        peaks[i] = peak
      }
    },
    { signal, onProgress: p => onProgress?.(p * MEASURE_PROGRESS_SHARE) },
  )

  // --- Pass 2: apply the gains and write the result ----------------------

  let writer: WavBlobWriter | null = null
  let waveform: WaveformAccumulator | null = null
  let gains: FragmentGain[] = []

  const info = await streamAudioChunks(
    blob,
    (chunk, streamInfo) => {
      if (!writer) {
        writer = new WavBlobWriter(streamInfo.numChannels, streamInfo.sampleRate)
        waveform = new WaveformAccumulator(streamInfo.totalSamples, waveformPoints)
        gains = buildGains(sorted, peaks, streamInfo.sampleRate)
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
        onProgress?.(MEASURE_PROGRESS_SHARE + p * (1 - MEASURE_PROGRESS_SHARE)),
    },
  )

  if (!writer || !waveform) {
    throw new Error("Could not read any audio from this file")
  }
  const wavWriter: WavBlobWriter = writer
  const waveformAcc: WaveformAccumulator = waveform

  const result = wavWriter.finish()
  const cappedCount = gains.filter(g => g.gainApplied === MAX_GAIN).length

  console.log(
    `[maximizeFragments] Done. ${info.duration.toFixed(1)}s, ` +
    `${cappedCount} fragment(s) hit the ${MAX_GAIN}x cap, ` +
    `output WAV size: ${(result.size / 1e6).toFixed(1)} MB`,
  )

  return {
    blob: result,
    waveform: waveformAcc.result(),
    fragmentGains: gains.map(g => ({
      index: g.index,
      peak: g.peak,
      gainApplied: g.gainApplied,
    })),
    cappedCount,
  }
}

/** Gain per fragment, in output samples. A gain of 1 leaves the region untouched. */
function buildGains(
  sorted: SequenceFragment[],
  peaks: Float64Array,
  sampleRate: number,
): FragmentGain[] {
  return sorted.map((frag, index) => {
    const peak = peaks[index]
    // A silent fragment has no peak to scale from, and one already at or above
    // the ceiling has nothing to gain — both are left alone.
    const gainApplied =
      peak > 0 && peak < TARGET_PEAK ? Math.min(TARGET_PEAK / peak, MAX_GAIN) : 1

    console.log(
      `[maximizeFragments] Fragment ${index}: ` +
      `${frag.start.toFixed(2)}s–${frag.end.toFixed(2)}s, peak=${peak.toFixed(4)}, ` +
      `gain=${gainApplied.toFixed(3)}x (${(20 * Math.log10(gainApplied)).toFixed(1)} dB)`,
    )

    return {
      index,
      peak,
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
 *
 * No soft clipping here, unlike normalizeFragments: the gains are derived from
 * the measured peaks precisely so that nothing can exceed the ceiling. The
 * crossfade only ever scales between 1 and the fragment's gain, so it cannot
 * push a sample past it either.
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

        channel[i - startSample] = src[i - from] * gain
      }
    }
  }
}
