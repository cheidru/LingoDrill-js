export type StartPage = "library" | "favourites" | "last-sequence"
export type Language = "en" | "ru"
export type Theme = "light" | "dark"
export type ColorTheme = "normal" | "pastel" | "neon"
/* Motif tiled behind the page. Each value needs a matching rule in index.css;
   "none" is the default so nobody's app changes appearance under them. */
export type BgPattern = "none" | "leaves"
/* The ground the pattern sits on: the theme's flat page colour, or a soft
   gradient mixed from the theme's own primary and accent. */
export type BgGround = "plain" | "gradient"
/* Hue mixed into the page ground. "default" leaves the theme's own colour
   alone; every other value has a `--bg-tint-<name>` token in index.css. */
export type BgTint = "default" | "sage" | "sand" | "clay" | "sky" | "lilac" | "slate"

const KEY_START_PAGE = "lingodrill.startPage"
const KEY_SUB_FONT_SIZE = "lingodrill.subFontSize"
const KEY_LAST_SEQUENCE = "lingodrill.lastSequence"
const KEY_FRAGMENT_GAP = "lingodrill.fragmentGap"
const KEY_TRIM_SILENCE_GAP = "lingodrill.trimSilenceGap"
const KEY_LANGUAGE = "lingodrill.language"
const KEY_THEME = "lingodrill.theme"
const KEY_COLOR_THEME = "lingodrill.colorTheme"
const KEY_BG_PATTERN = "lingodrill.bgPattern"
const KEY_BG_GROUND = "lingodrill.bgGround"
const KEY_BG_TINT = "lingodrill.bgTint"
const KEY_ONBOARDING_SEEN = "lingodrill.onboardingSeen"

export const DEFAULT_START_PAGE: StartPage = "library"
export const DEFAULT_SUB_FONT_SIZE = 14
export const SUB_FONT_SIZE_MIN = 10
export const SUB_FONT_SIZE_MAX = 32
export const DEFAULT_FRAGMENT_GAP = 2
export const FRAGMENT_GAP_MIN = 0
export const FRAGMENT_GAP_MAX = 10
/* Silence kept on each side of a gap that "Trim silence" removes, in seconds.
   Same units and range as the fragment gap, so both rows behave identically. */
export const DEFAULT_TRIM_SILENCE_GAP = 2
export const TRIM_SILENCE_GAP_MIN = 0
export const TRIM_SILENCE_GAP_MAX = 10
export const DEFAULT_LANGUAGE: Language = "en"
/* Languages offered in Settings. Anything listed here must have a dictionary in
   utils/i18n.ts; a stored language that is not on this list falls back to the
   default rather than stranding the user in a half-translated interface. */
export const AVAILABLE_LANGUAGES: Language[] = ["en", "ru"]
export const DEFAULT_THEME: Theme = "light"
export const DEFAULT_COLOR_THEME: ColorTheme = "normal"
export const DEFAULT_BG_PATTERN: BgPattern = "none"
export const DEFAULT_BG_GROUND: BgGround = "plain"
/* Patterns offered in Settings. As with languages, this is what the UI reads:
   a stored motif that has since been withdrawn falls back to the default
   rather than leaving the page with a mask that resolves to nothing. */
export const AVAILABLE_BG_PATTERNS: BgPattern[] = ["none", "leaves"]
export const DEFAULT_BG_TINT: BgTint = "default"
export const AVAILABLE_BG_TINTS: BgTint[] = ["default", "sage", "sand", "clay", "sky", "lilac", "slate"]

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

export function getTrimSilenceGap(): number {
  const raw = localStorage.getItem(KEY_TRIM_SILENCE_GAP)
  if (raw === null) return DEFAULT_TRIM_SILENCE_GAP
  const n = parseFloat(raw)
  if (!isNaN(n) && n >= TRIM_SILENCE_GAP_MIN && n <= TRIM_SILENCE_GAP_MAX) return n
  return DEFAULT_TRIM_SILENCE_GAP
}

export function setTrimSilenceGap(n: number): void {
  const clamped = Math.max(TRIM_SILENCE_GAP_MIN, Math.min(TRIM_SILENCE_GAP_MAX, n))
  localStorage.setItem(KEY_TRIM_SILENCE_GAP, String(clamped))
}

export function getLanguage(): Language {
  const v = localStorage.getItem(KEY_LANGUAGE)
  // Checked against what is actually offered, not against the type: anyone who
  // selected a language that has since been withdrawn falls back to the default
  // rather than being stranded in a half-translated interface.
  if (AVAILABLE_LANGUAGES.includes(v as Language)) return v as Language
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

export function getBgPattern(): BgPattern {
  const v = localStorage.getItem(KEY_BG_PATTERN)
  if (AVAILABLE_BG_PATTERNS.includes(v as BgPattern)) return v as BgPattern
  return DEFAULT_BG_PATTERN
}

export function setBgPattern(v: BgPattern): void {
  localStorage.setItem(KEY_BG_PATTERN, v)
  applyBgPattern(v)
}

export function applyBgPattern(v: BgPattern = getBgPattern()): void {
  document.documentElement.setAttribute("data-bg-pattern", v)
}

export function getBgGround(): BgGround {
  const v = localStorage.getItem(KEY_BG_GROUND)
  if (v === "plain" || v === "gradient") return v
  return DEFAULT_BG_GROUND
}

export function setBgGround(v: BgGround): void {
  localStorage.setItem(KEY_BG_GROUND, v)
  applyBgGround(v)
}

/* Always stamped, never absent: the neon dark theme keys its ambient halos off
   `[data-bg-ground="plain"]`, so an unstamped document would lose them. */
export function applyBgGround(v: BgGround = getBgGround()): void {
  document.documentElement.setAttribute("data-bg-ground", v)
}

export function getBgTint(): BgTint {
  const v = localStorage.getItem(KEY_BG_TINT)
  if (AVAILABLE_BG_TINTS.includes(v as BgTint)) return v as BgTint
  return DEFAULT_BG_TINT
}

export function setBgTint(v: BgTint): void {
  localStorage.setItem(KEY_BG_TINT, v)
  applyBgTint(v)
}

export function applyBgTint(v: BgTint = getBgTint()): void {
  document.documentElement.setAttribute("data-bg-tint", v)
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
