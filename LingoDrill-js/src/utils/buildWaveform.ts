// utils/buildWaveform.ts
//
// ИСПРАВЛЕНИЕ: buildWaveform теперь АСИНХРОННАЯ с yield между блоками.
//
// ПРОБЛЕМА:
// На мобильных устройствах синхронный цикл по channelData (до ~130M samples)
// блокирует main thread на секунды. iOS Safari и Android Chrome имеют
// watchdog-таймер (~10-15 сек), который УБИВАЕТ вкладку при длительной блокировке.
// Это происходит на уровне ОС/браузера — ни один JS error handler, Error Boundary
// или window.onerror не может это перехватить. Вкладка просто исчезает.
//
// РЕШЕНИЕ:
// 1. buildWaveform() теперь async — обрабатывает данные блоками по ~50000 samples
//    и вызывает yieldToMain() между блоками, отдавая управление event loop.
// 2. Старая синхронная версия сохранена как buildWaveformSync() для случаев,
//    когда данных мало (< 500K samples) и yield не нужен.
// 3. Добавлен AbortSignal для возможности отмены.

const YIELD_EVERY_SAMPLES = 50_000
const SYNC_THRESHOLD = 500_000

/** Yield to event loop — даёт браузеру обработать UI и предотвращает watchdog kill */
function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/**
 * Строит нормализованный RMS waveform из AudioBuffer.
 * ASYNC — yields между блоками для предотвращения зависания UI.
 *
 * @param buffer - декодированный AudioBuffer
 * @param samples - количество точек waveform
 * @param signal - опциональный AbortSignal для отмены
 * @returns массив значений 0..1
 */
export async function buildWaveform(
  buffer: AudioBuffer,
  samples = 1000,
  signal?: AbortSignal,
): Promise<number[]> {
  if (samples <= 0) {
    throw new Error("samples must be > 0")
  }

  const channelData = buffer.getChannelData(0)
  const totalSamples = channelData.length

  if (totalSamples === 0) {
    return new Array(samples).fill(0)
  }

  // Для маленьких буферов — синхронный путь (быстрее, нет overhead)
  if (totalSamples < SYNC_THRESHOLD) {
    return buildWaveformSync(channelData, totalSamples, samples)
  }

  const blockSize = Math.floor(totalSamples / samples)

  if (blockSize === 0) {
    return new Array(samples).fill(0)
  }

  const waveform: number[] = new Array(samples)
  let max = 0
  let samplesProcessed = 0

  for (let i = 0; i < samples; i++) {
    if (signal?.aborted) {
      throw new DOMException("Waveform build aborted", "AbortError")
    }

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

    // Yield каждые YIELD_EVERY_SAMPLES обработанных PCM samples
    samplesProcessed += blockSize
    if (samplesProcessed >= YIELD_EVERY_SAMPLES) {
      samplesProcessed = 0
      await yieldToMain()
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

/**
 * Синхронная версия для маленьких буферов (< SYNC_THRESHOLD samples).
 * Не блокирует main thread надолго.
 */
function buildWaveformSync(
  channelData: Float32Array,
  totalSamples: number,
  samples: number,
): number[] {
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

  if (max > 0) {
    for (let i = 0; i < waveform.length; i++) {
      waveform[i] = waveform[i] / max
    }
  }

  return waveform
}