import { dbPromise } from "./db"
import type { VocabularyFile } from "../../core/domain/types"

export class IndexedDBVocabularyStorage {
  async save(vocab: VocabularyFile): Promise<void> {
    const db = await dbPromise
    await db.put("vocabularyFiles", vocab)
  }

  async getAllByAudio(audioId: string): Promise<VocabularyFile[]> {
    const db = await dbPromise
    const all: VocabularyFile[] = await db.getAll("vocabularyFiles")
    return all
      .filter(v => v.audioId === audioId)
      .sort((a, b) => a.createdAt - b.createdAt)
  }

  async get(id: string): Promise<VocabularyFile | undefined> {
    const db = await dbPromise
    return db.get("vocabularyFiles", id)
  }

  async delete(id: string): Promise<void> {
    const db = await dbPromise
    await db.delete("vocabularyFiles", id)
  }
}
