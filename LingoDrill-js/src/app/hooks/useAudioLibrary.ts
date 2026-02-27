import { useState, useCallback, useEffect, useRef } from "react"
import { IndexedDBAudioStorage } from "../../infrastructure/indexeddb/IndexedDBAudioStorage"

export interface AudioFile {
  id: string
  name: string
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
        setFiles(storedFiles)
      } catch {
        setError("Failed to load audio library")
      } finally {
        setIsLoading(false)
      }
    }

    loadFiles()
  }, [])

  // ➜ Сохранение в IndexedDB
  const addFile = useCallback(async (file: File) => {
    if (!storageRef.current) return

    try {
      setIsLoading(true)
      setError(null)

      const id = crypto.randomUUID()

      await storageRef.current.save(file, id)
      const savedFile = await storageRef.current.save(file, id)
      setFiles(prev => [...prev, { id: savedFile.id, name: savedFile.name }])
    } catch {
      setError("Failed to upload file")
    } finally {
      setIsLoading(false)
    }
  }, [])

  // ➜ Удаление из IndexedDB
  const removeFile = useCallback(async (id: string) => {
    if (!storageRef.current) return

    await storageRef.current.delete(id)

    setFiles(prev => prev.filter(f => f.id !== id))

    // если удалён активный файл — сбрасываем выбор
    setSelectedFile(prev => (prev?.id === id ? null : prev))
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