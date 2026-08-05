// pages/SettingsPage.tsx
//
// Every app-wide preference lives here. Previously this was a modal opened
// from the header (with the theme controls nested in a second modal on top);
// both are now rows on this page.

import { useState } from "react"
import {
  getStartPage,
  setStartPage,
  getSubFontSize,
  setSubFontSize,
  getFragmentGap,
  setFragmentGap,
  getLanguage,
  setLanguage,
  AVAILABLE_LANGUAGES,
  getTheme,
  setTheme,
  getColorTheme,
  setColorTheme,
  SUB_FONT_SIZE_MIN,
  SUB_FONT_SIZE_MAX,
  FRAGMENT_GAP_MIN,
  FRAGMENT_GAP_MAX,
  type StartPage,
  type Language,
  type Theme,
  type ColorTheme,
} from "../utils/settings"
import { useT } from "../utils/i18n"

export function SettingsPage() {
  const t = useT()
  const [language, setLanguageState] = useState<Language>(getLanguage())
  const [startPage, setStartPageState] = useState<StartPage>(getStartPage())
  const [subFontSize, setSubFontSizeState] = useState<number>(getSubFontSize())
  const [fragmentGap, setFragmentGapState] = useState<number>(getFragmentGap())
  const [themeMode, setThemeModeState] = useState<Theme>(getTheme())
  const [colorTheme, setColorThemeState] = useState<ColorTheme>(getColorTheme())

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
  const onThemeChange = (v: Theme) => {
    setThemeModeState(v)
    setTheme(v)
  }
  const onColorThemeChange = (v: ColorTheme) => {
    setColorThemeState(v)
    setColorTheme(v)
  }

  return (
    <div className="page settings-page">
      <h2>{t("settings.title")}</h2>

      {/* First, because changing it relabels every row below. */}
      <div className="settings-row">
        <label className="settings-row__label" htmlFor="settings-language">{t("settings.language")}</label>
        <select
          id="settings-language"
          value={language}
          onChange={e => onLanguageChange(e.target.value as Language)}
          className="settings-row__control"
        >
          {AVAILABLE_LANGUAGES.map(code => (
            <option key={code} value={code}>{t(`settings.language.${code}`)}</option>
          ))}
        </select>
      </div>

      <div className="settings-row">
        <label className="settings-row__label" htmlFor="settings-start-page">{t("settings.startPage")}</label>
        <select
          id="settings-start-page"
          value={startPage}
          onChange={e => onStartPageChange(e.target.value as StartPage)}
          className="settings-row__control"
        >
          <option value="library">{t("settings.startPage.library")}</option>
          <option value="favourites">{t("settings.startPage.favourites")}</option>
          <option value="last-sequence">{t("settings.startPage.lastSequence")}</option>
        </select>
      </div>

      <div className="settings-row">
        <label className="settings-row__label">{t("settings.theme")}</label>
        <div className="settings-row__control">
          <div className="theme-toggle" role="group" aria-label={t("settings.theme.mode")}>
            <button
              type="button"
              className={`theme-toggle__btn${themeMode === "light" ? " theme-toggle__btn--active" : ""}`}
              onClick={() => onThemeChange("light")}
            >
              ☀ {t("settings.theme.light")}
            </button>
            <button
              type="button"
              className={`theme-toggle__btn${themeMode === "dark" ? " theme-toggle__btn--active" : ""}`}
              onClick={() => onThemeChange("dark")}
            >
              🌙 {t("settings.theme.dark")}
            </button>
          </div>
        </div>
      </div>

      <div className="settings-row settings-row--top">
        <label className="settings-row__label">{t("settings.theme.colorTheme")}</label>
        <div className="settings-row__control">
          <div className="theme-radios">
            {(["normal", "pastel", "neon"] as ColorTheme[]).map(opt => (
              <label key={opt} className="theme-radios__option">
                <input
                  type="radio"
                  name="lingodrill-color-theme"
                  value={opt}
                  checked={colorTheme === opt}
                  onChange={() => onColorThemeChange(opt)}
                />
                {t(`settings.theme.${opt}`)}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="settings-row">
        <label className="settings-row__label" htmlFor="settings-fragment-gap">{t("settings.fragmentGap")}</label>
        <div className="settings-row__control settings-row__control--inline">
          <input
            id="settings-fragment-gap"
            type="range"
            min={FRAGMENT_GAP_MIN}
            max={FRAGMENT_GAP_MAX}
            step={0.5}
            value={fragmentGap}
            onChange={e => onFragmentGapChange(parseFloat(e.target.value))}
          />
          <span className="settings-row__value">{fragmentGap.toFixed(1)}s</span>
        </div>
      </div>

      <div className="settings-row">
        <label className="settings-row__label" htmlFor="settings-sub-font-size">{t("settings.subFontSize")}</label>
        <div className="settings-row__control settings-row__control--inline">
          <input
            id="settings-sub-font-size"
            type="range"
            min={SUB_FONT_SIZE_MIN}
            max={SUB_FONT_SIZE_MAX}
            step={1}
            value={subFontSize}
            onChange={e => onSubFontSizeChange(parseInt(e.target.value, 10))}
          />
          <span className="settings-row__value">{subFontSize}px</span>
        </div>
      </div>

      <div className="settings-preview">
        <div className="settings-preview__label">{t("settings.preview")}</div>
        <div className="sp-subtitle-display">
          <div className="settings-preview__file">example.srt</div>
          <div className="settings-preview__text">
            The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog.
          </div>
        </div>
      </div>
    </div>
  )
}
