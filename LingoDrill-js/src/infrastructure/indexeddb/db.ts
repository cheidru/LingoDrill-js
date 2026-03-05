// infrastructure/indexeddb/db.ts

import { openDB } from "idb"

export const dbPromise = openDB("language-trainer", 3, {
  upgrade(db, oldVersion) {
    if (oldVersion < 1) {
      db.createObjectStore("audioMeta", { keyPath: "id" })
      db.createObjectStore("audioBlobs")
      db.createObjectStore("subtitleMeta", { keyPath: "id" })
      db.createObjectStore("subtitleBlobs")
      db.createObjectStore("fragments", { keyPath: "id" })
      db.createObjectStore("sequences", { keyPath: "id" })
    }
    if (oldVersion < 3) {
      if (!db.objectStoreNames.contains("subtitleFiles")) {
        db.createObjectStore("subtitleFiles", { keyPath: "id" })
      }
    }
  },
})