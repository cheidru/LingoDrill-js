// infrastructure/indexeddb/IndexedDBFragmentStorage.ts

import { dbPromise } from "./db"
import type { Fragment } from "../../core/domain/types"

export class IndexedDBFragmentStorage {
  async save(fragment: Fragment): Promise<void> {
    const db = await dbPromise
    await db.put("fragments", fragment)
  }

  async getAllByAudio(audioId: string): Promise<Fragment[]> {
    const db = await dbPromise
    const all = await db.getAll("fragments")
    return all.filter(f => f.audioId === audioId)
  }

  async delete(id: string): Promise<void> {
    const db = await dbPromise
    await db.delete("fragments", id)
  }

  async update(fragment: Fragment): Promise<void> {
    const db = await dbPromise
    await db.put("fragments", fragment)
  }
}