// hooks/useSequences.ts

import { useState, useEffect, useRef, useCallback } from "react"
import type { Sequence, SequenceFragment, AudioFileId } from "../../core/domain/types"
import { IndexedDBSequenceStorage } from "../../infrastructure/indexeddb/IndexedDBSequenceStorage"
import { nanoid } from "nanoid"

export function useSequences(audioId: AudioFileId | null) {
  const storageRef = useRef<IndexedDBSequenceStorage | null>(null)
  const [sequences, setSequences] = useState<Sequence[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    storageRef.current = new IndexedDBSequenceStorage()
    return () => { storageRef.current = null }
  }, [])

  useEffect(() => {
    if (!audioId || !storageRef.current) {
      setSequences([])
      setIsLoading(false)
      return
    }
    const load = async () => {
      setIsLoading(true)
      const all = await storageRef.current!.getAllByAudio(audioId)
      setSequences(all)
      setIsLoading(false)
    }
    load()
  }, [audioId])

  const addSequence = useCallback(async (fragments: SequenceFragment[]): Promise<Sequence | null> => {
    if (!audioId || !storageRef.current) return null

    const label = await storageRef.current.getNextLabel(audioId)

    const sequence: Sequence = {
      id: nanoid(),
      audioId,
      label,
      fragments,
      createdAt: Date.now(),
    }

    await storageRef.current.save(sequence)
    setSequences(prev => [...prev, sequence])
    return sequence
  }, [audioId])

  const deleteSequence = useCallback(async (id: string) => {
    if (!storageRef.current) return
    await storageRef.current.delete(id)
    setSequences(prev => prev.filter(s => s.id !== id))
  }, [])

  const updateSequence = useCallback(async (sequence: Sequence) => {
    if (!storageRef.current) return
    await storageRef.current.update(sequence)
    setSequences(prev => prev.map(s => s.id === sequence.id ? sequence : s))
  }, [])

  return {
    sequences,
    isLoading,
    addSequence,
    deleteSequence,
    updateSequence,
  }
}