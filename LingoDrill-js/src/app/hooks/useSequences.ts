// hooks/useSequences.ts

import { useState, useEffect, useRef, useCallback } from "react"
import type { Sequence, SequenceFragment, AudioFileId, ProcessedOp } from "../../core/domain/types"
import { IndexedDBSequenceStorage } from "../../infrastructure/indexeddb/IndexedDBSequenceStorage"
import { nanoid } from "nanoid"

export function useSequences(audioId: AudioFileId | null) {
  const storageRef = useRef<IndexedDBSequenceStorage | null>(null)
  const [sequences, setSequences] = useState<Sequence[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    storageRef.current = new IndexedDBSequenceStorage()
    return () => { storageRef.current = null }
  }, [])

  useEffect(() => {
    if (!audioId || !storageRef.current) return
    let cancelled = false
    const load = async () => {
      setIsLoading(true)
      const all = await storageRef.current!.getAllByAudio(audioId)
      if (!cancelled) {
        setSequences(all)
        setIsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [audioId])

  /**
   * `processed` binds the new sequence to a processed copy of the audio right
   * away — used when trim silence runs on a file that had no sequence yet, so
   * the result still lands in this file's list rather than somewhere else.
   * Its `ops` records the processing steps behind that copy.
   */
  const addSequence = useCallback(async (
    fragments: SequenceFragment[],
    processed?: { audioId: AudioFileId; duration: number; ops: ProcessedOp[] },
  ): Promise<Sequence | null> => {
    if (!audioId || !storageRef.current) return null

    const label = await storageRef.current.getNextLabel(audioId)

    const sequence: Sequence = {
      id: nanoid(),
      audioId,
      label,
      fragments,
      createdAt: Date.now(),
      ...(processed
        ? {
            processedAudioId: processed.audioId,
            processedDuration: processed.duration,
            processedOps: processed.ops,
          }
        : {}),
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