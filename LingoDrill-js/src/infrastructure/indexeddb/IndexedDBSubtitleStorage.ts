// infrastructure/indexeddb/IndexedDBSubtitleStorage.ts

import { dbPromise } from "./db"
import type { SubtitleFile } from "../../core/domain/types"

export class IndexedDBSubtitleStorage {
  async save(subtitle: SubtitleFile): Promise<void> {
    const db = await dbPromise
    await db.put("subtitleFiles", subtitle)
  }

  async getAllByAudio(audioId: string): Promise<SubtitleFile[]> {
    const db = await dbPromise
    const all: SubtitleFile[] = await db.getAll("subtitleFiles")
    return all
      .filter(s => s.audioId === audioId)
      .sort((a, b) => a.createdAt - b.createdAt)
  }

  async get(id: string): Promise<SubtitleFile | undefined> {
    const db = await dbPromise
    return db.get("subtitleFiles", id)
  }

  async delete(id: string): Promise<void> {
    const db = await dbPromise
    await db.delete("subtitleFiles", id)
  }
}