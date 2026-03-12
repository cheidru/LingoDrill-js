// infrastructure/indexeddb/WaveformCacheStorage.ts

import { dbPromise } from "./db"

export class WaveformCacheStorage {
  async get(audioId: string): Promise<number[] | null> {
    const db = await dbPromise
    const data = await db.get("waveformCache", audioId)
    return data ?? null
  }

  async save(audioId: string, waveformData: number[]): Promise<void> {
    const db = await dbPromise
    await db.put("waveformCache", waveformData, audioId)
  }

  async delete(audioId: string): Promise<void> {
    const db = await dbPromise
    await db.delete("waveformCache", audioId)
  }
}