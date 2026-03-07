// utils/detectSpeech.ts

export interface SpeechSegment {
  start: number  // в секундах
  end: number    // в секундах
}

// Типы для глобальных объектов загружаемых из CDN
interface VadGlobal {
  NonRealTimeVAD: {
    new: (options: Record<string, unknown>) => Promise<{
      run: (audio: Float32Array, sampleRate: number) => AsyncIterable<{ audio: Float32Array; start: number; end: number }>
    }>
  }
}

declare global {
  interface Window {
    ort?: unknown
    vad?: VadGlobal
  }
}

// Загружаем VAD скрипты из CDN динамически
let vadLoaded = false

async function ensureVadLoaded(): Promise<void> {
  if (vadLoaded) return

  if (!window.ort) {
    await loadScript("https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/ort.wasm.min.js")
  }

  if (!window.vad) {
    await loadScript("https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.29/dist/bundle.min.js")
  }

  vadLoaded = true
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script")
    script.src = src
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`))
    document.head.appendChild(script)
  })
}

/**
 * Определяет фрагменты с речью в аудиобуфере через Silero VAD.
 */
export async function detectSpeechSegments(
  audioBuffer: AudioBuffer,
  onProgress?: (progress: number) => void,
): Promise<SpeechSegment[]> {
  await ensureVadLoaded()

  if (!window.vad?.NonRealTimeVAD) {
    throw new Error("VAD library not loaded")
  }

  const channelData = audioBuffer.getChannelData(0)
  const sampleRate = audioBuffer.sampleRate

  const detector = await window.vad.NonRealTimeVAD.new({
    positiveSpeechThreshold: 0.5,
    negativeSpeechThreshold: 0.35,
    minSpeechMs: 100,
    preSpeechPadMs: 30,
    redemptionMs: 250,
    onnxWASMBasePath: "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/",
    baseAssetPath: "https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.29/dist/",
  })

  const segments: SpeechSegment[] = []
  const totalSamples = channelData.length

  for await (const { start, end } of detector.run(channelData, sampleRate)) {
    segments.push({
      start: start / 1000,
      end: end / 1000,
    })

    const processedSamples = Math.min((end / 1000) * sampleRate, totalSamples)
    if (onProgress) {
      onProgress(processedSamples / totalSamples)
    }
  }

  if (onProgress) {
    onProgress(1)
  }

  return segments
}