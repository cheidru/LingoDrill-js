// hooks/useFragments.ts

import { useState, useEffect, useRef, useCallback } from "react"
import type { Fragment, AudioFileId } from "../../core/domain/types"
import { IndexedDBFragmentStorage } from "../../infrastructure/indexeddb/IndexedDBFragmentStorage"
import { nanoid } from "nanoid"

export function useFragments(audioId: AudioFileId | null) {
  const storageRef = useRef<IndexedDBFragmentStorage | null>(null)
  const [fragments, setFragments] = useState<Fragment[]>([])

  useEffect(() => {
    storageRef.current = new IndexedDBFragmentStorage()
    return () => { storageRef.current = null }
  }, [])

  useEffect(() => {
    if (!audioId || !storageRef.current) return
    const load = async () => {
      const all = await storageRef.current!.getAllByAudio(audioId)
      setFragments(all)
    }
    load()
  }, [audioId])

  const addFragment = useCallback(async (start: number, end: number) => {
    if (!audioId || !storageRef.current) return

    const fragment: Fragment = {
      id: nanoid(),
      audioId,
      start,
      end,
      repeat: 1,
      enabled: true,
    }

    await storageRef.current.save(fragment)
    setFragments(prev => [...prev, fragment])
  }, [audioId])

  const deleteFragment = useCallback(async (id: string) => {
    if (!storageRef.current) return
    await storageRef.current.delete(id)
    setFragments(prev => prev.filter(f => f.id !== id))
  }, [])

  const updateFragment = useCallback(async (fragment: Fragment) => {
    if (!storageRef.current) return
    await storageRef.current.update(fragment)
    setFragments(prev => prev.map(f => f.id === fragment.id ? fragment : f))
  }, [])

  return {
    fragments,
    addFragment,
    deleteFragment,
    updateFragment,
  }
}