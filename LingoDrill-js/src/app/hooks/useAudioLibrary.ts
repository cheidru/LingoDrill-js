// hooks/useAudioLibrary.ts

import { useState, useCallback, useEffect, useRef } from "react"
import { IndexedDBAudioStorage } from "../../infrastructure/indexeddb/IndexedDBAudioStorage"

export interface AudioFile {
  id: string
  name: string
  /**
   * Id of the file this one was produced from (trim silence / normalize /
   * maximize). Set means it is not an upload of its own: the Audio Library
   * filters these out, and they are deleted with their source.
   */
  derivedFrom?: string
}

export function useAudioLibrary() {
  const storageRef = useRef<IndexedDBAudioStorage | null>(null)

  const [files, setFiles] = useState<AudioFile[]>([])
  const [selectedFile, setSelectedFile] = useState<AudioFile | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // создаём storage один раз
  useEffect(() => {
    storageRef.current = new IndexedDBAudioStorage()

    return () => {
      storageRef.current = null
    }
  }, [])

  // 🔥 Загружаем список файлов при старте приложения
  useEffect(() => {
    const loadFiles = async () => {
      if (!storageRef.current) return

      try {
        setIsLoading(true)
        const storedFiles = await storageRef.current.getAll()
        setFiles(storedFiles.map(f => ({ id: f.id, name: f.name, derivedFrom: f.derivedFrom })))
      } catch {
        setError("Failed to load audio library")
      } finally {
        setIsLoading(false)
      }
    }

    loadFiles()
  }, [])

  // ➜ Сохранение в IndexedDB
  // Accepts an optional id parameter so callers can control the file ID
  // Returns the id of the saved file
  // derivedFrom — файл создан обработкой другого файла (см. AudioFile)
  const addFile = useCallback(async (file: File, id?: string, derivedFrom?: string): Promise<void> => {
    if (!storageRef.current) return

    try {
      setIsLoading(true)
      setError(null)

      const fileId = id ?? crypto.randomUUID()
      const savedFile = await storageRef.current.save(file, fileId, derivedFrom)
      setFiles(prev => [...prev, { id: savedFile.id, name: savedFile.name, derivedFrom: savedFile.derivedFrom }])
    } catch {
      setError("Failed to upload file")
    } finally {
      setIsLoading(false)
    }
  }, [])

  // ➜ Удаление из IndexedDB
  const removeFile = useCallback(async (id: string) => {
    if (!storageRef.current) return
    const storage = storageRef.current

    /* Processed copies go with their source. Nothing can reach them once it is
       deleted — they are hidden from the library and only sequences of the
       source file point at them — so leaving them behind would just park
       multi-megabyte blobs in the user's storage forever. */
    const all = await storage.getAll()
    const ids = [id, ...all.filter(f => f.derivedFrom === id).map(f => f.id)]

    const { WaveformCacheStorage } = await import("../../infrastructure/indexeddb/waveformCacheStorage")
    const waveformCache = new WaveformCacheStorage()

    for (const fileId of ids) {
      await storage.delete(fileId)
      await waveformCache.delete(fileId)
    }

    setFiles(prev => prev.filter(f => !ids.includes(f.id)))

    // если удалён активный файл — сбрасываем выбор
    setSelectedFile(prev => (prev && ids.includes(prev.id) ? null : prev))
  }, [])

  // 🔥 ИСПРАВЛЕНО: теперь принимает string | null
  const selectFile = useCallback(
    (id: string | null) => {
      if (id === null) {
        setSelectedFile(null)
        return
      }

      const file = files.find(f => f.id === id) ?? null
      setSelectedFile(file)
    },
    [files]
  )

  // ➜ Получение Blob для AudioEngine
  const getBlob = useCallback(async (id: string) => {
    if (!storageRef.current) return null
    return await storageRef.current.getBlob(id)
  }, [])

  return {
    files,
    selectedFile,
    isLoading,
    error,
    addFile,
    removeFile,
    selectFile,
    getBlob,
  }
}