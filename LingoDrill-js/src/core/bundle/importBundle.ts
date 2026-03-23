// core/bundle/importBundle.ts

import type { BundleFile } from "./types"
import type { Sequence, SubtitleFile } from "../domain/types"
import { IndexedDBAudioStorage } from "../../infrastructure/indexeddb/IndexedDBAudioStorage"
import { IndexedDBSequenceStorage } from "../../infrastructure/indexeddb/IndexedDBSequenceStorage"
import { IndexedDBSubtitleStorage } from "../../infrastructure/indexeddb/IndexedDBSubtitleStorage"
import { WaveformCacheStorage } from "../../infrastructure/indexeddb/waveformCacheStorage"

export interface ImportResult {
  audioId: string
  audioName: string
  sequenceCount: number
  subtitleCount: number
  waveformLoaded: boolean
  audioImported: boolean
}

/**
 * Импортирует бандл (.lingodrill) в приложение.
 * Если бандл включает аудио — сохраняет его в IndexedDB.
 * Если нет — аудиофайл нужно загрузить отдельно.
 *
 * @param bundleBlob - файл .lingodrill
 * @param separateAudioFile - отдельный аудиофайл (если аудио не включено в бандл)
 */
export async function importBundle(
  bundleBlob: Blob,
  separateAudioFile?: File,
): Promise<ImportResult> {
  const text = await bundleBlob.text()
  let bundle: BundleFile

  try {
    bundle = JSON.parse(text)
  } catch {
    throw new Error("Invalid bundle file: could not parse JSON")
  }

  const { manifest } = bundle

  if (!manifest || manifest.version !== 1) {
    throw new Error("Unsupported bundle version")
  }

  // 1. Сохраняем аудиофайл
  const audioStorage = new IndexedDBAudioStorage()
  const audioId = crypto.randomUUID()
  let audioImported = false

  if (manifest.audio.audioIncluded && bundle.audioData) {
    // Аудио включено в бандл
    const audioBlob = base64ToBlob(bundle.audioData, manifest.audio.mimeType)
    const audioFile = new File([audioBlob], manifest.audio.name, {
      type: manifest.audio.mimeType,
    })
    await audioStorage.save(audioFile, audioId)
    audioImported = true
  } else if (separateAudioFile) {
    // Аудио передано отдельным файлом
    await audioStorage.save(separateAudioFile, audioId)
    audioImported = true
  }
  // Если аудио не включено и не передано отдельно — метаданные всё равно создаём,
  // но воспроизведение не будет работать до загрузки аудио

  // 2. Сохраняем waveform в кеш
  let waveformLoaded = false
  if (manifest.waveform && manifest.waveform.length > 0) {
    const waveformCache = new WaveformCacheStorage()
    await waveformCache.save(audioId, manifest.waveform)
    waveformLoaded = true
  }

  // 3. Сохраняем последовательности
  const seqStorage = new IndexedDBSequenceStorage()
  for (const seq of manifest.sequences) {
    const sequence: Sequence = {
      id: seq.id,
      audioId,
      label: seq.label,
      fragments: seq.fragments,
      createdAt: seq.createdAt,
    }
    await seqStorage.save(sequence)
  }

  // 4. Сохраняем субтитры
  const subStorage = new IndexedDBSubtitleStorage()
  for (const sub of manifest.subtitleFiles) {
    const subtitleFile: SubtitleFile = {
      id: sub.id,
      audioId,
      name: sub.name,
      content: sub.content,
      createdAt: sub.createdAt,
    }
    await subStorage.save(subtitleFile)
  }

  return {
    audioId,
    audioName: manifest.audio.name,
    sequenceCount: manifest.sequences.length,
    subtitleCount: manifest.subtitleFiles.length,
    waveformLoaded,
    audioImported,
  }
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new Blob([bytes], { type: mimeType })
}