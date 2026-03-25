// ──── Mobile detection (runs before React) ────
// screen.width/height always report true CSS pixels.
// Adds .mobile class to <html> for CSS targeting.
;(function () {
  const minDim = Math.min(screen.width, screen.height)
  if (minDim < 500) {
    document.documentElement.classList.add("mobile")
  }
})()
// ──── End mobile detection ────

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './app/App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)