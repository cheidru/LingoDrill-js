// utils/buildWaveformProgressive.ts
//
// Progressive waveform builder: produces a coarse waveform quickly from
// whatever PCM data is available, then refines as more chunks are decoded.
//
// This replaces the pattern of waiting for full decode → buildWaveform(100) → buildWaveform(1000)
// with a streaming approach that shows waveform data immediately.

/**
 * Build waveform progressively from raw channel data.
 * Can be called repeatedly as new chunks arrive — it rebuilds from
 * the raw data each time, which is fast for ≤ 1000 output samples.
 *
 * @param channelData - Float32Array of PCM samples (channel 0)
 * @param validSamples - how many samples in channelData are actually filled
 *                       (rest may be zeros from pre-allocation)
 * @param outputSamples - number of waveform points to generate
 * @param totalSamples - total expected sample count of the finished file.
 *                       When given, each waveform point maps to a fixed slot
 *                       on the *full* timeline, so a partially-decoded buffer
 *                       fills the waveform left-to-right (points past
 *                       validSamples stay 0). When omitted, points span only
 *                       the valid data.
 * @returns normalized waveform values 0..1
 */
export function buildWaveformFromRaw(
  channelData: Float32Array,
  validSamples: number,
  outputSamples = 1000,
  totalSamples?: number,
): number[] {
  if (validSamples <= 0 || outputSamples <= 0) {
    return new Array(outputSamples).fill(0)
  }

  // Map blocks to the full timeline when totalSamples is known, otherwise to
  // just the valid data.
  const span = totalSamples && totalSamples > 0 ? totalSamples : validSamples
  const blockSize = Math.floor(span / outputSamples)
  if (blockSize === 0) {
    return new Array(outputSamples).fill(0)
  }

  const waveform: number[] = new Array(outputSamples).fill(0)
  let max = 0

  for (let i = 0; i < outputSamples; i++) {
    const start = i * blockSize
    if (start >= validSamples) break // remaining points stay 0 (not decoded yet)
    const end = Math.min(start + blockSize, validSamples)

    let sum = 0
    for (let j = start; j < end; j++) {
      const sample = channelData[j]
      sum += sample * sample
    }

    const rms = Math.sqrt(sum / (end - start))
    waveform[i] = rms
    if (rms > max) max = rms
  }

  // Normalize
  if (max > 0) {
    for (let i = 0; i < waveform.length; i++) {
      waveform[i] /= max
    }
  }

  return waveform
}

/**
 * Same RMS-per-block waveform as buildWaveformFromRaw, accumulated as PCM
 * arrives instead of read from one complete Float32Array.
 *
 * Trim silence and Normalize volume write their result in ~30 s chunks and
 * never hold the whole thing (see streamAudioChunks), so they have no full
 * channel-0 array to hand to buildWaveformFromRaw — they push each chunk here
 * and read the waveform out at the end.
 */
export class WaveformAccumulator {
  private readonly sumSq: Float64Array
  private readonly counts: Float64Array
  private readonly blockSize: number
  private readonly outputSamples: number
  private pos = 0

  constructor(totalSamples: number, outputSamples = 1000) {
    this.outputSamples = outputSamples
    this.sumSq = new Float64Array(outputSamples)
    this.counts = new Float64Array(outputSamples)
    this.blockSize = Math.max(1, Math.floor(Math.max(0, totalSamples) / outputSamples))
  }

  /**
   * Fold the next `length` samples (channel 0) into the waveform. Calls must be
   * in timeline order — position is tracked internally.
   */
  push(data: Float32Array, offset: number, length: number): void {
    const { blockSize, outputSamples, sumSq, counts } = this
    const last = outputSamples - 1

    let i = 0
    while (i < length) {
      const bucket = Math.min(Math.floor((this.pos + i) / blockSize), last)
      // Everything past the last block's start folds into the final bucket,
      // which also absorbs the remainder of an uneven division.
      const n =
        bucket === last
          ? length - i
          : Math.min(length - i, (bucket + 1) * blockSize - (this.pos + i))

      let sum = 0
      const from = offset + i
      for (let j = from; j < from + n; j++) {
        const sample = data[j]
        sum += sample * sample
      }
      sumSq[bucket] += sum
      counts[bucket] += n
      i += n
    }

    this.pos += length
  }

  /** Normalized waveform values 0..1. */
  result(): number[] {
    const { outputSamples, sumSq, counts } = this
    const waveform = new Array<number>(outputSamples).fill(0)

    let max = 0
    for (let i = 0; i < outputSamples; i++) {
      const c = counts[i]
      if (c <= 0) continue
      const rms = Math.sqrt(sumSq[i] / c)
      waveform[i] = rms
      if (rms > max) max = rms
    }

    if (max > 0) {
      for (let i = 0; i < outputSamples; i++) waveform[i] /= max
    }

    return waveform
  }
}