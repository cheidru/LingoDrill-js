// infrastructure/indexeddb/IndexedDBSequenceStorage.ts

import { dbPromise } from "./db"
import type { Sequence } from "../../core/domain/types"

export class IndexedDBSequenceStorage {
  async save(sequence: Sequence): Promise<void> {
    const db = await dbPromise
    await db.put("sequences", sequence)
  }

  async getAllByAudio(audioId: string): Promise<Sequence[]> {
    const db = await dbPromise
    const all: Sequence[] = await db.getAll("sequences")
    return all
      .filter(s => s.audioId === audioId)
      .sort((a, b) => a.createdAt - b.createdAt)
  }

  async get(id: string): Promise<Sequence | undefined> {
    const db = await dbPromise
    return db.get("sequences", id)
  }

  async delete(id: string): Promise<void> {
    const db = await dbPromise
    await db.delete("sequences", id)
  }

  async update(sequence: Sequence): Promise<void> {
    const db = await dbPromise
    await db.put("sequences", sequence)
  }

  async getNextLabel(audioId: string): Promise<string> {
    const sequences = await this.getAllByAudio(audioId)
    // Находим максимальный числовой label
    let max = 0
    for (const s of sequences) {
      const num = parseInt(s.label, 10)
      if (!isNaN(num) && num > max) max = num
    }
    return String(max + 1)
  }
}