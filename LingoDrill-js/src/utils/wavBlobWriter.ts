// utils/wavBlobWriter.ts
//
// Build a 16-bit PCM WAV incrementally, one piece at a time.
//
// WHY NOT ONE ArrayBuffer: the old encodeWav() in trimSilence/normalizeFragments
// allocated the entire output up front — 1.6 GB for 2.5 hours of 44.1 kHz
// stereo, on top of the fully decoded input it was reading from. Browsers
// refuse allocations that size long before they run out of RAM.
//
// Each append is converted to interleaved int16 immediately and kept as its own
// buffer; the finished Blob is assembled from those pieces plus a header. Blob
// parts are managed by the browser's blob store (spilling to disk when large),
// so peak JS heap stays at one chunk regardless of how long the file is.

/** Header size of a canonical 44-byte RIFF/WAVE PCM file. */
const HEADER_BYTES = 44

/** RIFF sizes are unsigned 32-bit, so the data chunk cannot exceed this. */
const MAX_DATA_BYTES = 0xffffffff - HEADER_BYTES

/**
 * Typed arrays use the platform's byte order, while WAV is always
 * little-endian. Every browser this runs on is little-endian, so the fast path
 * is what actually executes — the check just keeps the output correct if that
 * ever stops being true.
 */
const PLATFORM_IS_LITTLE_ENDIAN = (() => {
  const probe = new ArrayBuffer(2)
  new DataView(probe).setInt16(0, 1, true)
  return new Int16Array(probe)[0] === 1
})()

export class WavBlobWriter {
  private readonly parts: ArrayBuffer[] = []
  private readonly numChannels: number
  private readonly sampleRate: number
  private frames = 0

  constructor(numChannels: number, sampleRate: number) {
    if (numChannels < 1) throw new Error("WavBlobWriter: need at least one channel")
    if (sampleRate < 1) throw new Error("WavBlobWriter: invalid sample rate")
    this.numChannels = numChannels
    this.sampleRate = sampleRate
  }

  /** Frames written so far. */
  get frameCount(): number {
    return this.frames
  }

  /**
   * Append `length` frames taken from each channel array starting at `offset`.
   * Samples are clamped to [-1, 1].
   */
  append(channels: Float32Array[], offset: number, length: number): void {
    if (length <= 0) return

    const { numChannels } = this
    const buffer = new ArrayBuffer(length * numChannels * 2)

    if (PLATFORM_IS_LITTLE_ENDIAN) {
      const out = new Int16Array(buffer)
      let o = 0
      for (let i = 0; i < length; i++) {
        for (let ch = 0; ch < numChannels; ch++) {
          out[o++] = toInt16(channels[ch][offset + i])
        }
      }
    } else {
      const view = new DataView(buffer)
      let o = 0
      for (let i = 0; i < length; i++) {
        for (let ch = 0; ch < numChannels; ch++) {
          view.setInt16(o, toInt16(channels[ch][offset + i]), true)
          o += 2
        }
      }
    }

    this.parts.push(buffer)
    this.frames += length
  }

  /** Append `length` frames of silence. */
  appendSilence(length: number): void {
    if (length <= 0) return
    this.parts.push(new ArrayBuffer(length * this.numChannels * 2))
    this.frames += length
  }

  /** Assemble the finished WAV. The writer must not be appended to afterwards. */
  finish(): Blob {
    const dataSize = this.frames * this.numChannels * 2
    if (dataSize > MAX_DATA_BYTES) {
      throw new Error(
        "Result is too large for a WAV file (over 4 GB). Please split the audio file.",
      )
    }

    const header = new ArrayBuffer(HEADER_BYTES)
    const view = new DataView(header)
    const byteRate = this.sampleRate * this.numChannels * 2

    writeString(view, 0, "RIFF")
    view.setUint32(4, 36 + dataSize, true)
    writeString(view, 8, "WAVE")

    writeString(view, 12, "fmt ")
    view.setUint32(16, 16, true) // chunk size
    view.setUint16(20, 1, true) // PCM
    view.setUint16(22, this.numChannels, true)
    view.setUint32(24, this.sampleRate, true)
    view.setUint32(28, byteRate, true)
    view.setUint16(32, this.numChannels * 2, true) // block align
    view.setUint16(34, 16, true) // bits per sample

    writeString(view, 36, "data")
    view.setUint32(40, dataSize, true)

    return new Blob([header, ...this.parts], { type: "audio/wav" })
  }
}

function toInt16(sample: number): number {
  const s = sample < -1 ? -1 : sample > 1 ? 1 : sample
  return s < 0 ? s * 0x8000 : s * 0x7fff
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i))
  }
}
