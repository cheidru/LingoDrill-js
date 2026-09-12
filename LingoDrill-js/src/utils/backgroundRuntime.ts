// utils/backgroundRuntime.ts
//
// The bridge between the stored background id and the pattern layer on screen.
//
// Building a tile means reading IndexedDB and measuring six curves, which is
// asynchronous and cannot happen before the first paint. So the finished tile
// is kept in localStorage and re-applied synchronously at boot; storage is then
// re-read in the background and the layer corrected if anything has changed.
// Without that cache the page would start bare and grow its pattern a moment
// later, on every single load.

import type { BackgroundDef } from "../core/domain/types"
import { IndexedDBBackgroundStorage } from "../infrastructure/indexeddb/IndexedDBBackgroundStorage"
import { buildPatternTile, DEFAULT_STROKE, type PatternTile } from "./backgroundPattern"
import { getBgPattern, BG_PATTERN_NONE } from "./settings"

const KEY_TILE_CACHE = "lingodrill.bgPatternTile"

interface CachedTile extends PatternTile {
  id: string
  stroke: string
}

function isCachedTile(x: unknown): x is CachedTile {
  const t = x as CachedTile
  return (
    typeof x === "object" && x !== null &&
    typeof t.id === "string" && typeof t.stroke === "string" &&
    typeof t.uri === "string" && typeof t.width === "number" && typeof t.height === "number"
  )
}

/**
 * Paints (or clears) the pattern layer. The tile size is written alongside the
 * mask because it is not decorative: `mask-size` has to be the tile's own pixel
 * size or the drawings stop being 40px tall.
 */
export function applyPatternTile(tile: CachedTile | null): void {
  const root = document.documentElement
  if (!tile) {
    root.setAttribute("data-bg-pattern", BG_PATTERN_NONE)
    root.style.removeProperty("--bg-pattern")
    root.style.removeProperty("--bg-pattern-size")
    root.style.removeProperty("--bg-pattern-color")
    return
  }
  root.setAttribute("data-bg-pattern", "custom")
  root.style.setProperty("--bg-pattern", `url("${tile.uri}")`)
  root.style.setProperty("--bg-pattern-size", `${tile.width}px ${tile.height}px`)
  /* "default" is the absence of a choice, so it is the absence of the property:
     the `:root` fallback to the theme's own text colour takes over again. */
  if (tile.stroke === DEFAULT_STROKE) root.style.removeProperty("--bg-pattern-color")
  else root.style.setProperty("--bg-pattern-color", tile.stroke)
}

function readCache(): CachedTile | null {
  try {
    const raw = localStorage.getItem(KEY_TILE_CACHE)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return isCachedTile(parsed) ? parsed : null
  } catch {
    return null
  }
}

function writeCache(tile: CachedTile | null): void {
  try {
    if (tile) localStorage.setItem(KEY_TILE_CACHE, JSON.stringify(tile))
    else localStorage.removeItem(KEY_TILE_CACHE)
  } catch {
    // A full quota costs us the head start at next boot, nothing more.
  }
}

/** Boot: the last tile, straight from the cache, before anything is read. */
export function applyBgPatternFromCache(): void {
  const id = getBgPattern()
  if (id === BG_PATTERN_NONE) {
    applyPatternTile(null)
    return
  }
  const cached = readCache()
  applyPatternTile(cached && cached.id === id ? cached : null)
}

/** Takes the pattern off the page and drops the tile the cache was holding —
    the background it was built from is gone, or has been switched away from. */
export function clearBgPattern(): void {
  applyPatternTile(null)
  writeCache(null)
}

/** Builds the tile for a background and writes it to the page and the cache. */
export function applyBackground(bg: BackgroundDef): void {
  const tile = buildPatternTile(bg)
  const cached = tile ? { ...tile, id: bg.id, stroke: bg.stroke } : null
  applyPatternTile(cached)
  writeCache(cached)
}

/**
 * Re-reads the selected background and corrects the layer. Run at boot behind
 * the cached tile, and after anything on the Backgrounds page changes. A
 * background that has since been deleted leaves the page with no pattern rather
 * than with a mask pointing at nothing.
 */
export async function refreshBgPattern(): Promise<void> {
  const id = getBgPattern()
  if (id === BG_PATTERN_NONE) {
    clearBgPattern()
    return
  }
  try {
    const bg = await new IndexedDBBackgroundStorage().get(id)
    if (!bg) {
      clearBgPattern()
      return
    }
    applyBackground(bg)
  } catch {
    // Storage unavailable: whatever the cache painted stays up.
  }
}
