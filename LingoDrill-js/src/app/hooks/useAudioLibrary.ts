// Библиотека аудиофайлов. Загрузка в базу, отображение сохраненных файлов

import { useEffect, useState } from "react"
import { IndexedDBAudioStorage } from "../../infrastructure/indexeddb/IndexedDBAudioStorage"
import type { AudioFile, AudioFileId } from "../../core/domain/types"

const storage = new IndexedDBAudioStorage()

interface UseAudioLibraryResult {
  files: AudioFile[]
  addFile: (file: File) => Promise<void>
  removeFile: (id: AudioFileId) => Promise<void>
  getBlob: (id: AudioFileId) => Promise<Blob>
}

export function useAudioLibrary(): UseAudioLibraryResult {
  const [files, setFiles] = useState<AudioFile[]>([])

  async function load() {
    const data = await storage.getAll()
    setFiles(data)
  }

  async function addFile(file: File) {
    await storage.save(file)
    await load()
  }

  async function removeFile(id: AudioFileId) {
    await storage.delete(id)
    await load()
  }

useEffect(() => {
  void (async () => {
    const data = await storage.getAll()
    setFiles(data)
  })()
}, [])

  return {
    files,
    addFile,
    removeFile,
    getBlob: storage.getBlob.bind(storage),
  }
}