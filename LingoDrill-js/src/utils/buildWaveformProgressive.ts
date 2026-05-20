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