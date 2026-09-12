// pages/SettingsPage.tsx
//
// Every app-wide preference lives here. Previously this was a modal opened
// from the header (with the theme controls nested in a second modal on top);
// both are now rows on this page, grouped into cards by topic.
//
// The topics are also the menu: the Settings tab in the header lists them and
// each one is its own route (/settings/general, …), so this component renders
// a single section — the one named by the URL — rather than the whole page.
// The preference state stays here, shared by all three, because it is a handful
// of useStates and splitting it per section would only duplicate the plumbing.

import { useEffect, useState } from "react"
import { Navigate, useNavigate, useParams } from "react-router-dom"
import {
  getStartPage,
  setStartPage,
  getSubFontSize,
  setSubFontSize,
  getFragmentGap,
  setFragmentGap,
  getTrimSilenceGap,
  setTrimSilenceGap,
  getLanguage,
  setLanguage,
  AVAILABLE_LANGUAGES,
  getTheme,
  setTheme,
  getColorTheme,
  setColorTheme,
  isSettingsSection,
  DEFAULT_SETTINGS_SECTION,
  getBgPattern,
  getBgTint,
  setBgTint,
  BG_PATTERN_NONE,
  DEFAULT_BG_TINT,
  DEFAULT_TINT_COLOR,
  SUB_FONT_SIZE_MIN,
  SUB_FONT_SIZE_MAX,
  FRAGMENT_GAP_MIN,
  FRAGMENT_GAP_MAX,
  TRIM_SILENCE_GAP_MIN,
  TRIM_SILENCE_GAP_MAX,
  DEFAULT_TRIM_SILENCE_GAP,
  type StartPage,
  type Language,
  type Theme,
  type ColorTheme,
  type BgTint,
} from "../utils/settings"
import { IndexedDBBackgroundStorage } from "../infrastructure/indexeddb/IndexedDBBackgroundStorage"
import { useT } from "../utils/i18n"

/* Arrow curling back on itself — "put this back the way it was". */
const ResetIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M3 12a9 9 0 1 0 3.2-6.9L3 8" />
    <path d="M3 3v5h5" />
  </svg>
)

export function SettingsPage() {
  const t = useT()
  const navigate = useNavigate()
  const { section } = useParams()
  const [language, setLanguageState] = useState<Language>(getLanguage())
  const [startPage, setStartPageState] = useState<StartPage>(getStartPage())
  const [subFontSize, setSubFontSizeState] = useState<number>(getSubFontSize())
  const [fragmentGap, setFragmentGapState] = useState<number>(getFragmentGap())
  const [trimSilenceGap, setTrimSilenceGapState] = useState<number>(getTrimSilenceGap())
  const [themeMode, setThemeModeState] = useState<Theme>(getTheme())
  const [colorTheme, setColorThemeState] = useState<ColorTheme>(getColorTheme())
  const [bgTint, setBgTintState] = useState<BgTint>(getBgTint())
  /* Which background is selected is a setting; what it is *called* is not — the
     name lives with the background in IndexedDB, so the row reads it once and
     says "none" until it arrives. The id is read at mount because that is when
     it can change: choosing a background remounts this page on the way back. */
  const [bgPatternId] = useState<string>(getBgPattern)
  const [bgPatternName, setBgPatternName] = useState<string | null>(null)

  /* setLanguage fires lingodrill:languagechange, which is what re-renders every
     useT consumer — including this page, so the labels switch under the cursor
     without a reload. */
  const onLanguageChange = (v: Language) => {
    setLanguageState(v)
    setLanguage(v)
  }
  const onStartPageChange = (v: StartPage) => {
    setStartPageState(v)
    setStartPage(v)
  }
  const onSubFontSizeChange = (n: number) => {
    setSubFontSizeState(n)
    setSubFontSize(n)
  }
  const onFragmentGapChange = (n: number) => {
    setFragmentGapState(n)
    setFragmentGap(n)
  }
  const onTrimSilenceGapChange = (n: number) => {
    setTrimSilenceGapState(n)
    setTrimSilenceGap(n)
  }
  const onThemeChange = (v: Theme) => {
    setThemeModeState(v)
    setTheme(v)
  }
  const onColorThemeChange = (v: ColorTheme) => {
    setColorThemeState(v)
    setColorTheme(v)
  }
  const onBgTintChange = (v: BgTint) => {
    setBgTintState(v)
    setBgTint(v)
  }

  useEffect(() => {
    if (section !== "appearance" || bgPatternId === BG_PATTERN_NONE) return
    let cancelled = false
    void new IndexedDBBackgroundStorage().get(bgPatternId).then(bg => {
      if (!cancelled) setBgPatternName(bg?.name ?? null)
    })
    return () => { cancelled = true }
  }, [section, bgPatternId])

  const trimGapIsDefault = trimSilenceGap === DEFAULT_TRIM_SILENCE_GAP
  const tintIsDefault = bgTint === DEFAULT_BG_TINT

  /* A stale bookmark or a typed URL must not land on a blank page: anything
     that is not one of the three sections is sent to the first one. */
  if (!isSettingsSection(section)) {
    return <Navigate to={`/settings/${DEFAULT_SETTINGS_SECTION}`} replace />
  }

  return (
    <div className="page settings-page">
      <h2 className="settings-page__title">{t("settings.title")}</h2>

      {section === "general" && (
        <section className="settings-group">
          <h3 className="settings-group__title">{t("settings.section.general")}</h3>
          <div className="settings-card">
            <div className="settings-row">
              <div className="settings-row__text">
                <label className="settings-row__label" htmlFor="settings-language">{t("settings.language")}</label>
                <span className="settings-row__hint">{t("settings.language.hint")}</span>
              </div>
              <div className="settings-row__control">
                <select
                  id="settings-language"
                  className="settings-select"
                  value={language}
                  onChange={e => onLanguageChange(e.target.value as Language)}
                >
                  {AVAILABLE_LANGUAGES.map(code => (
                    <option key={code} value={code}>{t(`settings.language.${code}`)}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="settings-row">
              <div className="settings-row__text">
                <label className="settings-row__label" htmlFor="settings-start-page">{t("settings.startPage")}</label>
                <span className="settings-row__hint">{t("settings.startPage.hint")}</span>
              </div>
              <div className="settings-row__control">
                <select
                  id="settings-start-page"
                  className="settings-select"
                  value={startPage}
                  onChange={e => onStartPageChange(e.target.value as StartPage)}
                >
                  <option value="library">{t("settings.startPage.library")}</option>
                  <option value="favourites">{t("settings.startPage.favourites")}</option>
                  <option value="last-sequence">{t("settings.startPage.lastSequence")}</option>
                </select>
              </div>
            </div>
          </div>
        </section>
      )}

      {section === "appearance" && (
        <section className="settings-group">
          <h3 className="settings-group__title">{t("settings.section.appearance")}</h3>
          <div className="settings-card">
            <div className="settings-row">
              <div className="settings-row__text">
                <span className="settings-row__label">{t("settings.theme")}</span>
                <span className="settings-row__hint">{t("settings.theme.hint")}</span>
              </div>
              <div className="settings-row__control">
                <div className="settings-seg" role="group" aria-label={t("settings.theme.mode")}>
                  <button
                    type="button"
                    className={`settings-seg__btn${themeMode === "light" ? " settings-seg__btn--active" : ""}`}
                    onClick={() => onThemeChange("light")}
                    aria-pressed={themeMode === "light"}
                  >
                    <span className="settings-seg__icon">☀</span>
                    {t("settings.theme.light")}
                  </button>
                  <button
                    type="button"
                    className={`settings-seg__btn${themeMode === "dark" ? " settings-seg__btn--active" : ""}`}
                    onClick={() => onThemeChange("dark")}
                    aria-pressed={themeMode === "dark"}
                  >
                    <span className="settings-seg__icon">🌙</span>
                    {t("settings.theme.dark")}
                  </button>
                </div>
              </div>
            </div>

            <div className="settings-row">
              <div className="settings-row__text">
                <span className="settings-row__label">{t("settings.theme.colorTheme")}</span>
                <span className="settings-row__hint">{t("settings.theme.colorTheme.hint")}</span>
              </div>
              <div className="settings-row__control">
                <div className="settings-swatches">
                  {(["normal", "pastel", "neon"] as ColorTheme[]).map(opt => (
                    <label
                      key={opt}
                      className={`settings-swatch${colorTheme === opt ? " settings-swatch--active" : ""}`}
                    >
                      <input
                        type="radio"
                        name="lingodrill-color-theme"
                        value={opt}
                        checked={colorTheme === opt}
                        onChange={() => onColorThemeChange(opt)}
                      />
                      <span className={`settings-swatch__dot settings-swatch__dot--${opt}`} />
                      {t(`settings.theme.${opt}`)}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="settings-row">
              <div className="settings-row__text">
                <span className="settings-row__label">{t("settings.bgTint")}</span>
                <span className="settings-row__hint">{t("settings.bgTint.hint")}</span>
              </div>
              <div className="settings-row__control settings-slider-row">
                {/* The colour input is hidden the way the radios elsewhere are —
                    the chip is the control, and clicking it opens the platform
                    picker. The dot shows the ground the pick actually produced
                    once normalised, which is rarely the raw colour chosen. */}
                <label className={`settings-swatch${tintIsDefault ? "" : " settings-swatch--active"}`}>
                  <input
                    type="color"
                    value={tintIsDefault ? DEFAULT_TINT_COLOR : bgTint}
                    onChange={e => onBgTintChange(e.target.value)}
                  />
                  <span
                    className={`settings-swatch__dot settings-swatch__dot--tint-${tintIsDefault ? "pick" : "custom"}`}
                  />
                  {t("settings.bgTint.custom")}
                </label>
                {/* Going back to the theme's own colour is an undo, not a third
                    colour to choose between — so it is the same reset icon the
                    sliders use, disabled while there is nothing to undo. */}
                <button
                  type="button"
                  className="settings-reset"
                  onClick={() => onBgTintChange(DEFAULT_BG_TINT)}
                  disabled={tintIsDefault}
                  title={t("settings.bgTint.default")}
                  aria-label={t("settings.bgTint.default")}
                >
                  <ResetIcon />
                </button>
              </div>
            </div>
  
            <div className="settings-row">
              <div className="settings-row__text">
                <span className="settings-row__label">{t("settings.bgPattern")}</span>
                <span className="settings-row__hint">{t("settings.bgPattern.hint")}</span>
              </div>
              {/* Which backgrounds exist is the user's business now, so this row
                  no longer lists them — it says which one is on and opens the
                  page where they are made, chosen and thrown away. */}
              <div className="settings-row__control settings-slider-row">
                <span className="settings-value settings-value--wide">
                  {bgPatternId !== BG_PATTERN_NONE && bgPatternName
                    ? t("settings.bgPattern.current", { name: bgPatternName })
                    : t("settings.bgPattern.none")}
                </span>
                <button
                  type="button"
                  className="settings-seg__btn settings-seg__btn--standalone"
                  onClick={() => navigate("/settings/appearance/backgrounds")}
                >
                  {t("settings.bgPattern.select")}
                </button>
              </div>
            </div>

            <div className="settings-row settings-row--stacked">
              <div className="settings-row__text">
                <label className="settings-row__label" htmlFor="settings-sub-font-size">{t("settings.subFontSize")}</label>
                <span className="settings-row__hint">{t("settings.subFontSize.hint")}</span>
              </div>
              <div className="settings-row__control settings-slider-row">
                <input
                  id="settings-sub-font-size"
                  className="settings-slider"
                  type="range"
                  min={SUB_FONT_SIZE_MIN}
                  max={SUB_FONT_SIZE_MAX}
                  step={1}
                  value={subFontSize}
                  onChange={e => onSubFontSizeChange(parseInt(e.target.value, 10))}
                />
                <output className="settings-value" htmlFor="settings-sub-font-size">{subFontSize}px</output>
              </div>
            </div>

            <div className="settings-row settings-row--preview">
              <div className="settings-preview">
                <div className="settings-preview__label">{t("settings.preview")}</div>
                <div className="sp-subtitle-display">
                  <div className="settings-preview__file">{t("settings.preview.file")}</div>
                  <div className="settings-preview__text">{t("settings.preview.text")}</div>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {section === "playback" && (
        <section className="settings-group">
          <h3 className="settings-group__title">{t("settings.section.playback")}</h3>
          <div className="settings-card">
            <div className="settings-row settings-row--stacked">
              <div className="settings-row__text">
                <label className="settings-row__label" htmlFor="settings-fragment-gap">{t("settings.fragmentGap")}</label>
                <span className="settings-row__hint">{t("settings.fragmentGap.hint")}</span>
              </div>
              <div className="settings-row__control settings-slider-row">
                <input
                  id="settings-fragment-gap"
                  className="settings-slider"
                  type="range"
                  min={FRAGMENT_GAP_MIN}
                  max={FRAGMENT_GAP_MAX}
                  step={0.5}
                  value={fragmentGap}
                  onChange={e => onFragmentGapChange(parseFloat(e.target.value))}
                />
                <output className="settings-value" htmlFor="settings-fragment-gap">{fragmentGap.toFixed(1)}s</output>
              </div>
            </div>

            <div className="settings-row settings-row--stacked">
              <div className="settings-row__text">
                <label className="settings-row__label" htmlFor="settings-trim-silence-gap">{t("settings.trimSilenceGap")}</label>
                <span className="settings-row__hint">{t("settings.trimSilenceGap.hint")}</span>
              </div>
              <div className="settings-row__control settings-slider-row">
                <input
                  id="settings-trim-silence-gap"
                  className="settings-slider"
                  type="range"
                  min={TRIM_SILENCE_GAP_MIN}
                  max={TRIM_SILENCE_GAP_MAX}
                  step={0.5}
                  value={trimSilenceGap}
                  onChange={e => onTrimSilenceGapChange(parseFloat(e.target.value))}
                />
                <output className="settings-value" htmlFor="settings-trim-silence-gap">{trimSilenceGap.toFixed(1)}s</output>
                {/* Disabled while the value already is the default, so the icon
                    doubles as an indicator that nothing has been changed. */}
                <button
                  type="button"
                  className="settings-reset"
                  onClick={() => onTrimSilenceGapChange(DEFAULT_TRIM_SILENCE_GAP)}
                  disabled={trimGapIsDefault}
                  title={t("settings.resetDefault")}
                  aria-label={t("settings.resetDefault")}
                >
                  <ResetIcon />
                </button>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
