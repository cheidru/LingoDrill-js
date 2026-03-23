// core/bundle/types.ts

/**
 * Формат бандла для передачи подготовленных данных с десктопа на мобильное устройство.
 *
 * Бандл — это JSON-файл (.lingodrill), содержащий:
 * - метаданные аудиофайла
 * - waveform (предвычисленный)
 * - все последовательности фрагментов
 * - субтитры
 * - аудио в формате base64 (опционально, можно передавать отдельно)
 */

import type { SequenceFragment } from "../domain/types"

export interface BundleSequence {
  id: string
  label: string
  fragments: SequenceFragment[]
  createdAt: number
}

export interface BundleSubtitleFile {
  id: string
  name: string
  content: string
  createdAt: number
}

export interface BundleManifest {
  version: 1
  exportedAt: number
  audio: {
    name: string
    mimeType: string
    size: number
    /** Если true — аудио включено в бандл как base64 в поле audioData */
    audioIncluded: boolean
  }
  waveform: number[]
  sequences: BundleSequence[]
  subtitleFiles: BundleSubtitleFile[]
}

export interface BundleFile {
  manifest: BundleManifest
  /** base64-encoded audio blob (если audioIncluded === true) */
  audioData?: string
}