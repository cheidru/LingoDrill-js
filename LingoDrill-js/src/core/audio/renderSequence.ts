// core/audio/renderSequence.ts
//
// Background-mode sequence renderer.
//
// Bakes a sequence (fragments + per-fragment repeats + inter-fragment gaps +
// speed) into a single mono MP3 blob. The blob is played by a dedicated
// HTMLAudioElement with loop=true, which is the only audio path browsers keep
// running with the screen off / tab backgrounded — see useBackgroundPlayback.
//
// Memory: walks the source MP3 chunk-by-chunk (reusing the frame-aligned chunk
// planner from utils/mp3Frames.ts). Peak memory is one decoded ~30s chunk + a
// per-fragment scratch buffer + the MP3 encoder state. Multi-hour sources are
// safe — the same OOM bound the streamWaveform refactor (commit d6ea3db)
// established for waveform building.
//
// Limit: MP3 sources only. Non-MP3 files throw — background mode is disabled
// in the UI for them.
//
// Pitch: per-fragment speed is applied via OfflineAudioContext (AudioBuffer
// SourceNode.playbackRate). That node does NOT preserve pitch, unlike the live
// HtmlAudioEngine which uses HTMLAudioElement.playbackRate with
// preservesPitch=true. The two modes therefore diverge for fragments whose
// speed is not 1× — call out in the UI if it becomes a real issue.

import { Mp3Encoder } from "@breezystack/lamejs"
import { looksLikeMp3, planMp3Chunks } from "../../utils/mp3Frames"
import { FRAGMENT_TRAILING_PAUSE } from "./constants"

export interface RenderFragment {
  /** Source-file start time, seconds. */
  start: number
  /** Source-file end time, seconds. */
  end: number
  /** Number of times to play this fragment (>= 1). */
  repeat: number
  /** Playback rate (1 = normal). */
  speed: number
}

export interface FragmentOffset {
  /** Index into the input `fragments` array. */
  fragmentIndex: number
  /** Start time of this fragment in the output MP3, seconds. */
  startSec: number
}

export interface RenderResult {
  mp3Blob: Blob
  fragmentOffsets: FragmentOffset[]
  /** Total duration of the output MP3, seconds (computed, not measured). */
  durationSec: number
}

export interface RenderOptions {
  /** Silence between adjacent fragments, seconds. */
  fragmentGapSec: number
  /** Silence between repeats of the same fragment, seconds. Defaults to FRAGMENT_TRAILING_PAUSE. */
  trailingPauseSec?: number
  onProgress?: (progress: number) => void
  signal?: AbortSignal
}

const SAMPLE_RATE = 44_100
const MP3_BITRATE_KBPS = 128
/** Standard MP3 layer-3 frame size in samples — lamejs prefers inputs in multiples of this. */
const ENCODE_BLOCK = 1152

/**
 * Render a sequence into a single MP3 blob.
 *
 * @param blob Source audio file (MP3 only).
 * @param fragments Enabled fragments in playback order. Disabled fragments
 *   must be filtered out by the caller.
 */
export async function renderSequence(
  blob: Blob,
  fragments: RenderFragment[],
  opts: RenderOptions,
): Promise<RenderResult> {
  const {
    fragmentGapSec,
    trailingPauseSec = FRAGMENT_TRAILING_PAUSE,
    onProgress,
    signal,
  } = opts

  if (fragments.length === 0) throw new Error("No fragments to render")

  const bytes = new Uint8Array(await blob.arrayBuffer())
  if (signal?.aborted) throw new DOMException("Render aborted", "AbortError")
  if (!looksLikeMp3(bytes)) {
    throw new Error("Background mode requires an MP3 source file")
  }

  const plan = planMp3Chunks(bytes, 30)
  // Precompute each chunk's absolute start time (cumulative durations).
  const chunkStartTimes: number[] = new Array(plan.chunks.length)
  {
    let t = 0
    for (let i = 0; i < plan.chunks.length; i++) {
      chunkStartTimes[i] = t
      t += plan.chunks[i].durationSec
    }
  }

  const mp3Enc = new Mp3Encoder(1, SAMPLE_RATE, MP3_BITRATE_KBPS)
  const mp3Parts: Uint8Array[] = []
  const fragmentOffsets: FragmentOffset[] = []

  // Single-entry decoded-chunk cache. Consecutive fragments often pull samples
  // from the same chunk, so this avoids repeated decodes of the common case.
  let cachedChunkIdx = -1
  let cachedChunk: AudioBuffer | null = null

  // Force a known output sample rate so the MP3 encoder gets a rate it supports
  // and we never resample twice. decodeAudioData() will resample chunks for us.
  const ctx = new AudioContext({ sampleRate: SAMPLE_RATE })

  const writeInt16 = (samples: Int16Array): void => {
    for (let i = 0; i < samples.length; i += ENCODE_BLOCK) {
      const end = Math.min(i + ENCODE_BLOCK, samples.length)
      const enc = mp3Enc.encodeBuffer(samples.subarray(i, end))
      if (enc.length > 0) mp3Parts.push(enc)
    }
  }

  const silenceBlock = new Int16Array(ENCODE_BLOCK)
  const writeSilence = (durSec: number): void => {
    const total = Math.round(durSec * SAMPLE_RATE)
    if (total <= 0) return
    let written = 0
    while (written < total) {
      const len = Math.min(ENCODE_BLOCK, total - written)
      const enc = mp3Enc.encodeBuffer(silenceBlock.subarray(0, len))
      if (enc.length > 0) mp3Parts.push(enc)
      written += len
    }
  }

  const floatToInt16 = (f: Float32Array): Int16Array => {
    const out = new Int16Array(f.length)
    for (let i = 0; i < f.length; i++) {
      const s = f[i] < -1 ? -1 : f[i] > 1 ? 1 : f[i]
      out[i] = s < 0 ? (s * 0x8000) | 0 : (s * 0x7fff) | 0
    }
    return out
  }

  const getChunk = async (idx: number): Promise<AudioBuffer> => {
    if (cachedChunkIdx === idx && cachedChunk) return cachedChunk
    cachedChunkIdx = -1
    cachedChunk = null
    const c = plan.chunks[idx]
    // decodeAudioData() detaches its ArrayBuffer — slice yields a fresh copy.
    const slice = bytes.slice(c.byteStart, c.byteEnd)
    const decoded = await ctx.decodeAudioData(slice.buffer)
    cachedChunkIdx = idx
    cachedChunk = decoded
    return decoded
  }

  /** Pull a fragment's mono samples out of the source by walking overlapping chunks. */
  const extractFragment = async (frag: RenderFragment): Promise<Float32Array> => {
    const fragSamples = Math.max(0, Math.round((frag.end - frag.start) * SAMPLE_RATE))
    const out = new Float32Array(fragSamples)
    if (fragSamples === 0) return out

    let writeOffset = 0
    for (let ci = 0; ci < plan.chunks.length; ci++) {
      const chunkStart = chunkStartTimes[ci]
      const chunkEnd = chunkStart + plan.chunks[ci].durationSec
      if (chunkEnd <= frag.start) continue
      if (chunkStart >= frag.end) break
      if (signal?.aborted) throw new DOMException("Render aborted", "AbortError")

      const decoded = await getChunk(ci)
      const sr = decoded.sampleRate
      const chunkLen = decoded.length
      const fragStartInChunk = Math.max(0, Math.floor((frag.start - chunkStart) * sr))
      const fragEndInChunk = Math.min(chunkLen, Math.ceil((frag.end - chunkStart) * sr))
      const available = fragEndInChunk - fragStartInChunk
      if (available <= 0) continue

      const remaining = fragSamples - writeOffset
      const n = Math.min(available, remaining)
      const ch0 = decoded.getChannelData(0)
      if (decoded.numberOfChannels > 1) {
        const ch1 = decoded.getChannelData(1)
        for (let i = 0; i < n; i++) {
          out[writeOffset + i] = (ch0[fragStartInChunk + i] + ch1[fragStartInChunk + i]) * 0.5
        }
      } else {
        out.set(ch0.subarray(fragStartInChunk, fragStartInChunk + n), writeOffset)
      }
      writeOffset += n
      if (writeOffset >= fragSamples) break
    }
    return out
  }

  /** Apply playbackRate via OfflineAudioContext. Returns input unchanged at 1×. */
  const applySpeed = async (samples: Float32Array, speed: number): Promise<Float32Array> => {
    if (Math.abs(speed - 1) < 1e-6 || samples.length === 0) return samples
    const inBuf = ctx.createBuffer(1, samples.length, SAMPLE_RATE)
    inBuf.getChannelData(0).set(samples)
    const outLen = Math.max(1, Math.ceil(samples.length / speed))
    const off = new OfflineAudioContext(1, outLen, SAMPLE_RATE)
    const src = off.createBufferSource()
    src.buffer = inBuf
    src.playbackRate.value = speed
    src.connect(off.destination)
    src.start(0)
    const rendered = await off.startRendering()
    return rendered.getChannelData(0).slice()
  }

  let totalOutputSec = 0
  try {
    for (let fi = 0; fi < fragments.length; fi++) {
      if (signal?.aborted) throw new DOMException("Render aborted", "AbortError")
      const frag = fragments[fi]
      fragmentOffsets.push({ fragmentIndex: fi, startSec: totalOutputSec })

      const raw = await extractFragment(frag)
      const processed = await applySpeed(raw, frag.speed)
      const repeat = Math.max(1, frag.repeat)
      const segSec = processed.length / SAMPLE_RATE

      for (let r = 0; r < repeat; r++) {
        if (signal?.aborted) throw new DOMException("Render aborted", "AbortError")
        writeInt16(floatToInt16(processed))
        totalOutputSec += segSec
        if (r < repeat - 1) {
          writeSilence(trailingPauseSec)
          totalOutputSec += trailingPauseSec
        }
      }

      // Gap between fragments — also added after the last fragment so the
      // <audio loop> restart doesn't slam fragment[N-1] straight into fragment[0].
      writeSilence(fragmentGapSec)
      totalOutputSec += fragmentGapSec

      onProgress?.((fi + 1) / fragments.length)
    }

    const flushed = mp3Enc.flush()
    if (flushed.length > 0) mp3Parts.push(flushed)
  } finally {
    cachedChunk = null
    ctx.close().catch(() => {})
  }

  const mp3Blob = new Blob(mp3Parts as BlobPart[], { type: "audio/mpeg" })
  return { mp3Blob, fragmentOffsets, durationSec: totalOutputSec }
}
