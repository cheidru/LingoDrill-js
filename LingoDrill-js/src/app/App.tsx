// app/App.tsx

import { BrowserRouter, Routes, Route } from "react-router-dom"
import { AudioEngineProvider } from "./contexts/AudioEngineContext"
import { Header } from "./components/Header"
import LibraryPage from "../pages/LibraryPage"
import { FragmentLibraryPage } from "../pages/FragmentLibraryPage"
import { FragmentEditorPage } from "../pages/FragmentEditorPage"

export default function App() {
  return (
    // <BrowserRouter>
    <BrowserRouter basename="/LingoDrill-js">
      <AudioEngineProvider>
        <Header />
        <Routes>
          <Route path="/" element={<LibraryPage />} />
          <Route path="/file/:id/sequences" element={<FragmentLibraryPage />} />
          <Route path="/file/:id/editor" element={<FragmentEditorPage />} />
          <Route path="/file/:id/editor/:seqId" element={<FragmentEditorPage />} />
        </Routes>
      </AudioEngineProvider>
    </BrowserRouter>
  )
}