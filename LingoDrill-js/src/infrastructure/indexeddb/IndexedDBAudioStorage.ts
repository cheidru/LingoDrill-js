import { dbPromise } from "./db"
import { nanoid } from "nanoid"
import { computeSHA256 } from "../../core/storage/hash"
import type { AudioFile, AudioFileId } from "../../core/domain/types"

export class IndexedDBAudioStorage {
  async save(file: File): Promise<AudioFile> {
    const db = await dbPromise
    const id = nanoid()
    const hash = await computeSHA256(file)

    // Версионирование базы данных
    // const DB_NAME = "language-trainer"
    // const DB_VERSION = 1

    const meta = {
      id,
      name: file.name,
      mimeType: file.type,
      size: file.size,
      hash,
      createdAt: Date.now(),
    }

    await db.put("audioMeta", meta)
    await db.put("audioBlobs", file, id)

    return meta
  }

  async getAll(): Promise<AudioFile[]> {
    const db = await dbPromise
    return db.getAll("audioMeta")
  }

  async getBlob(id: AudioFileId): Promise<Blob> {
    const db = await dbPromise
    return db.get("audioBlobs", id)
  }

  async delete(id: AudioFileId): Promise<void> {
    const db = await dbPromise
    await db.delete("audioMeta", id)
    await db.delete("audioBlobs", id)
  }
}