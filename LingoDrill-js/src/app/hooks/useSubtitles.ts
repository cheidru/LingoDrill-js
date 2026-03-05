// hooks/useSubtitles.ts

import { useState, useEffect, useRef, useCallback } from "react"
import type { SubtitleFile, AudioFileId } from "../../core/domain/types"
import { IndexedDBSubtitleStorage } from "../../infrastructure/indexeddb/IndexedDBSubtitleStorage"
import { nanoid } from "nanoid"

export function useSubtitles(audioId: AudioFileId | null) {
  const storageRef = useRef<IndexedDBSubtitleStorage | null>(null)
  const [subtitleFiles, setSubtitleFiles] = useState<SubtitleFile[]>([])

  useEffect(() => {
    storageRef.current = new IndexedDBSubtitleStorage()
    return () => { storageRef.current = null }
  }, [])

  useEffect(() => {
    if (!audioId || !storageRef.current) {
      setSubtitleFiles([])
      return
    }
    const load = async () => {
      const all = await storageRef.current!.getAllByAudio(audioId)
      setSubtitleFiles(all)
    }
    load()
  }, [audioId])

  const addSubtitleFile = useCallback(async (file: File): Promise<SubtitleFile | null> => {
    if (!audioId || !storageRef.current) return null

    const content = await file.text()
    const sub: SubtitleFile = {
      id: nanoid(),
      audioId,
      name: file.name,
      content,
      createdAt: Date.now(),
    }

    await storageRef.current.save(sub)
    setSubtitleFiles(prev => [...prev, sub])
    return sub
  }, [audioId])

  const deleteSubtitleFile = useCallback(async (id: string) => {
    if (!storageRef.current) return
    await storageRef.current.delete(id)
    setSubtitleFiles(prev => prev.filter(s => s.id !== id))
  }, [])

  const getSubtitleFile = useCallback(async (id: string): Promise<SubtitleFile | undefined> => {
    if (!storageRef.current) return undefined
    return storageRef.current.get(id)
  }, [])

  return {
    subtitleFiles,
    addSubtitleFile,
    deleteSubtitleFile,
    getSubtitleFile,
  }
}