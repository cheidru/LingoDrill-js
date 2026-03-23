// core/bundle/exportBundle.ts

import type { BundleFile, BundleManifest, BundleSequence, BundleSubtitleFile } from "./types"
import type { Sequence, SubtitleFile } from "../domain/types"

export interface ExportBundleInput {
  audioBlob: Blob
  audioName: string
  audioMimeType: string
  audioSize: number
  waveform: number[]
  sequences: Sequence[]
  subtitleFiles: SubtitleFile[]
  includeAudio: boolean
}

/**
 * Создаёт бандл-файл (.lingodrill) для передачи на мобильное устройство.
 * Возвращает Blob (application/json).
 */
export async function exportBundle(input: ExportBundleInput): Promise<Blob> {
  const bundleSequences: BundleSequence[] = input.sequences.map(s => ({
    id: s.id,
    label: s.label,
    fragments: s.fragments,
    createdAt: s.createdAt,
  }))

  const bundleSubtitles: BundleSubtitleFile[] = input.subtitleFiles.map(s => ({
    id: s.id,
    name: s.name,
    content: s.content,
    createdAt: s.createdAt,
  }))

  const manifest: BundleManifest = {
    version: 1,
    exportedAt: Date.now(),
    audio: {
      name: input.audioName,
      mimeType: input.audioMimeType,
      size: input.audioSize,
      audioIncluded: input.includeAudio,
    },
    waveform: input.waveform,
    sequences: bundleSequences,
    subtitleFiles: bundleSubtitles,
  }

  let audioData: string | undefined

  if (input.includeAudio) {
    const arrayBuffer = await input.audioBlob.arrayBuffer()
    audioData = arrayBufferToBase64(arrayBuffer)
  }

  const bundle: BundleFile = { manifest, audioData }

  const json = JSON.stringify(bundle)
  return new Blob([json], { type: "application/json" })
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ""
  const chunkSize = 8192
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}