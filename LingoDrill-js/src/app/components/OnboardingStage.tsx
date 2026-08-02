// app/components/OnboardingStage.tsx
//
// The waveform hero on the onboarding welcome screen. The four numbered steps
// use OnboardingDemo instead — scripted mocks of the real pages.

import type { CSSProperties } from "react"

/* A fixed, speech-like envelope — 48 samples, one per bar. Hard-coded rather
   than generated so the illustration is identical on every render. */
const AMPS = [
  0.18, 0.34, 0.62, 0.48, 0.71, 0.55, 0.30, 0.16,
  0.22, 0.58, 0.86, 0.64, 0.42, 0.75, 0.52, 0.24,
  0.12, 0.28, 0.46, 0.80, 0.95, 0.68, 0.38, 0.20,
  0.26, 0.50, 0.34, 0.66, 0.88, 0.54, 0.31, 0.14,
  0.20, 0.44, 0.72, 0.58, 0.36, 0.62, 0.90, 0.48,
  0.25, 0.40, 0.68, 0.52, 0.30, 0.18, 0.36, 0.22,
]

const BAR_X0 = 24
const BAR_PITCH = 9
const BAR_W = 5
const MID_Y = 90
const MAX_H = 150

export function OnboardingStage() {
  return (
    <svg
      className="ob-stage"
      viewBox="0 0 480 180"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <line className="ob-stage__axis" x1="16" y1={MID_Y} x2="464" y2={MID_Y} />

      <g className="ob-stage__bars">
        {AMPS.map((a, i) => {
          const h = Math.max(3, a * MAX_H)
          return (
            <rect
              key={i}
              className="ob-stage__bar"
              x={BAR_X0 + i * BAR_PITCH}
              y={MID_Y - h / 2}
              width={BAR_W}
              height={h}
              rx="2"
              style={{ "--i": i } as CSSProperties}
            />
          )
        })}
      </g>
    </svg>
  )
}
