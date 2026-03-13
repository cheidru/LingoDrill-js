// app/components/Header.tsx

import { useNavigate, useLocation } from "react-router-dom"
import { useSharedAudioEngine } from "../hooks/useSharedAudioEngine"

export function Header() {
  const navigate = useNavigate()
  const location = useLocation()
  const { selectedFile } = useSharedAudioEngine()

  const audioIdMatch = location.pathname.match(/\/file\/([^/]+)/)
  const audioId = audioIdMatch ? audioIdMatch[1] : selectedFile?.id ?? null

  const navItems = [
    { label: "Audio Library", path: "/" },
    { label: "Fragment Library", path: audioId ? `/file/${audioId}/sequences` : null },
    { label: "Settings", path: null as string | null },
    { label: "About", path: null as string | null },
  ]

  return (
    <header className="header">
      <span className="header__logo">LingoDrill</span>
      {navItems.map(item => {
        const isActive = item.path !== null && (
          item.path === "/" ? location.pathname === "/" : location.pathname.startsWith(item.path)
        )
        const isDisabled = item.path === null
        const cls = `header__nav-btn${isActive ? " header__nav-btn--active" : ""}${isDisabled ? " header__nav-btn--disabled" : ""}`
        return (
          <button key={item.label} onClick={() => item.path && navigate(item.path)} disabled={isDisabled} className={cls}>
            {item.label}
          </button>
        )
      })}
    </header>
  )
}