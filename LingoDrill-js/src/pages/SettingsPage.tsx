// pages/SettingsPage.tsx
//
// Every app-wide preference lives here. Previously this was a modal opened
// from the header (with the theme controls nested in a second modal on top);
// both are now rows on this page, grouped into cards by topic.

import { useState } from "react"
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
  getBgPattern,
  setBgPattern,
  getBgGround,
  setBgGround,
  getBgTint,
  setBgTint,
  AVAILABLE_BG_PATTERNS,
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
  type BgPattern,
  type BgGround,
  type BgTint,
} from "../utils/settings"
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
  const [language, setLanguageState] = useState<Language>(getLanguage())
  const [startPage, setStartPageState] = useState<StartPage>(getStartPage())
  const [subFontSize, setSubFontSizeState] = useState<number>(getSubFontSize())
  const [fragmentGap, setFragmentGapState] = useState<number>(getFragmentGap())
  const [trimSilenceGap, setTrimSilenceGapState] = useState<number>(getTrimSilenceGap())
  const [themeMode, setThemeModeState] = useState<Theme>(getTheme())
  const [colorTheme, setColorThemeState] = useState<ColorTheme>(getColorTheme())
  const [bgPattern, setBgPatternState] = useState<BgPattern>(getBgPattern())
  const [bgGround, setBgGroundState] = useState<BgGround>(getBgGround())
  const [bgTint, setBgTintState] = useState<BgTint>(getBgTint())

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
  const onBgPatternChange = (v: BgPattern) => {
    setBgPatternState(v)
    setBgPattern(v)
  }
  const onBgGroundChange = (v: BgGround) => {
    setBgGroundState(v)
    setBgGround(v)
  }
  const onBgTintChange = (v: BgTint) => {
    setBgTintState(v)
    setBgTint(v)
  }

  const trimGapIsDefault = trimSilenceGap === DEFAULT_TRIM_SILENCE_GAP

  return (
    <div className="page settings-page">
      <h2 className="settings-page__title">{t("settings.title")}</h2>

      {/* General first, because changing the language relabels everything below. */}
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
            <div className="settings-row__control">
              <div className="settings-swatches">
                <label className={`settings-swatch${bgTint === DEFAULT_BG_TINT ? " settings-swatch--active" : ""}`}>
                  <input
                    type="radio"
                    name="lingodrill-bg-tint"
                    value={DEFAULT_BG_TINT}
                    checked={bgTint === DEFAULT_BG_TINT}
                    onChange={() => onBgTintChange(DEFAULT_BG_TINT)}
                  />
                  <span className="settings-swatch__dot settings-swatch__dot--tint-default" />
                  {t("settings.bgTint.default")}
                </label>
                {/* The colour input is hidden like the radios are — the chip is
                    the control, and clicking it opens the platform picker. The
                    dot shows the ground the pick actually produced once it has
                    been normalised, which is rarely the raw colour chosen. */}
                <label className={`settings-swatch${bgTint === DEFAULT_BG_TINT ? "" : " settings-swatch--active"}`}>
                  <input
                    type="color"
                    value={bgTint === DEFAULT_BG_TINT ? DEFAULT_TINT_COLOR : bgTint}
                    onChange={e => onBgTintChange(e.target.value)}
                  />
                  <span
                    className={`settings-swatch__dot settings-swatch__dot--tint-${bgTint === DEFAULT_BG_TINT ? "pick" : "custom"}`}
                  />
                  {t("settings.bgTint.custom")}
                </label>
              </div>
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-row__text">
              <span className="settings-row__label">{t("settings.bgPattern")}</span>
              <span className="settings-row__hint">{t("settings.bgPattern.hint")}</span>
            </div>
            <div className="settings-row__control">
              <div className="settings-swatches">
                {AVAILABLE_BG_PATTERNS.map(opt => (
                  <label
                    key={opt}
                    className={`settings-swatch${bgPattern === opt ? " settings-swatch--active" : ""}`}
                  >
                    <input
                      type="radio"
                      name="lingodrill-bg-pattern"
                      value={opt}
                      checked={bgPattern === opt}
                      onChange={() => onBgPatternChange(opt)}
                    />
                    <span className={`settings-swatch__dot settings-swatch__dot--pattern-${opt}`} />
                    {t(`settings.bgPattern.${opt}`)}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-row__text">
              <span className="settings-row__label">{t("settings.bgGround")}</span>
              <span className="settings-row__hint">{t("settings.bgGround.hint")}</span>
            </div>
            <div className="settings-row__control">
              <div className="settings-seg" role="group" aria-label={t("settings.bgGround")}>
                {(["plain", "gradient"] as BgGround[]).map(opt => (
                  <button
                    key={opt}
                    type="button"
                    className={`settings-seg__btn${bgGround === opt ? " settings-seg__btn--active" : ""}`}
                    onClick={() => onBgGroundChange(opt)}
                    aria-pressed={bgGround === opt}
                  >
                    {t(`settings.bgGround.${opt}`)}
                  </button>
                ))}
              </div>
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
    </div>
  )
}
