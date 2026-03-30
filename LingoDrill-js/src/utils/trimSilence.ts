// utils/trimSilence.ts

import type { SpeechSegment } from "./detectSpeech"

/**
 * Склеивает только речевые сегменты из AudioBuffer в новый WAV Blob.
 * Gaps between segments shorter than minGapSeconds are preserved (not trimmed).
 * Возвращает Blob (audio/wav) и маппинг старых таймкодов в новые.
 */
export interface TrimResult {
  blob: Blob
  /** Маппинг: для каждого исходного сегмента — его новые start/end в обрезанном файле */
  segmentMap: { oldStart: number; oldEnd: number; newStart: number; newEnd: number }[]
  /** Длительность нового файла в секундах */
  newDuration: number
  /** First channel PCM data of the trimmed audio (for waveform building) */
  channelData: Float32Array
}

/** Minimum gap duration (in seconds) to be removed. Gaps shorter than this are kept. */
const MIN_GAP_TO_TRIM = 5

/** Seconds of silence to keep on each side of a removed gap */
const GAP_KEEP_SECONDS = 2

export function trimSilence(
  audioBuffer: AudioBuffer,
  segments: SpeechSegment[],
  paddingSeconds: number = 0.1,
): TrimResult {
  const sampleRate = audioBuffer.sampleRate
  const numChannels = audioBuffer.numberOfChannels

  // Expand segments with padding, clamp to buffer bounds
  const duration = audioBuffer.duration
  const padded = segments.map(seg => ({
    start: Math.max(0, seg.start - paddingSeconds),
    end: Math.min(duration, seg.end + paddingSeconds),
  }))

  // Merge overlapping segments
  const merged: { start: number; end: number }[] = []
  for (const seg of padded) {
    if (merged.length > 0 && seg.start <= merged[merged.length - 1].end) {
      merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, seg.end)
    } else {
      merged.push({ ...seg })
    }
  }

  // Second pass: handle gaps between segments.
  // - Gaps < MIN_GAP_TO_TRIM: fully preserved (segments merged over the gap)
  // - Gaps >= MIN_GAP_TO_TRIM: trimmed, but GAP_KEEP_SECONDS kept on each side
  const mergedWithShortGaps: { start: number; end: number }[] = []
  for (const seg of merged) {
    if (mergedWithShortGaps.length > 0) {
      const prev = mergedWithShortGaps[mergedWithShortGaps.length - 1]
      const gap = seg.start - prev.end
      if (gap < MIN_GAP_TO_TRIM) {
        // Gap is short — merge by extending the previous segment to cover the gap
        console.log(`[trimSilence] Preserving short gap: ${gap.toFixed(2)}s (< ${MIN_GAP_TO_TRIM}s) between ${prev.end.toFixed(2)}s and ${seg.start.toFixed(2)}s`)
        prev.end = Math.max(prev.end, seg.end)
        continue
      }
      // Gap is long — keep GAP_KEEP_SECONDS on each side
      const keepAfterPrev = Math.min(GAP_KEEP_SECONDS, gap / 2)
      const keepBeforeSeg = Math.min(GAP_KEEP_SECONDS, gap / 2)
      prev.end = Math.min(prev.end + keepAfterPrev, seg.start)
      const newStart = Math.max(seg.start - keepBeforeSeg, prev.end)
      console.log(`[trimSilence] Trimming long gap: ${gap.toFixed(2)}s, keeping ${keepAfterPrev.toFixed(2)}s after prev and ${keepBeforeSeg.toFixed(2)}s before next`)
      mergedWithShortGaps.push({ start: newStart, end: seg.end })
      continue
    }
    mergedWithShortGaps.push({ ...seg })
  }

  // Calculate total samples needed
  let totalSamples = 0
  const segmentMap: TrimResult["segmentMap"] = []

  for (const seg of mergedWithShortGaps) {
    const segSamples = Math.round((seg.end - seg.start) * sampleRate)
    const newStart = totalSamples / sampleRate
    const newEnd = newStart + (seg.end - seg.start)
    segmentMap.push({
      oldStart: seg.start,
      oldEnd: seg.end,
      newStart,
      newEnd,
    })
    totalSamples += segSamples
  }

  // Build per-channel arrays, then encode to WAV
  const channelArrays: Float32Array[] = []
  for (let ch = 0; ch < numChannels; ch++) {
    const channelOut = new Float32Array(totalSamples)
    const channelIn = audioBuffer.getChannelData(ch)
    let writeOffset = 0

    for (const seg of mergedWithShortGaps) {
      const startSample = Math.round(seg.start * sampleRate)
      const endSample = Math.round(seg.end * sampleRate)
      const length = endSample - startSample

      for (let i = 0; i < length && (startSample + i) < channelIn.length; i++) {
        channelOut[writeOffset + i] = channelIn[startSample + i]
      }
      writeOffset += length
    }

    channelArrays.push(channelOut)
  }

  // Encode to WAV
  const blob = encodeWav(channelArrays, sampleRate)
  const newDuration = totalSamples / sampleRate

  return { blob, segmentMap, newDuration, channelData: channelArrays[0] }
}

/**
 * Кодирует массивы каналов в WAV Blob (16-bit PCM).
 */
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
  view.setUint32(16, 16, true) // chunk size
  view.setUint16(20, 1, true) // PCM format
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true) // byte rate
  view.setUint16(32, numChannels * bytesPerSample, true) // block align
  view.setUint16(34, bytesPerSample * 8, true) // bits per sample

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