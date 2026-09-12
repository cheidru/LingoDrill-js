import { useState, useEffect, useRef, useCallback } from "react"
import type { VocabularyFile, AudioFileId } from "../../core/domain/types"
import { IndexedDBVocabularyStorage } from "../../infrastructure/indexeddb/IndexedDBVocabularyStorage"
import { nanoid } from "nanoid"

export function useVocabularies(audioId: AudioFileId | null) {
  const storageRef = useRef<IndexedDBVocabularyStorage | null>(null)
  const [vocabularyFiles, setVocabularyFiles] = useState<VocabularyFile[]>([])

  useEffect(() => {
    storageRef.current = new IndexedDBVocabularyStorage()
    return () => { storageRef.current = null }
  }, [])

  useEffect(() => {
    if (!audioId || !storageRef.current) return
    let cancelled = false
    const load = async () => {
      const all = await storageRef.current!.getAllByAudio(audioId)
      if (!cancelled) setVocabularyFiles(all)
    }
    load()
    return () => { cancelled = true }
  }, [audioId])

  const addVocabularyFile = useCallback(async (file: File): Promise<VocabularyFile | null> => {
    if (!audioId || !storageRef.current) return null

    const content = await file.text()
    const vocab: VocabularyFile = {
      id: nanoid(),
      audioId,
      name: file.name,
      content,
      createdAt: Date.now(),
    }

    await storageRef.current.save(vocab)
    setVocabularyFiles(prev => [...prev, vocab])
    return vocab
  }, [audioId])

  /**
   * Replaces the text of a vocabulary file. As with subtitles, fragment
   * bindings are character offsets into this string, so the caller re-bases
   * them across the same edit.
   */
  const updateVocabularyContent = useCallback(async (id: string, content: string): Promise<VocabularyFile | null> => {
    if (!storageRef.current) return null
    const existing = await storageRef.current.get(id)
    if (!existing) return null

    const updated: VocabularyFile = { ...existing, content }
    await storageRef.current.save(updated)
    setVocabularyFiles(prev => prev.map(v => v.id === id ? updated : v))
    return updated
  }, [])

  const deleteVocabularyFile = useCallback(async (id: string) => {
    if (!storageRef.current) return
    await storageRef.current.delete(id)
    setVocabularyFiles(prev => prev.filter(v => v.id !== id))
  }, [])

  const getVocabularyFile = useCallback(async (id: string): Promise<VocabularyFile | undefined> => {
    if (!storageRef.current) return undefined
    return storageRef.current.get(id)
  }, [])

  return {
    vocabularyFiles,
    addVocabularyFile,
    updateVocabularyContent,
    deleteVocabularyFile,
    getVocabularyFile,
  }
}
