// infrastructure/indexeddb/db.ts

import { openDB } from "idb"

export const dbPromise = openDB("language-trainer", 7, {
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
    if (oldVersion < 4) {
      if (!db.objectStoreNames.contains("waveformCache")) {
        db.createObjectStore("waveformCache")
      }
    }
    if (oldVersion < 5) {
      if (!db.objectStoreNames.contains("vocabularyFiles")) {
        db.createObjectStore("vocabularyFiles", { keyPath: "id" })
      }
    }
    /* v6 added renderedSequenceCache for background-listening mode, which baked
       a whole sequence into one MP3 up front. The render cost more in waiting
       than it saved, so the mode is gone — and its cache with it, since the
       entries are whole-sequence MP3s and would otherwise sit in the user's
       storage forever with nothing left to read them. */
    if (oldVersion >= 6 && oldVersion < 7) {
      if (db.objectStoreNames.contains("renderedSequenceCache")) {
        db.deleteObjectStore("renderedSequenceCache")
      }
    }
  },
})