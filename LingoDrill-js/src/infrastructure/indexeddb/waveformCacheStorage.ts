// infrastructure/indexeddb/WaveformCacheStorage.ts

import { dbPromise } from "./db"

// Bump this when the waveform-building code changes in a way that invalidates
// previously-cached arrays. v1 entries (raw number[] without an envelope) and
// any v < CURRENT_VERSION envelopes are treated as missing and rebuilt.
// v3: stored analysis envelope density raised 1000 → 4000 points.
const CURRENT_VERSION = 3

interface WaveformCacheEntry {
  v: number
  data: number[]
}

function isEntry(x: unknown): x is WaveformCacheEntry {
  return (
    typeof x === "object" &&
    x !== null &&
    typeof (x as WaveformCacheEntry).v === "number" &&
    Array.isArray((x as WaveformCacheEntry).data)
  )
}

export class WaveformCacheStorage {
  async get(audioId: string): Promise<number[] | null> {
    const db = await dbPromise
    const raw = await db.get("waveformCache", audioId)
    if (!raw) return null
    if (isEntry(raw) && raw.v >= CURRENT_VERSION) return raw.data
    // Legacy/stale entry — drop it so it gets rebuilt
    await db.delete("waveformCache", audioId)
    return null
  }

  async save(audioId: string, waveformData: number[]): Promise<void> {
    const db = await dbPromise
    const entry: WaveformCacheEntry = { v: CURRENT_VERSION, data: waveformData }
    await db.put("waveformCache", entry, audioId)
  }

  async delete(audioId: string): Promise<void> {
    const db = await dbPromise
    await db.delete("waveformCache", audioId)
  }
}
