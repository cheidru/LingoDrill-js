export type StartPage = "library" | "favourites" | "last-sequence"
export type Language = "en" | "ru"
export type Theme = "light" | "dark"
export type ColorTheme = "normal" | "pastel" | "neon"

const KEY_START_PAGE = "lingodrill.startPage"
const KEY_SUB_FONT_SIZE = "lingodrill.subFontSize"
const KEY_LAST_SEQUENCE = "lingodrill.lastSequence"
const KEY_FRAGMENT_GAP = "lingodrill.fragmentGap"
const KEY_LANGUAGE = "lingodrill.language"
const KEY_THEME = "lingodrill.theme"
const KEY_COLOR_THEME = "lingodrill.colorTheme"
const KEY_ONBOARDING_SEEN = "lingodrill.onboardingSeen"

export const DEFAULT_START_PAGE: StartPage = "library"
export const DEFAULT_SUB_FONT_SIZE = 14
export const SUB_FONT_SIZE_MIN = 10
export const SUB_FONT_SIZE_MAX = 32
export const DEFAULT_FRAGMENT_GAP = 2
export const FRAGMENT_GAP_MIN = 0
export const FRAGMENT_GAP_MAX = 10
export const DEFAULT_LANGUAGE: Language = "en"
export const DEFAULT_THEME: Theme = "light"
export const DEFAULT_COLOR_THEME: ColorTheme = "normal"

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

export function getLanguage(): Language {
  const v = localStorage.getItem(KEY_LANGUAGE)
  if (v === "en" || v === "ru") return v
  return DEFAULT_LANGUAGE
}

export function setLanguage(v: Language): void {
  localStorage.setItem(KEY_LANGUAGE, v)
  document.documentElement.lang = v
  window.dispatchEvent(new CustomEvent("lingodrill:languagechange", { detail: v }))
}

export function getTheme(): Theme {
  const v = localStorage.getItem(KEY_THEME)
  if (v === "light" || v === "dark") return v
  return DEFAULT_THEME
}

export function setTheme(v: Theme): void {
  localStorage.setItem(KEY_THEME, v)
  applyTheme(v)
}

export function applyTheme(v: Theme = getTheme()): void {
  document.documentElement.setAttribute("data-theme", v)
}

export function getColorTheme(): ColorTheme {
  const v = localStorage.getItem(KEY_COLOR_THEME)
  if (v === "normal" || v === "pastel" || v === "neon") return v
  return DEFAULT_COLOR_THEME
}

export function setColorTheme(v: ColorTheme): void {
  localStorage.setItem(KEY_COLOR_THEME, v)
  applyColorTheme(v)
}

export function applyColorTheme(v: ColorTheme = getColorTheme()): void {
  document.documentElement.setAttribute("data-color-theme", v)
}

export function hasSeenOnboarding(): boolean {
  return localStorage.getItem(KEY_ONBOARDING_SEEN) === "1"
}

export function setOnboardingSeen(): void {
  localStorage.setItem(KEY_ONBOARDING_SEEN, "1")
}

export function applyLanguage(v: Language = getLanguage()): void {
  document.documentElement.lang = v
}
