// app/App.tsx

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { AudioEngineProvider } from "./contexts/AudioEngineContext"
import { Header } from "./components/Header"
import LibraryPage from "../pages/LibraryPage"
import { FragmentLibraryPage } from "../pages/FragmentLibraryPage"
import { FragmentEditorPage } from "../pages/FragmentEditorPage"
import { SequencePlayerPage } from "../pages/SequencePlayerPage"
import { FavouritesPage } from "../pages/FavouritesPage"
import { SettingsPage } from "../pages/SettingsPage"
import { ContactsPage } from "../pages/ContactsPage"
import { getStartPage, getLastSequence, applySubFontSize, applyTheme, applyColorTheme, applyBgPattern, applyBgGround, applyBgTint, applyLanguage, DEFAULT_SETTINGS_SECTION } from "../utils/settings"
import "./App.css"
import "./bundle.css"
import "./sequencePlayer.css"
import "./onboarding.css"
import "./help.css"

applySubFontSize()
applyTheme()
applyColorTheme()
applyBgPattern()
applyBgGround()
applyBgTint()
applyLanguage()

const SESSION_REDIRECT_KEY = "lingodrill.startPageRedirected"

function StartPageEntry() {
  if (sessionStorage.getItem(SESSION_REDIRECT_KEY)) {
    return <LibraryPage />
  }
  sessionStorage.setItem(SESSION_REDIRECT_KEY, "1")
  const start = getStartPage()
  if (start === "favourites") return <Navigate to="/favourites" replace />
  if (start === "last-sequence") {
    const last = getLastSequence()
    if (last) return <Navigate to={`/file/${last.audioId}/player/${last.seqId}`} replace />
  }
  return <LibraryPage />
}

export default function App() {
  return (
    // <BrowserRouter>
    <BrowserRouter basename="/LingoDrill-js">
      <AudioEngineProvider>
        <Header />
        <Routes>
          <Route path="/" element={<StartPageEntry />} />
          <Route path="/file/:id/sequences" element={<FragmentLibraryPage />} />
          <Route path="/file/:id/editor" element={<FragmentEditorPage />} />
          <Route path="/file/:id/editor/:seqId" element={<FragmentEditorPage />} />
          <Route path="/file/:id/player/:seqId" element={<SequencePlayerPage />} />
          <Route path="/favourites" element={<FavouritesPage />} />
          {/* One route per section of Settings — the header's Settings tab is a
              list of them, so the bare path only stands in for the first. */}
          <Route path="/settings" element={<Navigate to={`/settings/${DEFAULT_SETTINGS_SECTION}`} replace />} />
          <Route path="/settings/:section" element={<SettingsPage />} />
          <Route path="/contacts" element={<ContactsPage />} />
        </Routes>
      </AudioEngineProvider>
    </BrowserRouter>
  )
}