// infrastructure/indexeddb/renderedSequenceStore.ts
//
// Cache of MP3-rendered sequences for background-listening mode (see
// useBackgroundPlayback). Keyed by sequence id. The stored hash captures all
// inputs that affect rendered output — if any of them changes (audio swap, a
// fragment edit, the global fragment gap, the trailing-pause constant), the
// hash mismatches and we re-render on next entry into background mode.

import { dbPromise } from "./db"
import type { FragmentOffset } from "../../core/audio/renderSequence"

const STORE = "renderedSequenceCache"

export interface RenderedSequenceEntry {
  hash: string
  mp3Blob: Blob
  fragmentOffsets: FragmentOffset[]
  durationSec: number
  createdAt: number
}

function isEntry(x: unknown): x is RenderedSequenceEntry {
  if (!x || typeof x !== "object") return false
  const e = x as RenderedSequenceEntry
  return (
    typeof e.hash === "string" &&
    e.mp3Blob instanceof Blob &&
    Array.isArray(e.fragmentOffsets) &&
    typeof e.durationSec === "number" &&
    typeof e.createdAt === "number"
  )
}

export class RenderedSequenceStore {
  /** Returns the cached entry only if its stored hash matches `expectedHash`. */
  async get(sequenceId: string, expectedHash: string): Promise<RenderedSequenceEntry | null> {
    const db = await dbPromise
    const raw = await db.get(STORE, sequenceId)
    if (!isEntry(raw)) {
      if (raw !== undefined) await db.delete(STORE, sequenceId)
      return null
    }
    if (raw.hash !== expectedHash) return null
    return raw
  }

  async save(sequenceId: string, entry: RenderedSequenceEntry): Promise<void> {
    const db = await dbPromise
    await db.put(STORE, entry, sequenceId)
  }

  async delete(sequenceId: string): Promise<void> {
    const db = await dbPromise
    await db.delete(STORE, sequenceId)
  }
}
