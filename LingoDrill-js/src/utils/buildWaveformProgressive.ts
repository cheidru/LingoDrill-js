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
 * @returns normalized waveform values 0..1
 */
export function buildWaveformFromRaw(
  channelData: Float32Array,
  validSamples: number,
  outputSamples = 1000,
): number[] {
  if (validSamples <= 0 || outputSamples <= 0) {
    return new Array(outputSamples).fill(0)
  }

  const blockSize = Math.floor(validSamples / outputSamples)
  if (blockSize === 0) {
    return new Array(outputSamples).fill(0)
  }

  const waveform: number[] = new Array(outputSamples)
  let max = 0

  for (let i = 0; i < outputSamples; i++) {
    const start = i * blockSize
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