import { BrowserRouter, Routes, Route } from "react-router-dom"
import LibraryPage from "../pages/LibraryPage"
import { FragmentEditorPage } from "../pages/FragmentEditorPage"

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LibraryPage />} />
        <Route path="/file/:id/fragments" element={<FragmentEditorPage />} />
      </Routes>
    </BrowserRouter>
  )
}