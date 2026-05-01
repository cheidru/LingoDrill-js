// app/components/Header.tsx

import { useState, useEffect } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { useSharedAudioEngine } from "../hooks/useSharedAudioEngine"
import {
  getStartPage,
  setStartPage,
  getSubFontSize,
  setSubFontSize,
  getFragmentGap,
  setFragmentGap,
  SUB_FONT_SIZE_MIN,
  SUB_FONT_SIZE_MAX,
  FRAGMENT_GAP_MIN,
  FRAGMENT_GAP_MAX,
  type StartPage,
} from "../../utils/settings"

export function Header() {
  const navigate = useNavigate()
  const location = useLocation()
  const { selectedFile } = useSharedAudioEngine()
  const [menuOpen, setMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [startPage, setStartPageState] = useState<StartPage>(getStartPage())
  const [subFontSize, setSubFontSizeState] = useState<number>(getSubFontSize())
  const [fragmentGap, setFragmentGapState] = useState<number>(getFragmentGap())

  const audioIdMatch = location.pathname.match(/\/file\/([^/]+)/)
  const audioId = audioIdMatch ? audioIdMatch[1] : selectedFile?.id ?? null

  useEffect(() => {
    if (!menuOpen) setSettingsOpen(false)
  }, [menuOpen])

  const closeAll = () => {
    setSettingsOpen(false)
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

  const openSettings = () => {
    setSettingsOpen(true)
    setMenuOpen(false)
  }

  const pathIncludes = (p: string) => (p === "/" ? location.pathname === "/" : location.pathname.startsWith(p))

  return (
    <>
      <header className="header">
        <span className="header__logo">LingoDrill</span>

        <button
          className="header__burger"
          onClick={() => (menuOpen ? closeAll() : setMenuOpen(true))}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
        >
          <span className="header__burger-icon" aria-hidden="true">{menuOpen ? "✕" : "☰"}</span>
        </button>

        <nav className={`header__nav${menuOpen ? " header__nav--open" : ""}`}>
          <button
            onClick={() => handleNav("/")}
            className={`header__nav-btn${pathIncludes("/") ? " header__nav-btn--active" : ""}`}
          >
            Audio Library
          </button>
          <button
            onClick={() => audioId && handleNav(`/file/${audioId}/sequences`)}
            disabled={!audioId}
            className={`header__nav-btn${audioId && pathIncludes(`/file/${audioId}/sequences`) ? " header__nav-btn--active" : ""}${!audioId ? " header__nav-btn--disabled" : ""}`}
          >
            Fragment Library
          </button>
          <button
            onClick={() => handleNav("/favourites")}
            className={`header__nav-btn${pathIncludes("/favourites") ? " header__nav-btn--active" : ""}`}
          >
            Favourites
          </button>
          <button
            onClick={openSettings}
            className="header__nav-btn"
          >
            Settings
          </button>
          <button disabled className="header__nav-btn header__nav-btn--disabled">
            About
          </button>
        </nav>
      </header>
      {menuOpen && (
        <div className="header__overlay" onClick={closeAll} aria-hidden="true" />
      )}

      {settingsOpen && (
        <div className="modal-overlay" onClick={() => setSettingsOpen(false)}>
          <div className="modal-box modal-box--wide settings-modal" onClick={e => e.stopPropagation()}>
            <h3 className="settings-modal__title">Settings</h3>

            <div className="settings-row">
              <label className="settings-row__label" htmlFor="settings-modal-start-page">Start page</label>
              <select
                id="settings-modal-start-page"
                value={startPage}
                onChange={e => onStartPageChange(e.target.value as StartPage)}
                className="settings-row__control"
              >
                <option value="library">Audio Library</option>
                <option value="favourites">Favourites</option>
                <option value="last-sequence">Last sequence</option>
              </select>
            </div>

            <div className="settings-row">
              <label className="settings-row__label" htmlFor="settings-modal-fragment-gap">Fragment gap</label>
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
              <label className="settings-row__label" htmlFor="settings-modal-sub-font-size">Sub font size</label>
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
              <div className="settings-preview__label">Subtitle preview</div>
              <div className="sp-subtitle-display">
                <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>example.srt</div>
                <div style={{ fontSize: "var(--sub-font-size, 14px)", whiteSpace: "pre-wrap", lineHeight: 1.5, color: "var(--color-text)" }}>
                  The quick brown fox jumps over the lazy dog.
                </div>
              </div>
            </div>

            <div className="modal-actions">
              <button onClick={() => setSettingsOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
