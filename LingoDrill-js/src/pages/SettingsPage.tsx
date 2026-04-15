import { useState } from "react"
import {
  getStartPage,
  setStartPage,
  getSubFontSize,
  setSubFontSize,
  SUB_FONT_SIZE_MIN,
  SUB_FONT_SIZE_MAX,
  type StartPage,
} from "../utils/settings"

export function SettingsPage() {
  const [startPage, setStartPageState] = useState<StartPage>(getStartPage())
  const [subFontSize, setSubFontSizeState] = useState<number>(getSubFontSize())

  const onStartPageChange = (v: StartPage) => {
    setStartPageState(v)
    setStartPage(v)
  }
  const onSubFontSizeChange = (n: number) => {
    setSubFontSizeState(n)
    setSubFontSize(n)
  }

  return (
    <div className="page">
      <h2>Settings</h2>

      <div className="settings-row">
        <label className="settings-row__label" htmlFor="settings-start-page">Start page</label>
        <select
          id="settings-start-page"
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
        <label className="settings-row__label" htmlFor="settings-sub-font-size">
          Sub font size
        </label>
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
        <div className="settings-preview__label">Preview:</div>
        <div className="sp-subtitle-display">
          <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>example.srt</div>
          <div style={{ fontSize: "var(--sub-font-size, 14px)", whiteSpace: "pre-wrap", lineHeight: 1.5, color: "var(--color-text)" }}>
            The quick brown fox jumps over the lazy dog.
          </div>
        </div>
      </div>
    </div>
  )
}
