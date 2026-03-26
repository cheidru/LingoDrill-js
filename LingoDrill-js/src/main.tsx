// main.tsx

// ──── Mobile detection (runs before React) ────
;(function () {
  const minDim = Math.min(screen.width, screen.height)
  if (minDim < 500) {
    document.documentElement.classList.add("mobile")
  }
})()
// ──── End mobile detection ────

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RootErrorBoundary } from './app/components/RootErrorBoundary'
import './index.css'
import App from './app/App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </StrictMode>,
)