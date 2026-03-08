// app/components/Header.tsx

import { useNavigate, useLocation } from "react-router-dom"
import { useSharedAudioEngine } from "../hooks/useSharedAudioEngine"

export function Header() {
  const navigate = useNavigate()
  const location = useLocation()
  const { selectedFile } = useSharedAudioEngine()

  // Extract audioId from URL or from selected file
  const audioIdMatch = location.pathname.match(/\/file\/([^/]+)/)
  const audioId = audioIdMatch ? audioIdMatch[1] : selectedFile?.id ?? null

  const navItems = [
    { label: "Audio Library", path: "/" },
    { label: "Fragment Library", path: audioId ? `/file/${audioId}/sequences` : null },
    { label: "Settings", path: null as string | null },
    { label: "About", path: null as string | null },
  ]

  return (
    <header style={{
      display: "flex",
      alignItems: "center",
      gap: 0,
      padding: "0 24px",
      borderBottom: "1px solid #ddd",
      backgroundColor: "#fafafa",
    }}>
      <span style={{
        fontWeight: 700,
        fontSize: 18,
        marginRight: 24,
        padding: "12px 0",
        color: "#333",
      }}>
        LingoDrill
      </span>

      {navItems.map(item => {
        const isActive = item.path !== null && (
          item.path === "/"
            ? location.pathname === "/"
            : location.pathname.startsWith(item.path)
        )
        const isDisabled = item.path === null

        return (
          <button
            key={item.label}
            onClick={() => item.path && navigate(item.path)}
            disabled={isDisabled}
            style={{
              padding: "12px 16px",
              border: "none",
              borderBottom: "none",
              backgroundColor: "transparent",
              outline: "none",
              boxShadow: "none",
              cursor: isDisabled ? "default" : "pointer",
              opacity: isDisabled ? 0.4 : 1,
              fontSize: 14,
              fontWeight: isActive ? 600 : 400,
              color: isActive ? "#4a90e2" : "#555",
            }}
          >
            {item.label}
          </button>
        )
      })}
    </header>
  )
}