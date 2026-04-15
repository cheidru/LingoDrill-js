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
import { getStartPage, getLastSequence, applySubFontSize } from "../utils/settings"
import "./App.css"
import "./bundle.css"
import "./sequencePlayer.css"

applySubFontSize()

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
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </AudioEngineProvider>
    </BrowserRouter>
  )
}