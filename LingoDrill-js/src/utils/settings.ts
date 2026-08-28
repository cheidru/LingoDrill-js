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
/* Colour mixed into the page ground: "default" leaves the theme's own colour
   alone, anything else is a `#rrggbb` the user picked.

   The hue is the user's choice; how far it is allowed to carry is not. A pick
   is pulled into the saturation/lightness band the app was designed around
   (see `normalizeBgTint`) before it is stored, so no colour can wash the
   ground out or drown the cards standing on it. */
export type BgTint = string

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
/* Where the colour picker opens before anything has been chosen — the sage the
   old fixed palette led with. */
export const DEFAULT_TINT_COLOR = "#4f8a63"
/* The band every pick is pulled into. Its edges are the range the six retired
   presets covered, which is what the mix strength in index.css was tuned for:
   below it a colour vanishes into the page, above it the ground starts
   competing with the cards. A colour the user picked as grey stays grey —
   raising its saturation would hand them a hue they did not ask for. */
const TINT_SATURATION_MIN = 12
const TINT_SATURATION_MAX = 60
const TINT_LIGHTNESS_MIN = 40
const TINT_LIGHTNESS_MAX = 62
const TINT_ACHROMATIC = 4

/* Values written before the picker replaced the named palette. */
const LEGACY_TINTS: Record<string, string> = {
  sage: "#4f8a63",
  sand: "#b08843",
  clay: "#c0605f",
  sky: "#3d7fd6",
  lilac: "#8271cf",
  slate: "#5b6b82",
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { h: 0, s: 0, l: l * 100 }

  const s = d / (1 - Math.abs(2 * l - 1))
  let h: number
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  h *= 60
  if (h < 0) h += 360

  return { h, s: s * 100, l: l * 100 }
}

function hslToHex(h: number, s: number, l: number): string {
  const sn = s / 100
  const ln = l / 100
  const c = (1 - Math.abs(2 * ln - 1)) * sn
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = ln - c / 2

  let r = 0
  let g = 0
  let b = 0
  if (h < 60) { r = c; g = x }
  else if (h < 120) { r = x; g = c }
  else if (h < 180) { g = c; b = x }
  else if (h < 240) { g = x; b = c }
  else if (h < 300) { r = x; b = c }
  else { r = c; b = x }

  const byte = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0")
  return `#${byte(r)}${byte(g)}${byte(b)}`
}

/**
 * Keeps the picked hue, pulls its saturation and lightness into the band the
 * ground was designed for. Anything that is not a `#rrggbb` falls back to the
 * default colour rather than reaching CSS as a value it cannot parse.
 */
export function normalizeBgTint(hex: string): string {
  const source = HEX_COLOR.test(hex) ? hex : DEFAULT_TINT_COLOR
  const { h, s, l } = hexToHsl(source)
  const saturation = s < TINT_ACHROMATIC ? s : clamp(s, TINT_SATURATION_MIN, TINT_SATURATION_MAX)
  return hslToHex(h, saturation, clamp(l, TINT_LIGHTNESS_MIN, TINT_LIGHTNESS_MAX))
}

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
  if (!v || v === DEFAULT_BG_TINT) return DEFAULT_BG_TINT
  if (LEGACY_TINTS[v]) return normalizeBgTint(LEGACY_TINTS[v])
  if (HEX_COLOR.test(v)) return normalizeBgTint(v)
  return DEFAULT_BG_TINT
}

/* Normalised on the way in, so what is stored is the colour the page actually
   wears — nothing downstream has to re-derive it. */
export function setBgTint(v: BgTint): void {
  const next = v === DEFAULT_BG_TINT ? DEFAULT_BG_TINT : normalizeBgTint(v)
  localStorage.setItem(KEY_BG_TINT, next)
  applyBgTint(next)
}

/* The one setting whose value is not a fixed name, so it is carried by the
   `--bg-tint` custom property on <html> instead of a data attribute; the
   `:root` default in index.css takes over again once it is removed. */
export function applyBgTint(v: BgTint = getBgTint()): void {
  const root = document.documentElement
  if (v === DEFAULT_BG_TINT) root.style.removeProperty("--bg-tint")
  else root.style.setProperty("--bg-tint", v)
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
