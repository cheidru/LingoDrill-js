// Библиотека аудиофайлов. Загрузка в базу, отображение сохраненных файлов

import { useEffect, useState, useCallback } from "react"
import { IndexedDBAudioStorage } from "../../infrastructure/indexeddb/IndexedDBAudioStorage"
import type { AudioFile, AudioFileId } from "../../core/domain/types"

const storage = new IndexedDBAudioStorage()

interface UseAudioLibrary {
  files: AudioFile[]
  addFile: (file: File) => Promise<void>
  removeFile: (id: AudioFileId) => Promise<void>
  getBlob: (id: AudioFileId) => Promise<Blob>

  selectFile: (id: AudioFileId) => void
  selectedFile: AudioFile | null
  isLoading: boolean
  error: string | null
}

export function useAudioLibrary(): UseAudioLibrary {
  const [files, setFiles] = useState<AudioFile[]>([])
  const [selectedId, setSelectedId] = useState<AudioFileId | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const data = await storage.getAll()
      setFiles(data)

      if (!selectedId && data.length > 0) {
      setSelectedId(data[0].id)
      }
    } catch {
            setError("Failed to load audio library")
    } finally {
      setIsLoading(false)
    }
  }, [selectedId])

  const addFile = async (file: File) => {
    try {
      setIsLoading(true)
      setError(null)

      const saved = await storage.save(file)
      setFiles(prev => [...prev, saved])

    } catch {
      setError("Failed to save file")
    } finally {
      setIsLoading(false)
    }
  }

  const removeFile = async (id: AudioFileId) => {
    try {
      setIsLoading(true)
      setError(null)
      await storage.delete(id)
      await load()

      if (selectedId === id) {
      setSelectedId(null)
      }
    } catch {
      setError("Failed to delete file")
    } finally {
      setIsLoading(false)
    }
  }

  const selectFile = (id: AudioFileId) => {
    setSelectedId(id)
  }

  useEffect(() => {
    void load()
  }, [load])

  const selectedFile =
    files.find(f => f.id === selectedId) ?? null

  return {
    files,
    selectedFile,
    isLoading,
    error,
    addFile,
    removeFile,
    selectFile,
    getBlob: (id) => storage.getBlob(id),
  }
}