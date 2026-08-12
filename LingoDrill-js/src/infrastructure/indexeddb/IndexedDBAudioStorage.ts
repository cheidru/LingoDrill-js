// infrastructure/indexeddb/IndexedDBAudioStorage.ts

import { dbPromise } from "./db"
import { computeSHA256 } from "../../core/storage/hash"
import type { AudioFile, AudioFileId } from "../../core/domain/types"

export class IndexedDBAudioStorage {
  // Сохранение аудиофайла в db
  // Теперь можно передавать id, чтобы не было рассинхронизации
  // derivedFrom помечает файл, созданный обработкой другого файла
  // (обрезка пауз, выравнивание/подъём громкости) — такие файлы не показываются
  // в аудиотеке и удаляются вместе с исходным.
  async save(file: File, id: string, derivedFrom?: AudioFileId): Promise<AudioFile> {
    const db = await dbPromise

    const meta: AudioFile = {
      id,
      name: file.name,
      mimeType: file.type,
      size: file.size,
      hash: "", // временно пустой
      createdAt: Date.now(),
      ...(derivedFrom ? { derivedFrom } : {}),
    }

    await db.put("audioMeta", meta)
    await db.put("audioBlobs", file, id)

    // считаем hash в фоне
    void this.computeAndUpdateHash(id, file)

    return meta
  }

  async getAll(): Promise<AudioFile[]> {
    const db = await dbPromise
    return db.getAll("audioMeta")
  }

  async getBlob(id: AudioFileId): Promise<Blob | null> {
    const db = await dbPromise
    const blob = await db.get("audioBlobs", id)
    return blob ?? null
  }

  async delete(id: AudioFileId): Promise<void> {
    const db = await dbPromise
    await db.delete("audioMeta", id)
    await db.delete("audioBlobs", id)
  }

  private async computeAndUpdateHash(id: string, file: File) {
    const hash = await computeSHA256(file)
    const db = await dbPromise

    const meta = await db.get("audioMeta", id)
    if (!meta) return

    meta.hash = hash
    await db.put("audioMeta", meta)
  }
}