export type StartPage = "library" | "favourites" | "last-sequence"

const KEY_START_PAGE = "lingodrill.startPage"
const KEY_SUB_FONT_SIZE = "lingodrill.subFontSize"
const KEY_LAST_SEQUENCE = "lingodrill.lastSequence"
const KEY_FRAGMENT_GAP = "lingodrill.fragmentGap"

export const DEFAULT_START_PAGE: StartPage = "library"
export const DEFAULT_SUB_FONT_SIZE = 14
export const SUB_FONT_SIZE_MIN = 10
export const SUB_FONT_SIZE_MAX = 32
export const DEFAULT_FRAGMENT_GAP = 2
export const FRAGMENT_GAP_MIN = 0
export const FRAGMENT_GAP_MAX = 10

export function getStartPage(): StartPage {
  const v = localStorage.getItem(KEY_START_PAGE)
  if (v === "library" || v === "favourites" || v === "last-sequence") return v
  return DEFAULT_START_PAGE
}

export function setStartPage(v: StartPage): void {
  localStorage.setItem(KEY_START_PAGE, v)
}

export function getSubFontSize(): number {
  const raw = localStorage.getItem(KEY_SUB_FONT_SIZE)
  const n = raw ? parseInt(raw, 10) : NaN
  if (!isNaN(n) && n >= SUB_FONT_SIZE_MIN && n <= SUB_FONT_SIZE_MAX) return n
  return DEFAULT_SUB_FONT_SIZE
}

export function setSubFontSize(n: number): void {
  localStorage.setItem(KEY_SUB_FONT_SIZE, String(n))
  applySubFontSize(n)
}

export function applySubFontSize(n: number = getSubFontSize()): void {
  document.documentElement.style.setProperty("--sub-font-size", `${n}px`)
}

export type LastSequence = { audioId: string; seqId: string }

export function getLastSequence(): LastSequence | null {
  const raw = localStorage.getItem(KEY_LAST_SEQUENCE)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.audioId === "string" && typeof parsed.seqId === "string") {
      return parsed
    }
  } catch {
    // ignore
  }
  return null
}

export function setLastSequence(v: LastSequence): void {
  localStorage.setItem(KEY_LAST_SEQUENCE, JSON.stringify(v))
}

export function getFragmentGap(): number {
  const raw = localStorage.getItem(KEY_FRAGMENT_GAP)
  if (raw === null) return DEFAULT_FRAGMENT_GAP
  const n = parseFloat(raw)
  if (!isNaN(n) && n >= FRAGMENT_GAP_MIN && n <= FRAGMENT_GAP_MAX) return n
  return DEFAULT_FRAGMENT_GAP
}

export function setFragmentGap(n: number): void {
  const clamped = Math.max(FRAGMENT_GAP_MIN, Math.min(FRAGMENT_GAP_MAX, n))
  localStorage.setItem(KEY_FRAGMENT_GAP, String(clamped))
}
