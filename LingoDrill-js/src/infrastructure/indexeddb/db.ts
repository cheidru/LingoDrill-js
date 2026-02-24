import { openDB } from "idb"

export const dbPromise = openDB("language-trainer", 1, {
  upgrade(db) {
    db.createObjectStore("audioMeta", { keyPath: "id" })
    db.createObjectStore("audioBlobs")
    db.createObjectStore("subtitleMeta", { keyPath: "id" })
    db.createObjectStore("subtitleBlobs")
    db.createObjectStore("fragments", { keyPath: "id" })
    db.createObjectStore("sequences", { keyPath: "id" })
  },
})