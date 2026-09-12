// infrastructure/indexeddb/IndexedDBBackgroundStorage.ts
//
// User-made backgrounds. The one the app ships with is a constant rather than a
// row here (see BUILTIN_BACKGROUND), so an untouched install reads an empty
// store and still has a background to show — but re-colouring the built-in has
// to be remembered somewhere, so that one case is written back as a row under
// its own id, and `getAll` lets it shadow the constant.

import { dbPromise } from "./db"
import type { BackgroundDef } from "../../core/domain/types"
import { BUILTIN_BACKGROUND, BUILTIN_BACKGROUND_ID } from "../../utils/backgroundPattern"

export class IndexedDBBackgroundStorage {
  /** The built-in first, then everything the user made, oldest first. */
  async getAll(): Promise<BackgroundDef[]> {
    const db = await dbPromise
    const stored: BackgroundDef[] = await db.getAll("backgrounds")
    const builtin = stored.find(b => b.id === BUILTIN_BACKGROUND_ID)
    /* Only the colour of the built-in is the user's to change — its drawings
       ship with the app, so they are always read from the constant and a stale
       copy in storage can never pin an old version of them onto the page. */
    const head: BackgroundDef = builtin
      ? { ...BUILTIN_BACKGROUND, stroke: builtin.stroke }
      : BUILTIN_BACKGROUND
    const rest = stored
      .filter(b => b.id !== BUILTIN_BACKGROUND_ID)
      .sort((a, b) => a.createdAt - b.createdAt)
    return [head, ...rest]
  }

  async get(id: string): Promise<BackgroundDef | undefined> {
    if (id === BUILTIN_BACKGROUND_ID) {
      return (await this.getAll())[0]
    }
    const db = await dbPromise
    return db.get("backgrounds", id)
  }

  async save(bg: BackgroundDef): Promise<void> {
    const db = await dbPromise
    await db.put("backgrounds", bg)
  }

  async delete(id: string): Promise<void> {
    const db = await dbPromise
    await db.delete("backgrounds", id)
  }
}
