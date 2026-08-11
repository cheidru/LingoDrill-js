// utils/trimSilence.ts
//
// Склеивает только речевые сегменты аудиофайла в новый WAV Blob.
//
// STREAMED (was: whole-file decode). The previous version took a decoded
// AudioBuffer and allocated per-channel output arrays plus the entire WAV in
// one ArrayBuffer — for a long file that is several gigabytes of allocation on
// top of the decoded input, which desktop browsers refuse, surfacing as
// "Trim silence failed". Now the source is walked in ~30 s chunks (see
// streamAudioChunks) and the WAV is assembled piece by piece (see
// wavBlobWriter), so peak memory is one chunk regardless of file length.

import type { SpeechSegment } from "./detectSpeech"
import { getTrimSilenceGap } from "./settings"
import { streamAudioChunks } from "./streamAudioChunks"
import { WavBlobWriter } from "./wavBlobWriter"
import { WaveformAccumulator } from "./buildWaveformProgressive"

/**
 * Gaps between segments shorter than MIN_GAP_TO_TRIM are preserved (not
 * trimmed). Возвращает Blob (audio/wav) и маппинг старых таймкодов в новые.
 */
export interface TrimResult {
  blob: Blob
  /** Маппинг: для каждого исходного сегмента — его новые start/end в обрезанном файле */
  segmentMap: { oldStart: number; oldEnd: number; newStart: number; newEnd: number }[]
  /** Длительность нового файла в секундах */
  newDuration: number
  /** Длительность исходного файла в секундах */
  originalDuration: number
  /** Waveform of the trimmed audio (values 0..1), ready to cache */
  waveform: number[]
}

export interface TrimOptions {
  /** Called with progress 0..1. */
  onProgress?: (progress: number) => void
  signal?: AbortSignal
  /** Number of waveform points to produce (default 4000). */
  waveformPoints?: number
}

/** Minimum gap duration (in seconds) to be removed. Gaps shorter than this are kept. */
const MIN_GAP_TO_TRIM = 5

/** A kept region of the source, in output samples. */
interface KeptRange {
  startSample: number
  endSample: number
}

export async function trimSilence(
  blob: Blob,
  segments: SpeechSegment[],
  paddingSeconds: number = 0.1,
  /* Seconds of silence to keep on each side of a removed gap — the
     "Trim silence gap" setting, read at call time. */
  gapKeepSeconds: number = getTrimSilenceGap(),
  opts: TrimOptions = {},
): Promise<TrimResult> {
  const { onProgress, signal, waveformPoints = 4000 } = opts

  let writer: WavBlobWriter | null = null
  let waveform: WaveformAccumulator | null = null
  let kept: KeptRange[] = []
  let segmentMap: TrimResult["segmentMap"] = []
  let plannedSamples = 0
  /** Index of the first kept range that may still overlap the current chunk. */
  let cursor = 0

  const info = await streamAudioChunks(
    blob,
    (chunk, streamInfo) => {
      if (!writer) {
        // The plan needs the source duration and rate, so it is built from the
        // first chunk's stream info rather than up front.
        const merged = planKeptSegments(
          segments,
          streamInfo.duration,
          paddingSeconds,
          gapKeepSeconds,
        )
        const planned = toSampleRanges(merged, streamInfo.sampleRate)
        kept = planned.kept
        segmentMap = planned.segmentMap
        plannedSamples = planned.totalSamples

        writer = new WavBlobWriter(streamInfo.numChannels, streamInfo.sampleRate)
        waveform = new WaveformAccumulator(plannedSamples, waveformPoints)
      }

      const chunkEnd = chunk.startSample + chunk.length

      // Ranges are sorted and disjoint, and chunks arrive in order, so the
      // pieces land in the output back to back.
      for (let i = cursor; i < kept.length; i++) {
        const range = kept[i]
        if (range.startSample >= chunkEnd) break
        if (range.endSample <= chunk.startSample) {
          // Fully behind us — never revisit it.
          cursor = i + 1
          continue
        }

        const from = Math.max(chunk.startSample, range.startSample) - chunk.startSample
        const to = Math.min(chunkEnd, range.endSample) - chunk.startSample
        if (to <= from) continue

        waveform!.push(chunk.channels[0], from, to - from)
        writer!.append(chunk.channels, from, to - from)
      }
    },
    { signal, onProgress },
  )

  if (!writer || !waveform) {
    throw new Error("Could not read any audio from this file")
  }
  const wavWriter: WavBlobWriter = writer
  const waveformAcc: WaveformAccumulator = waveform

  // A final segment clamped to the source duration can come up a few samples
  // short of the plan; pad so newDuration matches the segmentMap the caller
  // remaps fragments with.
  if (wavWriter.frameCount < plannedSamples) {
    const missing = plannedSamples - wavWriter.frameCount
    waveformAcc.push(new Float32Array(missing), 0, missing)
    wavWriter.appendSilence(missing)
  }

  const result = wavWriter.finish()
  const newDuration = wavWriter.frameCount / info.sampleRate

  console.log(
    `[trimSilence] Done. ${info.duration.toFixed(1)}s → ${newDuration.toFixed(1)}s, ` +
    `${segmentMap.length} segments, output ${(result.size / 1e6).toFixed(1)} MB`,
  )

  return {
    blob: result,
    segmentMap,
    newDuration,
    originalDuration: info.duration,
    waveform: waveformAcc.result(),
  }
}

/**
 * Expand the detected segments with padding, merge them, and decide which gaps
 * to remove. Pure time math — unchanged from the pre-streaming version.
 */
function planKeptSegments(
  segments: SpeechSegment[],
  duration: number,
  paddingSeconds: number,
  gapKeepSeconds: number,
): { start: number; end: number }[] {
  // Expand segments with padding, clamp to buffer bounds
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
  // - Gaps >= MIN_GAP_TO_TRIM: trimmed, but gapKeepSeconds kept on each side
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
      // Gap is long — keep gapKeepSeconds on each side
      const keepAfterPrev = Math.min(gapKeepSeconds, gap / 2)
      const keepBeforeSeg = Math.min(gapKeepSeconds, gap / 2)
      prev.end = Math.min(prev.end + keepAfterPrev, seg.start)
      const newStart = Math.max(seg.start - keepBeforeSeg, prev.end)
      console.log(`[trimSilence] Trimming long gap: ${gap.toFixed(2)}s, keeping ${keepAfterPrev.toFixed(2)}s after prev and ${keepBeforeSeg.toFixed(2)}s before next`)
      mergedWithShortGaps.push({ start: newStart, end: seg.end })
      continue
    }
    mergedWithShortGaps.push({ ...seg })
  }

  return mergedWithShortGaps
}

/** Convert kept time ranges into sample ranges plus the old→new time mapping. */
function toSampleRanges(
  merged: { start: number; end: number }[],
  sampleRate: number,
): { kept: KeptRange[]; segmentMap: TrimResult["segmentMap"]; totalSamples: number } {
  const kept: KeptRange[] = []
  const segmentMap: TrimResult["segmentMap"] = []
  let totalSamples = 0

  for (const seg of merged) {
    const startSample = Math.round(seg.start * sampleRate)
    const endSample = Math.round(seg.end * sampleRate)
    if (endSample <= startSample) continue

    const newStart = totalSamples / sampleRate
    totalSamples += endSample - startSample

    kept.push({ startSample, endSample })
    segmentMap.push({
      oldStart: seg.start,
      oldEnd: seg.end,
      newStart,
      newEnd: totalSamples / sampleRate,
    })
  }

  return { kept, segmentMap, totalSamples }
}
