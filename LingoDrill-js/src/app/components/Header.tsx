// app/components/Header.tsx

import { useState, useEffect } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { useSharedAudioEngine } from "../hooks/useSharedAudioEngine"
import {
  getStartPage,
  setStartPage,
  getSubFontSize,
  setSubFontSize,
  SUB_FONT_SIZE_MIN,
  SUB_FONT_SIZE_MAX,
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

  const audioIdMatch = location.pathname.match(/\/file\/([^/]+)/)
  const audioId = audioIdMatch ? audioIdMatch[1] : selectedFile?.id ?? null

  useEffect(() => {
    setSettingsOpen(false)
  }, [menuOpen])

  const closeAll = () => {
    setSettingsOpen(false)
    setMenuOpen(false)
  }

  const openMenu = () => {
    setSettingsOpen(false)
    setMenuOpen(true)
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

  const pathIncludes = (p: string) => (p === "/" ? location.pathname === "/" : location.pathname.startsWith(p))

  return (
    <>
      <header className="header">
        <span className="header__logo">LingoDrill</span>

        <button
          className="header__burger"
          onClick={() => (menuOpen ? closeAll() : openMenu())}
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
            onClick={() => setSettingsOpen(v => !v)}
            className={`header__nav-btn header__nav-btn--expandable${settingsOpen ? " header__nav-btn--expanded" : ""}`}
            aria-expanded={settingsOpen}
          >
            Settings
            <span className="header__nav-chevron" aria-hidden="true">{settingsOpen ? "▾" : "▸"}</span>
          </button>
          {settingsOpen && (
            <div className="header__submenu">
              <div className="header__submenu-row">
                <label className="header__submenu-label" htmlFor="hdr-start-page">Start page</label>
                <select
                  id="hdr-start-page"
                  value={startPage}
                  onChange={e => onStartPageChange(e.target.value as StartPage)}
                  className="header__submenu-control"
                >
                  <option value="library">Audio Library</option>
                  <option value="favourites">Favourites</option>
                  <option value="last-sequence">Last sequence</option>
                </select>
              </div>
              <div className="header__submenu-row">
                <label className="header__submenu-label" htmlFor="hdr-sub-font-size">Sub font size</label>
                <div className="header__submenu-control header__submenu-control--inline">
                  <input
                    id="hdr-sub-font-size"
                    type="range"
                    min={SUB_FONT_SIZE_MIN}
                    max={SUB_FONT_SIZE_MAX}
                    step={1}
                    value={subFontSize}
                    onChange={e => onSubFontSizeChange(parseInt(e.target.value, 10))}
                  />
                  <span className="header__submenu-value">{subFontSize}px</span>
                </div>
              </div>
              <div className="header__submenu-preview">
                <div className="header__submenu-preview-label">Preview</div>
                <div className="sp-subtitle-display">
                  <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>example.srt</div>
                  <div style={{ fontSize: "var(--sub-font-size, 14px)", whiteSpace: "pre-wrap", lineHeight: 1.5, color: "var(--color-text)" }}>
                    The quick brown fox jumps over the lazy dog.
                  </div>
                </div>
              </div>
            </div>
          )}
          <button disabled className="header__nav-btn header__nav-btn--disabled">
            About
          </button>
        </nav>
      </header>
      {menuOpen && (
        <div className="header__overlay" onClick={closeAll} aria-hidden="true" />
      )}
    </>
  )
}
