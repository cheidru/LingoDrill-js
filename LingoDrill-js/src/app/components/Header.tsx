// app/components/Header.tsx

import { useState } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { useSharedAudioEngine } from "../hooks/useSharedAudioEngine"
import { OnboardingScreen } from "./OnboardingScreen"
import {
  hasSeenOnboarding,
  setOnboardingSeen,
  getStartPage,
  setStartPage,
  getSubFontSize,
  setSubFontSize,
  getFragmentGap,
  setFragmentGap,
  getTheme,
  setTheme,
  getColorTheme,
  setColorTheme,
  SUB_FONT_SIZE_MIN,
  SUB_FONT_SIZE_MAX,
  FRAGMENT_GAP_MIN,
  FRAGMENT_GAP_MAX,
  type StartPage,
  type Theme,
  type ColorTheme,
} from "../../utils/settings"
import { useT } from "../../utils/i18n"

export function Header() {
  const navigate = useNavigate()
  const location = useLocation()
  const { selectedFile } = useSharedAudioEngine()
  const t = useT()
  const [menuOpen, setMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [themeOpen, setThemeOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(() => !hasSeenOnboarding())
  const [startPage, setStartPageState] = useState<StartPage>(getStartPage())
  const [subFontSize, setSubFontSizeState] = useState<number>(getSubFontSize())
  const [fragmentGap, setFragmentGapState] = useState<number>(getFragmentGap())
  const [themeMode, setThemeModeState] = useState<Theme>(getTheme())
  const [colorTheme, setColorThemeState] = useState<ColorTheme>(getColorTheme())

  const audioIdMatch = location.pathname.match(/\/file\/([^/]+)/)
  const audioId = audioIdMatch ? audioIdMatch[1] : selectedFile?.id ?? null

  const openAbout = () => {
    setAboutOpen(true)
    setMenuOpen(false)
  }

  const closeAbout = () => {
    setOnboardingSeen()
    setAboutOpen(false)
  }

  const closeAll = () => {
    setSettingsOpen(false)
    setThemeOpen(false)
    setMenuOpen(false)
  }

  const handleNav = (path: string) => {
    navigate(path)
    closeAll()
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

  const openSettings = () => {
    setSettingsOpen(true)
    setMenuOpen(false)
  }

  const pathIncludes = (p: string) => (p === "/" ? location.pathname === "/" : location.pathname.startsWith(p))

  return (
    <>
      <header className="header">
        <span className="header__logo">{t("app.title")}</span>

        <button
          className="header__burger"
          onClick={() => (menuOpen ? closeAll() : setMenuOpen(true))}
          aria-label={menuOpen ? t("menu.close") : t("menu.open")}
          aria-expanded={menuOpen}
        >
          <span className="header__burger-icon" aria-hidden="true">{menuOpen ? "✕" : "☰"}</span>
        </button>

        <nav className={`header__nav${menuOpen ? " header__nav--open" : ""}`}>
          <button
            onClick={() => handleNav("/")}
            className={`header__nav-btn${pathIncludes("/") ? " header__nav-btn--active" : ""}`}
          >
            {t("nav.audioLibrary")}
          </button>
          <button
            onClick={() => audioId && handleNav(`/file/${audioId}/sequences`)}
            disabled={!audioId}
            className={`header__nav-btn${audioId && pathIncludes(`/file/${audioId}/sequences`) ? " header__nav-btn--active" : ""}${!audioId ? " header__nav-btn--disabled" : ""}`}
          >
            {t("nav.fragmentLibrary")}
          </button>
          <button
            onClick={() => handleNav("/favourites")}
            className={`header__nav-btn${pathIncludes("/favourites") ? " header__nav-btn--active" : ""}`}
          >
            {t("nav.favourites")}
          </button>
          <button
            onClick={openSettings}
            className="header__nav-btn"
          >
            {t("nav.settings")}
          </button>
          <button
            onClick={openAbout}
            className="header__nav-btn"
          >
            {t("nav.about")}
          </button>
        </nav>
      </header>
      {menuOpen && (
        <div className="header__overlay" onClick={closeAll} aria-hidden="true" />
      )}

      {settingsOpen && (
        <div className="modal-overlay" onClick={() => setSettingsOpen(false)}>
          <div className="modal-box modal-box--wide settings-modal" onClick={e => e.stopPropagation()}>
            <h3 className="settings-modal__title">{t("settings.title")}</h3>

            <div className="settings-row">
              <label className="settings-row__label" htmlFor="settings-modal-start-page">{t("settings.startPage")}</label>
              <select
                id="settings-modal-start-page"
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
                <button onClick={() => setThemeOpen(true)} aria-label={t("settings.theme.open")}>
                  {themeMode === "dark" ? t("settings.theme.dark") : t("settings.theme.light")}
                  {" · "}
                  {t(`settings.theme.${colorTheme}`)}
                </button>
              </div>
            </div>

            <div className="settings-row">
              <label className="settings-row__label" htmlFor="settings-modal-fragment-gap">{t("settings.fragmentGap")}</label>
              <div className="settings-row__control settings-row__control--inline">
                <input
                  id="settings-modal-fragment-gap"
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
              <label className="settings-row__label" htmlFor="settings-modal-sub-font-size">{t("settings.subFontSize")}</label>
              <div className="settings-row__control settings-row__control--inline">
                <input
                  id="settings-modal-sub-font-size"
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
                <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>example.srt</div>
                <div style={{ fontSize: "var(--sub-font-size, 14px)", whiteSpace: "pre-wrap", lineHeight: 1.5, color: "var(--color-text)" }}>
                  The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog. The quick brown fox jumps over the lazy dog.
                </div>
              </div>
            </div>

            <div className="modal-actions">
              <button onClick={() => setSettingsOpen(false)}>{t("common.close")}</button>
            </div>
          </div>
        </div>
      )}

      {themeOpen && (
        <div className="modal-overlay" onClick={() => setThemeOpen(false)}>
          <div className="modal-box theme-modal" onClick={e => e.stopPropagation()} style={{ textAlign: "left" }}>
            <h3 style={{ marginTop: 0 }}>{t("settings.theme.title")}</h3>

            <div className="settings-row">
              <label className="settings-row__label">{t("settings.theme.mode")}</label>
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

            <div className="settings-row" style={{ alignItems: "flex-start" }}>
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

            <div className="modal-actions">
              <button onClick={() => setThemeOpen(false)}>{t("common.close")}</button>
            </div>
          </div>
        </div>
      )}

      {aboutOpen && <OnboardingScreen onClose={closeAbout} />}
    </>
  )
}
