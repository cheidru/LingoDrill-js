// utils/mp3Frames.ts
//
// Lightweight MPEG-1/2/2.5 audio (MP3) frame parser.
//
// An MP3 file is just a sequence of self-contained frames — there is no
// container wrapping them. So a byte slice that begins and ends on frame
// boundaries is itself a valid, decodable MP3 stream. This lets us decode a
// long file in pieces via decodeAudioData() instead of one whole-file decode
// that would allocate gigabytes for a multi-hour file.

export interface Mp3Chunk {
  /** Byte offset of the first frame in the chunk. */
  byteStart: number
  /** Byte offset just past the last frame in the chunk. */
  byteEnd: number
  /** Audio duration of the chunk in seconds (summed from its frames). */
  durationSec: number
}

export interface Mp3Plan {
  chunks: Mp3Chunk[]
  /** Exact total audio duration in seconds, summed from frame durations. */
  totalDuration: number
}

// Bitrate tables in kbps, indexed by the 4-bit bitrate field (0 = free,
// 15 = invalid — both rejected).
const V1_L1 = [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448]
const V1_L2 = [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384]
const V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
const V2_L1 = [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256]
const V2_L23 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]

// Sample rates indexed by [version bits][sample-rate field].
// version bits: 0 = MPEG2.5, 1 = reserved, 2 = MPEG2, 3 = MPEG1
const SAMPLE_RATES = [
  [11025, 12000, 8000],   // MPEG2.5
  [0, 0, 0],              // reserved
  [22050, 24000, 16000],  // MPEG2
  [44100, 48000, 32000],  // MPEG1
]

interface FrameInfo {
  /** Frame length in bytes. */
  size: number
  /** PCM samples this frame decodes to. */
  samples: number
  sampleRate: number
}

/** Parse a 4-byte MP3 frame header at offset `o`, or return null if invalid. */
function parseFrameHeader(b: Uint8Array, o: number): FrameInfo | null {
  if (o + 4 > b.length) return null
  // Frame sync: 11 bits set.
  if (b[o] !== 0xff || (b[o + 1] & 0xe0) !== 0xe0) return null

  const versionBits = (b[o + 1] >> 3) & 0x03
  if (versionBits === 1) return null // reserved
  const layerBits = (b[o + 1] >> 1) & 0x03
  if (layerBits === 0) return null // reserved
  const bitrateIdx = (b[o + 2] >> 4) & 0x0f
  if (bitrateIdx === 0 || bitrateIdx === 15) return null // free / invalid
  const srIdx = (b[o + 2] >> 2) & 0x03
  if (srIdx === 3) return null
  const padding = (b[o + 2] >> 1) & 0x01

  const sampleRate = SAMPLE_RATES[versionBits][srIdx]
  if (!sampleRate) return null

  const isV1 = versionBits === 3
  const layer = 4 - layerBits // 1, 2 or 3

  let bitrate: number
  if (isV1) {
    bitrate = (layer === 1 ? V1_L1 : layer === 2 ? V1_L2 : V1_L3)[bitrateIdx]
  } else {
    bitrate = (layer === 1 ? V2_L1 : V2_L23)[bitrateIdx]
  }
  if (!bitrate) return null
  bitrate *= 1000

  let samples: number
  if (layer === 1) samples = 384
  else if (layer === 2) samples = 1152
  else samples = isV1 ? 1152 : 576

  let size: number
  if (layer === 1) {
    size = (Math.floor((12 * bitrate) / sampleRate) + padding) * 4
  } else {
    size = Math.floor(((samples / 8) * bitrate) / sampleRate) + padding
  }
  if (size < 4) return null

  return { size, samples, sampleRate }
}

/** Total size of a leading ID3v2 tag (0 if none). */
function id3v2Size(b: Uint8Array): number {
  if (b.length < 10 || b[0] !== 0x49 || b[1] !== 0x44 || b[2] !== 0x33) return 0 // "ID3"
  // Syncsafe 28-bit size.
  const size = (b[6] << 21) | (b[7] << 14) | (b[8] << 7) | b[9]
  let total = 10 + size
  if (b[5] & 0x10) total += 10 // footer present
  return total
}

/**
 * Find the next byte offset (>= `from`) that begins a valid MP3 frame.
 * A candidate is accepted only if the frame after it also parses (or it is the
 * last frame) — this rejects false 0xFFE syncs inside frame payloads.
 */
function findSync(b: Uint8Array, from: number): number {
  for (let i = Math.max(0, from); i + 4 <= b.length; i++) {
    if (b[i] !== 0xff || (b[i + 1] & 0xe0) !== 0xe0) continue
    const fi = parseFrameHeader(b, i)
    if (!fi) continue
    if (i + fi.size + 4 > b.length || parseFrameHeader(b, i + fi.size) !== null) {
      return i
    }
  }
  return -1
}

/** True if the bytes look like an MP3 (and not some other container). */
export function looksLikeMp3(b: Uint8Array): boolean {
  if (b.length < 4) return false
  // Reject obvious other containers.
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46) return false // RIFF
  if (b[0] === 0x4f && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53) return false // OggS
  if (b[0] === 0x66 && b[1] === 0x4c && b[2] === 0x61 && b[3] === 0x43) return false // fLaC
  if (b.length >= 8 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    return false // ...ftyp (mp4/m4a)
  }
  // ID3v2 tag → MP3.
  if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) return true
  // Bare frame sync at the start.
  if (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) return parseFrameHeader(b, 0) !== null
  return false
}

/**
 * Walk the MP3 frames and group them into frame-aligned chunks of roughly
 * `chunkSec` seconds each. Each chunk's byte range is a valid decodable MP3
 * stream. Throws if no frames can be parsed.
 */
export function planMp3Chunks(b: Uint8Array, chunkSec = 30): Mp3Plan {
  let pos = findSync(b, id3v2Size(b))
  if (pos < 0) throw new Error("No MP3 frame sync found")

  const chunks: Mp3Chunk[] = []
  let totalDuration = 0
  let chunkStart = pos
  let chunkDur = 0
  let frameCount = 0

  while (pos + 4 <= b.length) {
    const fi = parseFrameHeader(b, pos)
    if (!fi) {
      // Lost alignment (garbage / tag in the middle) — resync forward.
      const next = findSync(b, pos + 1)
      if (next < 0) break
      // Close the current chunk at the gap so it stays frame-aligned.
      if (pos > chunkStart) {
        chunks.push({ byteStart: chunkStart, byteEnd: pos, durationSec: chunkDur })
        totalDuration += chunkDur
      }
      chunkStart = next
      chunkDur = 0
      pos = next
      continue
    }
    pos += fi.size
    chunkDur += fi.samples / fi.sampleRate
    frameCount++
    if (chunkDur >= chunkSec) {
      const byteEnd = Math.min(pos, b.length)
      chunks.push({ byteStart: chunkStart, byteEnd, durationSec: chunkDur })
      totalDuration += chunkDur
      chunkStart = byteEnd
      chunkDur = 0
    }
  }
  if (chunkDur > 0 && chunkStart < b.length) {
    chunks.push({ byteStart: chunkStart, byteEnd: b.length, durationSec: chunkDur })
    totalDuration += chunkDur
  }

  if (frameCount === 0 || chunks.length === 0) {
    throw new Error("No MP3 frames parsed")
  }
  return { chunks, totalDuration }
}
