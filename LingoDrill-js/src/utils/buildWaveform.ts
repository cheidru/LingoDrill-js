// utils/buildWaveform.ts

/**
 * Строит нормализованный RMS waveform из AudioBuffer.
 *
 * @param buffer - декодированный AudioBuffer
 * @param samples - количество точек waveform
 * @returns массив значений 0..1
 */
export function buildWaveform(
  buffer: AudioBuffer,
  samples = 1000
): number[] {
  if (samples <= 0) {
    throw new Error("samples must be > 0")
  }

  const channelData = buffer.getChannelData(0)
  const totalSamples = channelData.length

  if (totalSamples === 0) {
    return new Array(samples).fill(0)
  }

  const blockSize = Math.floor(totalSamples / samples)

  if (blockSize === 0) {
    return new Array(samples).fill(0)
  }

  const waveform: number[] = new Array(samples)

  let max = 0

  for (let i = 0; i < samples; i++) {
    const start = i * blockSize
    const end = start + blockSize

    let sum = 0

    for (let j = start; j < end; j++) {
      const sample = channelData[j]
      sum += sample * sample
    }

    const rms = Math.sqrt(sum / blockSize)

    waveform[i] = rms

    if (rms > max) {
      max = rms
    }
  }

  // Нормализация к 0..1
  if (max > 0) {
    for (let i = 0; i < waveform.length; i++) {
      waveform[i] = waveform[i] / max
    }
  }

  return waveform
}