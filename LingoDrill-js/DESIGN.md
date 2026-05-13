---
name: LingoDrill
description: >-
  A focused, studio-grade design system for an audio drilling app. The default
  surface is a clean modern blue-on-white aesthetic with generous radii, soft
  shadows, and pill-shaped controls. A complementary "Studio Dark" mode (Neon +
  Dark) reframes the same UI as a DAW-inspired control surface with a cyan
  primary, orange highlights, monospace timestamps, and ambient halos.
themes:
  default: light-normal
  available:
    - light-normal       # Clean modern blue/white (default)
    - dark-normal        # Slate/blue dark
    - light-pastel       # Soft muted teal-rose
    - dark-pastel        # Warm muted dark
    - light-neon         # Bright cyan
    - dark-neon          # Studio Dark (DAW-inspired)
colors:
  # ===== Default theme: Light + Normal =====
  primary: "#1a56db"
  primary-dark: "#1342a8"
  primary-light: "#3b82f6"
  primary-bg: "#eff6ff"
  primary-bg-hover: "#dbeafe"
  primary-bg-active: "#bfdbfe"
  accent: "#ea580c"
  success: "#16a34a"
  warning: "#f59e0b"
  danger: "#dc2626"
  danger-bg: "#fef2f2"
  danger-hover: "#b91c1c"
  text: "#1e293b"
  text-secondary: "#64748b"
  text-muted: "#94a3b8"
  border: "#e2e8f0"
  border-strong: "#cbd5e1"
  bg: "#ffffff"
  bg-page: "#f8fafc"
  bg-subtle: "#f1f5f9"
  bg-card: "#ffffff"
  on-primary: "#ffffff"
  on-danger: "#ffffff"
  scrim: "rgba(15, 23, 42, 0.5)"     # modal overlay
  scrim-mobile: "rgba(15, 23, 42, 0.4)"  # mobile menu overlay
themes-detail:
  dark-normal:
    text: "#e2e8f0"
    text-secondary: "#cbd5e1"
    text-muted: "#94a3b8"
    border: "#334155"
    border-strong: "#475569"
    bg: "#1e293b"
    bg-page: "#0f172a"
    bg-subtle: "#1e293b"
    bg-card: "#1e293b"
    primary-bg: "#1e3a5f"
    primary-bg-hover: "#1e3a8a"
    primary-bg-active: "#1e40af"
    danger-bg: "#3a1212"
  light-pastel:
    primary: "#7c9eb2"
    primary-dark: "#5e85a0"
    primary-light: "#a3c0d0"
    primary-bg: "#eaf2f7"
    primary-bg-hover: "#d6e6ef"
    primary-bg-active: "#c2d9e6"
    success: "#93c4a4"
    warning: "#f0c987"
    danger: "#d99a9a"
    danger-hover: "#c47878"
    accent: "#d9a37a"
    bg-page: "#fbf8f5"
    bg-subtle: "#f3eee8"
    border: "#e7ddd3"
    border-strong: "#d6c9bd"
  dark-pastel:
    primary: "#9bb8ca"
    primary-dark: "#7c9eb2"
    primary-light: "#bccfdc"
    primary-bg: "#2a3845"
    primary-bg-hover: "#34465a"
    primary-bg-active: "#3f546c"
    bg-page: "#1a1f24"
    bg: "#232930"
    bg-card: "#232930"
    bg-subtle: "#2a3038"
    border: "#3a414b"
    border-strong: "#4a525e"
    text: "#ece4d9"
    text-secondary: "#c8bfb2"
    text-muted: "#8a8174"
  light-neon:
    primary: "#00b8d4"
    primary-dark: "#008fa6"
    primary-light: "#18ffff"
    primary-bg: "#e0f7fa"
    primary-bg-hover: "#b2ebf2"
    primary-bg-active: "#80deea"
    success: "#00c853"
    warning: "#ffab00"
    danger: "#ff1744"
    danger-hover: "#d50000"
    accent: "#ff6b35"
  dark-neon-studio:
    primary: "#00e5ff"
    primary-dark: "#00b8d4"
    primary-light: "#5ceaff"
    primary-bg: "#002e33"
    primary-bg-hover: "#003e44"
    primary-bg-active: "#004e55"
    accent: "#ff6b35"
    bg-page: "#0e1116"
    bg: "#161b22"
    bg-card: "#161b22"
    bg-subtle: "#1f2733"
    border: "#2a323d"
    border-strong: "#3a4452"
    text: "#e6edf3"
    text-secondary: "#c9d1d9"
    text-muted: "#8b949e"
    danger: "#ff5470"
    danger-hover: "#ff2d55"
    danger-bg: "#2a1018"
    warning: "#ffb454"
    success: "#3fb950"
    glow-primary: "0 0 12px rgba(0, 229, 255, 0.35)"
    page-background: >-
      radial-gradient(1200px 600px at 80% -10%, rgba(0,229,255,0.05), transparent 60%),
      radial-gradient(900px 500px at -10% 110%, rgba(255,107,53,0.04), transparent 60%),
      #0e1116
typography:
  font-families:
    body: '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
    body-studio: '"Geist", "Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
    mono: '"SF Mono", "Cascadia Code", "Fira Code", "JetBrains Mono", ui-monospace, monospace'
    mono-studio: '"JetBrains Mono", "SF Mono", "Cascadia Code", "Fira Code", ui-monospace, monospace'
  base:
    fontFamily: body
    fontSize: 16px
    fontWeight: "400"
    lineHeight: "1.5"
    color: "{colors.text}"
  h1:
    fontFamily: body
    fontSize: 1.75rem        # 28px
    fontWeight: "700"
    lineHeight: "1.1"
    color: "{colors.text}"
  h2:
    fontFamily: body
    fontSize: 1.35rem        # ~21.6px
    fontWeight: "700"
    color: "{colors.text}"
  h3:
    fontFamily: body
    fontSize: 1.1rem         # ~17.6px
    fontWeight: "600"
    color: "{colors.text}"
  body:
    fontFamily: body
    fontSize: 1rem           # 16px
    fontWeight: "400"
    lineHeight: "1.5"
  body-sm:
    fontFamily: body
    fontSize: 0.9rem         # ~14.4px
    fontWeight: "400"
  label:
    fontFamily: body
    fontSize: 0.95rem        # ~15.2px
    fontWeight: "600"
  label-sm:
    fontFamily: body
    fontSize: 0.85rem        # ~13.6px
    fontWeight: "500"
  caption:
    fontFamily: body
    fontSize: 0.8rem         # ~12.8px
    fontWeight: "400"
    color: "{colors.text-muted}"
  micro:
    fontFamily: body
    fontSize: 0.75rem        # 12px
    fontWeight: "400"
    color: "{colors.text-muted}"
  mono-time:
    fontFamily: mono
    fontSize: 0.85rem
    fontWeight: "500"
    fontVariantNumeric: tabular-nums
  display-numeric:
    fontFamily: body
    fontSize: 2.5rem         # 40px (modal value readouts)
    fontWeight: "600"
    fontVariantNumeric: tabular-nums
    color: "{colors.primary}"
  logo:
    fontFamily: body
    fontSize: 1.1rem
    fontWeight: "800"
    letterSpacing: "-0.02em"
    color: "{colors.primary}"
  logo-studio:
    fontFamily: body-studio
    fontSize: 1.1rem
    fontWeight: "800"
    letterSpacing: "-0.04em"
    textTransform: uppercase
    color: "{colors.primary}"
  heading-tight-studio:
    letterSpacing: "-0.025em"  # h1/h2/h3 in Studio Dark
spacing:
  base: 4px
  xxs: 2px
  xs: 4px
  sm: 6px
  md: 8px
  lg: 12px
  xl: 16px
  2xl: 20px
  3xl: 24px
  4xl: 32px
  5xl: 40px
  page-padding-y: 20px
  page-padding-x: "clamp(16px, 4vw, 32px)"
  gap-row: 6px            # default vertical gap in lists
  gap-control: 8px        # default gap between controls
  gap-section: 16px       # gap between major sections
rounded:
  sm: 8px
  md: 12px
  lg: 16px
  pill: 999px
  circle: 50%
  input-code: 4px         # inline <code> in hints
borders:
  width-hairline: 1px
  width-thick: 2px
  default-color: "{colors.border}"
  strong-color: "{colors.border-strong}"
  focus-ring: "2px solid {colors.primary}"
  focus-ring-offset: 2px
  selected-ring: "0 0 0 1px {colors.primary}"
shadows:
  sm: "0 1px 2px rgba(0, 0, 0, 0.05)"
  md: "0 4px 6px -1px rgba(0,0,0,0.07), 0 2px 4px -2px rgba(0,0,0,0.05)"
  lg: "0 10px 15px -3px rgba(0,0,0,0.08), 0 4px 6px -4px rgba(0,0,0,0.04)"
  handle: "0 1px 4px rgba(0, 0, 0, 0.2)"   # progress-bar drag handle
  selected: "0 0 0 1px {colors.primary}, {shadows.sm}"
  dark-sm: "0 1px 2px rgba(0, 0, 0, 0.4)"
  dark-md: "0 4px 8px -2px rgba(0, 0, 0, 0.5)"
  dark-lg: "0 12px 24px -6px rgba(0, 0, 0, 0.55)"
  studio-sm: "0 1px 2px rgba(0, 0, 0, 0.6)"
  studio-md: "0 4px 10px -2px rgba(0, 0, 0, 0.7)"
  studio-lg: "0 16px 32px -8px rgba(0, 0, 0, 0.8)"
elevation:
  surface: 0          # bg-page
  raised: 1           # bg / bg-card with shadow-sm
  hover: 2            # shadow-md (cards & list items on hover)
  modal: 3            # shadow-lg + scrim + 4px backdrop-filter blur
  glow-active: 4      # primary halo (Studio Dark active fragment)
motion:
  duration:
    micro: 100ms
    fast: 150ms       # default UI transitions
    base: 200ms       # buttons
    slow: 800ms       # spinners
    pulse: 1000ms     # playing indicator
    eq: 800ms-1200ms  # equalizer loader bars
  easing:
    standard: ease
    in-out: ease-in-out
    linear: linear
  transitions:
    default: "all 0.15s ease"
    button: "all 0.2s ease"
    chevron: "transform 0.15s ease"
    row-bg: "background 0.1s ease"
  keyframes:
    spin: "to { transform: rotate(360deg); }"
    eqBounce: "0% { height: 4px; } 100% { height: 22px; }"
    sp-pulse: "from { opacity: 0.4; } to { opacity: 1; }"
breakpoints:
  mobile-flag: "html.mobile"   # JS-set class triggers mobile overrides
  touch: "@media (pointer: coarse)"
  body-min-width: 320px
touch-targets:
  control-min: 36px       # compact controls (desktop)
  comfortable: 40px       # secondary actions on mobile
  primary: 44px           # primary action / WCAG touch min on mobile
  burger: 44px
icon-sizes:
  xs: 0.7rem
  sm: 0.85rem
  md: 1rem
  lg: 1.1rem
  xl: 1.25rem
  burger: 24px
z-index:
  header-overlay: 98
  mobile-nav: 99
  header: 100
  burger: 200
  modal: 1000
backdrop:
  modal-blur: 4px
mobile-rules:
  font-size-bump: 17px        # html font-size on .mobile
  min-height-button: 44px
  page-padding: 14px 12px
  header-min-height: 48px
components:
  button-base:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.text}"
    borderColor: "{colors.border}"
    border: "1px solid"
    rounded: "{rounded.pill}"
    padding: "10px 22px"
    typography: label
    transition: "{motion.transitions.button}"
    hover:
      borderColor: "{colors.primary-light}"
      backgroundColor: "{colors.primary-bg}"
      textColor: "{colors.primary}"
    focus:
      outline: "{borders.focus-ring}"
      outlineOffset: "{borders.focus-ring-offset}"
    disabled:
      opacity: 0.45
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.pill}"
    padding: "10px 22px"
    typography: label
    hover: { backgroundColor: "{colors.primary-dark}" }
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.on-danger}"
    rounded: "{rounded.pill}"
    padding: "10px 22px"
    typography: label
    hover: { backgroundColor: "{colors.danger-hover}" }
  button-icon-square:                 # sequence-player ctrl button
    width: 36px
    height: 36px
    rounded: "{rounded.sm}"
    fontSize: 1.25rem
    backgroundColor: "{colors.bg}"
    borderColor: "{colors.border}"
    textColor: "{colors.text-secondary}"
    hover:
      backgroundColor: "{colors.primary-bg}"
      borderColor: "{colors.primary-light}"
      textColor: "{colors.primary}"
    active:
      backgroundColor: "{colors.primary}"
      textColor: "{colors.on-primary}"
  button-nav:                         # header link
    background: transparent
    padding: "8px 14px"
    rounded: "{rounded.sm}"
    typography: label-sm
    color: "{colors.text-secondary}"
    hover:
      backgroundColor: "{colors.primary-bg}"
      color: "{colors.primary}"
    active:
      color: "{colors.primary}"
      fontWeight: "600"
      backgroundColor: "{colors.primary-bg}"
  card:
    backgroundColor: "{colors.bg-card}"
    borderColor: "{colors.border}"
    border: "1px solid"
    rounded: "{rounded.md}"
    padding: "14px 16px"
    boxShadow: "{shadows.sm}"
    transition: "{motion.transitions.default}"
    hover:
      boxShadow: "{shadows.md}"
      borderColor: "{colors.border-strong}"
  list-item:
    backgroundColor: "{colors.bg-card}"
    borderColor: "{colors.border}"
    border: "1px solid"
    rounded: "{rounded.md}"
    padding: "12px 16px"
    boxShadow: "{shadows.sm}"
    hover:
      borderColor: "{colors.primary-light}"
      boxShadow: "{shadows.md}"
    selected:
      backgroundColor: "{colors.primary-bg}"
      borderColor: "{colors.primary}"
      boxShadow: "{shadows.selected}"
  fragment-row:                       # editable fragment
    rounded: "{rounded.sm}"
    padding: "8px 12px"
    border: "1px solid {colors.border}"
    hover: { borderColor: "{colors.primary-light}" }
    editing:
      borderColor: "{colors.primary}"
      backgroundColor: "{colors.primary-bg}"
      boxShadow: "0 0 0 1px {colors.primary}"
  fragment-card:                      # player fragment
    rounded: "{rounded.md}"
    border: "1px solid {colors.border}"
    backgroundColor: "{colors.bg-card}"
    boxShadow: "{shadows.sm}"
    playing:
      borderColor: "{colors.primary}"
      backgroundColor: "{colors.primary-bg}"
      boxShadow: "0 0 0 1px {colors.primary}, {shadows.md}, {colors.glow-primary}"
  fragment-index-badge:               # circular numbered chip
    rounded: "{rounded.circle}"
    minWidth: 28px
    height: 28px
    backgroundColor: "{colors.primary-bg}"
    color: "{colors.primary}"
    typography: label-sm
    fontWeight: "700"
  pill-tag:                           # repeat / speed chips
    rounded: "{rounded.pill}"
    padding: "2px 6px"
    fontSize: 0.75rem
    fontWeight: "600"
    variants:
      primary:
        backgroundColor: "{colors.primary-bg}"
        color: "{colors.primary}"
      warning:
        backgroundColor: "color-mix(in srgb, {colors.warning} 18%, transparent)"
        color: "{colors.warning}"
      danger:
        backgroundColor: "{colors.danger-bg}"
        color: "{colors.danger}"
        textTransform: uppercase
        letterSpacing: 0.5px
  modal:
    backgroundColor: "{colors.bg}"
    rounded: "{rounded.lg}"
    padding: "2rem"
    boxShadow: "{shadows.lg}"
    minWidth: "min(360px, 90vw)"
    overlay:
      background: "{colors.scrim}"
      backdropFilter: "blur({backdrop.modal-blur})"
      zIndex: "{z-index.modal}"
  header:
    backgroundColor: "{colors.bg}"
    borderBottom: "1px solid {colors.border}"
    boxShadow: "{shadows.sm}"
    minHeight: 52px
    paddingX: 20px
    position: sticky
    top: 0
    zIndex: "{z-index.header}"
  segmented-toggle:                   # theme dark/light pill switch
    backgroundColor: "{colors.bg-subtle}"
    border: "1px solid {colors.border}"
    rounded: "{rounded.pill}"
    padding: 4px
    item:
      padding: "6px 14px"
      rounded: "{rounded.pill}"
      typography: label-sm
      color: "{colors.text-secondary}"
      activeBg: "{colors.primary}"
      activeColor: "{colors.on-primary}"
  progress-bar:
    height: 20px
    track:
      height: 4px
      backgroundColor: "{colors.border}"
      rounded: "{rounded.pill}"
    fill:
      backgroundColor: "{colors.primary}"
      rounded: "{rounded.pill}"
    handle:
      size: 14px
      rounded: "{rounded.circle}"
      backgroundColor: "{colors.primary}"
      border: "2px solid {colors.bg}"
      shadow: "{shadows.handle}"
    mobile:
      height: 28px
      trackHeight: 6px
      handleSize: 18px
  waveform-canvas:
    border: "1px solid {colors.border}"
    rounded: "{rounded.sm}"
    width: "100%"
  spinner:
    border: "3px solid {colors.border}"
    rounded: "{rounded.circle}"
    animation: "spin 0.8s linear infinite"
    variants:
      waveform: { size: 24px, topColor: "{colors.primary}" }
      decode:   { size: 14px, topColor: "{colors.warning}" }
      vad-detect: { size: 20px, topColor: "{colors.success}" }
      vad-trim:   { size: 20px, topColor: "{colors.warning}" }
  eq-loader:
    bars: 5
    barWidth: 4px
    barColor: "{colors.primary}"
    rounded: 2px
    height: 24px
    animation: "eqBounce 800-1200ms ease-in-out infinite alternate"
  banner-info:                        # subtitle prompt
    backgroundColor: "{colors.primary-bg}"
    border: "1px solid {colors.primary-light}"
    color: "{colors.primary-dark}"
    rounded: "{rounded.sm}"
    padding: "12px 16px"
    fontSize: 0.9rem
  banner-error:                       # error boundary fallback
    backgroundColor: "#fff7ed"
    border: "1px solid {colors.warning}"
    rounded: "{rounded.md}"
    padding: 16px
---

# LingoDrill Design System

## Brand & Personality

LingoDrill is a focused, **studio-grade workspace for repeated audio listening**. The default skin reads as **Modern Productive** — a clean, blue-on-white application surface that disappears so the user can concentrate on waveform, fragments, and subtitles. The optional **Studio Dark** skin (Neon + Dark) reframes the same product as a **DAW-inspired control surface** with cyan glow, orange highlights, and monospace timestamps.

The personality is **calm, precise, and tactile**:

- **Calm** — generous whitespace, soft shadows, no decorative chrome.
- **Precise** — tabular monospace numerals everywhere a time, percentage, or count is shown; pill-shaped controls so values feel finely tuned.
- **Tactile** — every interactive surface lifts on hover, every selection is ringed in primary, every modal blurs the world behind it.

## Theming Model

Theming runs on **two orthogonal axes** layered over CSS custom properties:

1. **Mode** — `light` or `dark` (background luminance).
2. **Color theme** — `normal` (corporate blue), `pastel` (muted teal-rose), or `neon` (saturated cyan).

This produces six combinations. Five behave as predictable variants of the default; the sixth — **`neon` × `dark`** — is the curated **Studio Dark** preset and switches font stacks (Geist + JetBrains Mono), tightens letter-spacing on headings, paints two faint radial gradients onto the page background, and enables the `glow-primary` halo on active fragments.

Switch the active surface with `data-theme` and `data-color-theme` attributes on the `html` element. All component styling reads token variables, so a theme change re-skins the entire UI without re-rendering.

## Color

The default palette is a **slate-on-white** neutral system anchored by a single primary blue used for action, selection, and brand identity:

- **Primary blue (`#1a56db`)** — the only interactive accent; used for the logo, primary buttons, active states, focus rings, selected card outlines, progress fills, and the index badge on each fragment. Hover saturates to `primary-dark`; subtle backgrounds use the very pale `primary-bg` tints.
- **Slate text ramp (`#1e293b → #94a3b8`)** — three weights of foreground (text, secondary, muted) that map to primary copy, supporting copy, and metadata respectively.
- **Slate border ramp (`#e2e8f0`, `#cbd5e1`)** — hairline default and a stronger weight reserved for hovered cards.
- **Layered surfaces (`bg`, `bg-card`, `bg-subtle`, `bg-page`)** — four near-white surfaces in tonal order, used to nest panels (control panel, vocabulary drawer, sub-modal) without resorting to extra borders.
- **Semantic (success / warning / danger / accent)** — used sparingly: green for VAD detection, amber for decoding and warnings, red for delete and disabled-fragment indicators, and an orange `accent` reserved for record/highlight moments.

Dark mode keeps the same primary but swaps the slate ramp wholesale. Pastel softens the primary to muted blue-grey and warms the page to a paper tone. Neon raises the primary to electric cyan; in dark + neon (Studio Dark), the page is `#0e1116` with cards at `#161b22`, the primary becomes `#00e5ff`, and the orange `accent` is brought forward as a highlight color.

## Typography

The system uses two font families:

- **Inter** — the default UI face. System fallbacks make first paint instant.
- **Geist** + **JetBrains Mono** — loaded once from Google Fonts and used **only in Studio Dark** for body and timestamps. The mono face is also used outside Studio Dark for any time, duration, or numeric readout.

The hierarchy is intentionally **shallow**: `h1` 28 px, `h2` ~22 px, `h3` ~18 px, body 16 px, captions ~13 px, micro 12 px. Display-scale type appears in only one place — the modal value readout (40 px, primary color, tabular numerals) used by the global speed dial.

Three rules hold across the product:

1. **Tabular numerals** (`font-variant-numeric: tabular-nums`) on every time, duration, percentage, or count, so values do not jitter as digits change.
2. **Tight letter-spacing** (`-0.02em` default, `-0.025em` headings, `-0.04em` Studio Dark logo) to give the brand its compact, technical feel.
3. **Mobile bumps the root font-size to 17 px** when the `html.mobile` class is present, scaling all `rem`-based sizes proportionally.

## Layout & Spacing

Spacing is **loosely 8-px-based but pragmatic** — small inline gaps hop in 2-px increments (2 → 4 → 6 → 8) and section gaps in 4-px increments (12 → 16 → 20 → 24). Pages use a clamped horizontal padding (`clamp(16px, 4vw, 32px)`) so content gains air on wide screens but stays edge-comfortable on phones.

Lists are **gap-stacked, not divided** — rows are bordered cards with a 6 px vertical gap rather than a flat list with separators. This keeps every row independently hoverable and makes selection legible without changing dimensions.

Headers are **sticky and horizontally scrollable on desktop**; on mobile they collapse to a 48 px bar with a 44 × 44 px burger that opens a full-width drawer. The drawer is layered above a 40-percent slate scrim and contains nested submenus with their own subtle background tint.

## Elevation & Depth

The depth model is a **four-step soft-shadow stack** layered on tonal surfaces, with a fifth glow level reserved for Studio Dark:

1. **Surface** — flat page background, no shadow.
2. **Raised (cards, list items, control inputs)** — `shadow-sm` plus a 1 px hairline border.
3. **Hover (interactive cards, primary buttons under cursor)** — `shadow-md` and a stronger border or primary-light outline.
4. **Modal** — `shadow-lg`, full-viewport scrim at 50 % slate, plus a 4 px backdrop blur. Modal corners are the largest radius (16 px).
5. **Glow (Studio Dark only)** — a 12 px cyan halo (`0 0 12px rgba(0,229,255,0.35)`) added to the active fragment card on top of the existing shadow stack.

Selected state is handled by a **1 px primary ring** (`0 0 0 1px primary`) layered with the card's normal shadow — this gives a crisp, focusable outline without offsetting the element.

Dark and Studio Dark use deeper shadow stacks (opacity 0.4 → 0.8) because over a dark page the eye reads the void rather than the lift; the heavier shadow restores apparent elevation.

## Shapes

Three radii do almost all the work:

- **`sm` (8 px)** — inline controls, inputs, waveform canvas, fragment-row borders, header nav buttons.
- **`md` (12 px)** — cards, list items, fragment cards, the error banner.
- **`lg` (16 px)** — modals only.
- **`pill` (999 px)** — every clickable chip-shaped control: buttons, progress bar, theme toggle, badge tags, primary/danger CTAs.

The pill is the system's most opinionated choice: **all primary action buttons are full pills**, even at desktop sizing. This is what gives the UI its "console" character and pairs naturally with the tabular monospace timestamps. Square 36 × 36 px buttons with `sm` rounding are reserved for the player's transport / control row, where they need to read as a contiguous toolbar rather than separate pill controls.

Circles appear in only two places: the **fragment index badge** (a 28 px primary chip with the fragment number) and the **progress-bar handle** (a 14 px primary dot ringed in the page background).

## Motion

Motion is **fast, ease-based, and purposeful** — there is no decorative animation:

- **150 ms ease** — default for hover and selection (`transition: all 0.15s ease`).
- **200 ms ease** — global button transitions, where the slightly slower curve sells the pill's color shift.
- **100 ms ease** — fragment row background hovers, where instant feedback matters.
- **150 ms ease** — chevron rotation when expanding the vocabulary drawer.

Three named keyframe animations exist:

- **`spin`** (0.8 s linear, infinite) — all spinners, color-coded by purpose: blue for waveform, amber for decode, green for VAD detection.
- **`eqBounce`** (800–1200 ms ease-in-out, alternate, infinite) — the five-bar equalizer loader shown while audio is loading.
- **`sp-pulse`** (1 s alternate, infinite) — opacity pulse on the active fragment's "playing" indicator.

Focus rings appear instantly (no transition) and are always 2 px solid primary with 2 px offset.

## Components

### Buttons

The default button is a **pill**: 1 px border, white surface, slate text. On hover it adopts the very pale `primary-bg` background, the `primary-light` border, and primary-colored text — a single coordinated color shift that signals affordance without changing geometry. **Primary** and **danger** variants are filled pills with white text and saturate to their `-dark` / `-hover` color on hover. **Header nav buttons** drop the border and pill, becoming text-button chips that pick up the same `primary-bg` tint on hover and active.

Buttons enforce a **44 px minimum touch target on mobile** (and on any pointer-coarse device) by raising padding and `min-height` regardless of the desktop sizing.

### Cards & List Items

Cards (sequence cards, audio file rows, fragment cards) share a single visual contract: white surface, `border` hairline, `radius-md`, `shadow-sm`. They lift to `shadow-md` on hover. Selection and "now playing" states layer a 1 px primary ring on top of the existing shadow and tint the surface to `primary-bg`. In Studio Dark, "playing" cards add the cyan halo on top of the ring, giving them a presence that reads from across the room — this is the system's signature moment.

### Fragments (the core unit)

A fragment is the system's atomic record: a labelled time range with optional repeat, speed, and subtitle. Its visual treatment varies by surface:

- **In the editor** — a slim row with hairline border, hoverable, selectable; editing state turns the border primary and adds the primary ring.
- **In the player** — a full card with a circular **index badge** (primary number on a tinted disc), monospace `start–end` timestamp, optional warning-tinted **repeat** chip, primary-tinted **speed** chip, danger-tinted **disabled** chip, and a subtle subtitle row below.
- **Active in playback** — primary border, primary-tinted background, and the layered ring + shadow + (in Studio Dark) cyan halo described above.

### Modals

Modals sit above a **50 % slate scrim with 4 px backdrop blur** and use the largest radius (16 px). Most modals are 360 px minimum and content-driven; the Settings modal is fixed at 560 px so the live subtitle preview reflows vertically rather than pushing the modal width when font sizes change. The Theme sub-modal is narrower (420 px) and contains a segmented pill toggle for mode and a stacked radio group for color theme.

### Player Transport

The Sequence Player ships its own **square 36 × 36 px control buttons** with `sm` corners — close to the player surface, contiguous along the row, and visually distinct from the rest of the app's pill grammar. The active control fills with primary; disabled controls drop to the danger-tinted variant. A 1 px tall, 24 px high vertical separator (`border-color`) divides logical groups inside the row.

### Inputs & Sliders

Numeric inputs are 44 × small, hairline-bordered with `sm` corners; on focus they take a primary border and a 2 px primary-bg ring. Range sliders use the browser's native track but are coerced to the primary color via `accent-color`. The progress bar is custom-built: 4 px track in `border` color, primary fill, and a 14 px primary handle ringed by the page background — the handle scales to 18 px on touch.

### Spinners & Loaders

Four ring spinners share the same 3 px ring construction but vary in size and "top" color so users can identify what is loading: blue for waveform, amber for decode, green for VAD detection, amber for VAD trim. The five-bar **equalizer loader** is reserved for whole-audio loading and animates the bar heights between 4 px and 22 px with staggered durations.

## Accessibility & Touch

- All interactive elements expose a **2 px solid primary focus ring with 2 px offset**.
- Mobile and pointer-coarse devices enforce a **44 px minimum primary target** and a 36 px minimum secondary target; the burger and modal CTAs hit 44 px exactly.
- Body text bumps from 16 px to 17 px on mobile to maintain legibility one arm's length away.
- The mobile drawer is dismissable by tapping the scrim and is always reachable from the sticky header.
- Selection and "active" state never rely on color alone — they always combine a color shift with a ring or border-weight change.

## Design Intent — what tokens cannot say

LingoDrill is built around a single repeated gesture: **press play on a fragment, listen, press again**. Every visual decision serves that loop:

- The **pill** is the gesture's shape — round, finger-shaped, frictionless.
- The **monospace timestamp** is the gesture's measure — the user must trust the numbers before they trust the action.
- The **primary halo** is the gesture's confirmation — when a fragment is playing, the UI commits to it visibly, especially in Studio Dark where the cyan glow makes the active card the unambiguous focus of the screen.
- The **soft, slow shadow stack** keeps everything else recessive, so the eye returns to the fragment list rather than wandering across chrome.

Studio Dark exists because power users will sit with this app for hours. It borrows the visual vocabulary of a digital audio workstation — slate-950 page, cyan accent, orange highlight, JetBrains Mono — to signal "this is professional tooling," not a casual web form.
