// infrastructure/audio/decodeWav.ts
//
// Manual WAV (RIFF/PCM) decoder.
//
// WHY: AudioContext.decodeAudioData() is far stricter than HTMLAudioElement
// playback and rejects some perfectly valid WAV files with
// "EncodingError: Unable to decode audio data" — e.g. files with extra RIFF
// chunks (LIST/fact/cue), 24-bit samples, or WAVE_FORMAT_EXTENSIBLE headers.
// WAV is a trivial uncompressed container, so we parse it ourselves and fill
// the AudioBuffer directly, bypassing decodeAudioData entirely.
//
// Supported sample formats: 8-bit unsigned PCM, 16/24/32-bit signed PCM,
// 32/64-bit IEEE float, and WAVE_FORMAT_EXTENSIBLE wrapping any of those.

const WAVE_FORMAT_PCM = 1
const WAVE_FORMAT_IEEE_FLOAT = 3
const WAVE_FORMAT_EXTENSIBLE = 0xfffe

export interface WavInfo {
  /** Resolved audio format: 1 = integer PCM, 3 = IEEE float. */
  format: number
  numChannels: number
  sampleRate: number
  bitsPerSample: number
  /** Byte offset of the first PCM sample. */
  dataOffset: number
  /** Number of sample frames available in the data chunk. */
  frameCount: number
}

/** True if the bytes begin with a RIFF/WAVE signature. */
export function isWavSignature(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && // "RIFF"
    bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45  // "WAVE"
  )
}

/**
 * Parse the RIFF chunk list and fmt header. Throws a descriptive Error when
 * the buffer is not a WAV we can decode — the caller should then fall back to
 * the browser decoder.
 *
 * `fileBytes` is the size of the whole file, which differs from
 * `arrayBuffer.byteLength` when only a head-of-file probe was read (see
 * streamAudioChunks). It is used solely to clamp a bogus declared data-chunk
 * size; without it a probe would report a frame count covering just the probe.
 */
export function parseWavHeader(
  arrayBuffer: ArrayBuffer,
  fileBytes: number = arrayBuffer.byteLength,
): WavInfo {
  const bytes = new Uint8Array(arrayBuffer)
  if (!isWavSignature(bytes)) {
    throw new Error("Not a RIFF/WAVE file")
  }

  const view = new DataView(arrayBuffer)
  const total = arrayBuffer.byteLength

  let fmtOffset = -1
  let fmtSize = 0
  let dataOffset = -1
  let dataSize = 0

  // Walk chunks: 4-byte id + 4-byte LE size + body (word-aligned).
  let offset = 12
  while (offset + 8 <= total) {
    const id = String.fromCharCode(
      bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3],
    )
    const size = view.getUint32(offset + 4, true)
    const body = offset + 8

    if (id === "fmt ") {
      fmtOffset = body
      fmtSize = size
    } else if (id === "data") {
      dataOffset = body
      // The declared size may be a placeholder (0 / 0xFFFFFFFF / too large) —
      // clamp to the bytes the file actually holds.
      dataSize = Math.min(size, fileBytes - body)
    }

    if (fmtOffset >= 0 && dataOffset >= 0) break
    offset = body + size + (size & 1) // odd-sized chunks carry a pad byte
  }

  if (fmtOffset < 0) throw new Error("WAV: missing fmt chunk")
  if (dataOffset < 0) throw new Error("WAV: missing data chunk")

  let format = view.getUint16(fmtOffset, true)
  const numChannels = view.getUint16(fmtOffset + 2, true)
  const sampleRate = view.getUint32(fmtOffset + 4, true)
  const bitsPerSample = view.getUint16(fmtOffset + 14, true)

  // WAVE_FORMAT_EXTENSIBLE — the real format lives in the SubFormat GUID.
  if (format === WAVE_FORMAT_EXTENSIBLE && fmtSize >= 40) {
    format = view.getUint16(fmtOffset + 24, true)
  }

  if (format !== WAVE_FORMAT_PCM && format !== WAVE_FORMAT_IEEE_FLOAT) {
    throw new Error(
      `WAV: unsupported audio format 0x${format.toString(16)} ` +
      `(only uncompressed PCM and IEEE float are supported)`
    )
  }
  if (numChannels < 1) throw new Error("WAV: invalid channel count")
  if (sampleRate < 1) throw new Error("WAV: invalid sample rate")

  const bytesPerSample = bitsPerSample >> 3
  if (bytesPerSample < 1) throw new Error(`WAV: unsupported bit depth ${bitsPerSample}`)

  const frameCount = Math.floor(dataSize / (bytesPerSample * numChannels))
  if (frameCount < 1) throw new Error("WAV: no audio frames")

  return { format, numChannels, sampleRate, bitsPerSample, dataOffset, frameCount }
}

/**
 * Convert WAV PCM into per-channel Float32 data, writing into `targets`.
 *
 * `decimation` >= 1 keeps every Nth frame — used to downsample very long files
 * so the resulting AudioBuffer stays under the browser's frame-count cap.
 * Each target array must hold at least `ceil(frameCount / decimation)` samples.
 */
export function readWavSamples(
  arrayBuffer: ArrayBuffer,
  info: WavInfo,
  targets: Float32Array[],
  decimation = 1,
): void {
  const { numChannels, bitsPerSample, dataOffset, frameCount, format } = info
  const step = Math.max(1, Math.floor(decimation))
  const outLength = Math.ceil(frameCount / step)
  const bytesPerSample = bitsPerSample >> 3
  const frameBytes = bytesPerSample * numChannels

  // Fast path: 16-bit integer PCM (by far the most common WAV) via Int16Array.
  // The data chunk is always word-aligned, so the 2-byte alignment holds.
  if (format === WAVE_FORMAT_PCM && bitsPerSample === 16) {
    const pcm = new Int16Array(arrayBuffer, dataOffset, frameCount * numChannels)
    for (let ch = 0; ch < numChannels; ch++) {
      const out = targets[ch]
      for (let i = 0; i < outLength; i++) {
        out[i] = pcm[i * step * numChannels + ch] / 32768
      }
    }
    return
  }

  // General path: DataView — handles 8/24/32-bit PCM and 32/64-bit float.
  const view = new DataView(arrayBuffer)
  for (let ch = 0; ch < numChannels; ch++) {
    const out = targets[ch]
    for (let i = 0; i < outLength; i++) {
      const p = dataOffset + i * step * frameBytes + ch * bytesPerSample
      let sample: number
      if (format === WAVE_FORMAT_IEEE_FLOAT) {
        sample = bitsPerSample === 64 ? view.getFloat64(p, true) : view.getFloat32(p, true)
      } else {
        switch (bitsPerSample) {
          case 8:
            sample = (view.getUint8(p) - 128) / 128
            break
          case 24: {
            let v = view.getUint8(p) | (view.getUint8(p + 1) << 8) | (view.getUint8(p + 2) << 16)
            if (v & 0x800000) v -= 0x1000000 // sign-extend
            sample = v / 8388608
            break
          }
          case 32:
            sample = view.getInt32(p, true) / 2147483648
            break
          default:
            throw new Error(`WAV: unsupported PCM bit depth ${bitsPerSample}`)
        }
      }
      out[i] = sample
    }
  }
}
