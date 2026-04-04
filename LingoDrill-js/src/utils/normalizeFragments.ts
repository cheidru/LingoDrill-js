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

import type { SequenceFragment } from "../core/domain/types"

export interface NormalizeResult {
  /** The normalized audio as a WAV blob */
  blob: Blob
  /** First channel PCM data (for waveform rebuilding) */
  channelData: Float32Array
  /** Per-fragment info for the result modal */
  fragmentGains: { index: number; rms: number; gainApplied: number }[]
  /** RMS of the loudest fragment (target) */
  targetRms: number
}

/** Crossfade duration in seconds at fragment boundaries to prevent clicks */
const CROSSFADE_SECONDS = 0.005

/**
 * Soft-clip a sample value to prevent harsh digital clipping.
 * Uses tanh-based soft clipping for values beyond [-1, 1].
 */
function softClip(sample: number): number {
  if (sample >= -1 && sample <= 1) return sample
  return Math.tanh(sample)
}

/**
 * Compute RMS (root mean square) of a Float32Array region.
 */
function computeRms(data: Float32Array, startSample: number, endSample: number): number {
  const start = Math.max(0, startSample)
  const end = Math.min(data.length, endSample)
  const count = end - start
  if (count <= 0) return 0

  let sumSq = 0
  for (let i = start; i < end; i++) {
    sumSq += data[i] * data[i]
  }
  return Math.sqrt(sumSq / count)
}

/**
 * Normalize all fragments in an AudioBuffer so that each fragment's average
 * loudness (RMS) matches the loudest fragment.
 *
 * @param audioBuffer - decoded audio
 * @param fragments - array of fragments with start/end times
 * @returns NormalizeResult with the new WAV blob and metadata
 */
export function normalizeFragments(
  audioBuffer: AudioBuffer,
  fragments: SequenceFragment[],
): NormalizeResult {
  const sampleRate = audioBuffer.sampleRate
  const numChannels = audioBuffer.numberOfChannels
  const totalSamples = audioBuffer.length

  console.log(`[normalizeFragments] Starting: ${fragments.length} fragments, ${numChannels} channels, ${sampleRate}Hz, ${totalSamples} samples`)

  // Sort fragments by start time
  const sorted = [...fragments].sort((a, b) => a.start - b.start)

  // Step 1: Compute RMS for each fragment (using channel 0 as reference)
  const ch0 = audioBuffer.getChannelData(0)
  const fragmentRmsData: { index: number; rms: number; startSample: number; endSample: number }[] = []

  for (let i = 0; i < sorted.length; i++) {
    const frag = sorted[i]
    const startSample = Math.round(frag.start * sampleRate)
    const endSample = Math.round(frag.end * sampleRate)
    const rms = computeRms(ch0, startSample, endSample)
    fragmentRmsData.push({ index: i, rms, startSample, endSample })
    console.log(`[normalizeFragments] Fragment ${i}: ${frag.start.toFixed(2)}s–${frag.end.toFixed(2)}s, RMS=${rms.toFixed(6)}`)
  }

  // Step 2: Find the loudest fragment
  let maxRms = 0
  for (const fd of fragmentRmsData) {
    if (fd.rms > maxRms) maxRms = fd.rms
  }

  console.log(`[normalizeFragments] Target RMS (loudest fragment): ${maxRms.toFixed(6)}`)

  // If no fragments or all silent, return original audio as-is
  if (maxRms === 0 || fragmentRmsData.length === 0) {
    console.log("[normalizeFragments] All fragments are silent or no fragments — returning original")
    const channelArrays: Float32Array[] = []
    for (let ch = 0; ch < numChannels; ch++) {
      channelArrays.push(new Float32Array(audioBuffer.getChannelData(ch)))
    }
    return {
      blob: encodeWav(channelArrays, sampleRate),
      channelData: channelArrays[0],
      fragmentGains: fragmentRmsData.map(fd => ({ index: fd.index, rms: fd.rms, gainApplied: 1 })),
      targetRms: 0,
    }
  }

  // Step 3: Compute gain for each fragment
  // Cap the maximum gain to prevent amplifying noise in very quiet fragments
  const MAX_GAIN = 20 // 20x max amplification (~26 dB)

  const gains: { index: number; rms: number; gainApplied: number; startSample: number; endSample: number }[] = []
  for (const fd of fragmentRmsData) {
    let gain = 1
    if (fd.rms > 0) {
      gain = Math.min(maxRms / fd.rms, MAX_GAIN)
    }
    gains.push({ ...fd, gainApplied: gain })
    console.log(`[normalizeFragments] Fragment ${fd.index}: gain=${gain.toFixed(3)}x (${(20 * Math.log10(gain)).toFixed(1)} dB)`)
  }

  // Step 4: Apply gains to all channels
  const crossfadeSamples = Math.round(CROSSFADE_SECONDS * sampleRate)
  const channelArrays: Float32Array[] = []

  for (let ch = 0; ch < numChannels; ch++) {
    const input = audioBuffer.getChannelData(ch)
    const output = new Float32Array(totalSamples)

    // Copy original data first
    output.set(input)

    // Apply gain to each fragment region
    for (const g of gains) {
      if (g.gainApplied === 1) continue // No change needed

      const start = g.startSample
      const end = Math.min(g.endSample, totalSamples)

      for (let i = start; i < end; i++) {
        let gain = g.gainApplied

        // Apply crossfade at the beginning of the fragment
        const fromStart = i - start
        if (fromStart < crossfadeSamples) {
          const t = fromStart / crossfadeSamples
          gain = 1 + (g.gainApplied - 1) * t
        }

        // Apply crossfade at the end of the fragment
        const fromEnd = end - 1 - i
        if (fromEnd < crossfadeSamples) {
          const t = fromEnd / crossfadeSamples
          gain = 1 + (g.gainApplied - 1) * t
        }

        output[i] = softClip(input[i] * gain)
      }
    }

    channelArrays.push(output)
  }

  console.log("[normalizeFragments] Gain applied to all channels, encoding WAV...")

  // Step 5: Encode to WAV
  const blob = encodeWav(channelArrays, sampleRate)

  console.log(`[normalizeFragments] Done. Output WAV size: ${(blob.size / 1024).toFixed(1)} KB`)

  return {
    blob,
    channelData: channelArrays[0],
    fragmentGains: gains.map(g => ({ index: g.index, rms: g.rms, gainApplied: g.gainApplied })),
    targetRms: maxRms,
  }
}

// ---------------------------------------------------------------------------
// WAV encoder (same as in trimSilence.ts)
// ---------------------------------------------------------------------------

function encodeWav(channels: Float32Array[], sampleRate: number): Blob {
  const numChannels = channels.length
  const numSamples = channels[0].length
  const bytesPerSample = 2 // 16-bit
  const dataSize = numSamples * numChannels * bytesPerSample
  const headerSize = 44
  const buffer = new ArrayBuffer(headerSize + dataSize)
  const view = new DataView(buffer)

  // RIFF header
  writeString(view, 0, "RIFF")
  view.setUint32(4, 36 + dataSize, true)
  writeString(view, 8, "WAVE")

  // fmt chunk
  writeString(view, 12, "fmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true)
  view.setUint16(32, numChannels * bytesPerSample, true)
  view.setUint16(34, bytesPerSample * 8, true)

  // data chunk
  writeString(view, 36, "data")
  view.setUint32(40, dataSize, true)

  // Interleave and write samples
  let offset = 44
  for (let i = 0; i < numSamples; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]))
      const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7FFF
      view.setInt16(offset, int16, true)
      offset += 2
    }
  }

  return new Blob([buffer], { type: "audio/wav" })
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i))
  }
}