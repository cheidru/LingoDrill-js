// app/components/OnboardingDemo.tsx
//
// Scripted, self-playing demos of the four main pages, used by the onboarding
// screen. The mocks are built from the app's own CSS classes (.audio-list__item,
// .toolbar, .seq-card, .fragment-row, .sp-frag-row …) rather than redrawn, so
// they inherit real spacing, real theming and any future restyle for free.
//
// Each demo runs once when its step is opened, then offers a replay button.
// A synthetic cursor glides between controls and fires a ripple on "click";
// the mocks themselves are inert — nothing here is interactive.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import type { CSSProperties } from "react"
import { useT } from "../../utils/i18n"
import { PlayIcon, EditIcon, DeleteIcon, CopyIcon, FavouriteIcon } from "./SequenceIcons"

export type DemoStage = "library" | "sequences" | "editor" | "player"

/* A beat fires at `t` ms after the run starts. `move` names a [data-demo]
   target for the cursor; `click` fires the ripple; `phase` advances the mock. */
type Beat = {
  t: number
  move?: string
  click?: boolean
  phase?: number
}

const SCRIPTS: Record<DemoStage, Beat[]> = {
  library: [
    { t: 500, move: "upload" },
    { t: 1250, click: true },
    { t: 1450, phase: 1 },
    { t: 2050, move: "row" },
    { t: 2750, click: true },
    { t: 2900, phase: 2 },
    { t: 3600, move: "fragments" },
    { t: 4300, click: true },
    { t: 4450, phase: 3 },
  ],
  sequences: [
    { t: 500, move: "new" },
    { t: 1200, click: true },
    { t: 1350, phase: 1 },
    { t: 2100, click: true },
    { t: 2250, phase: 2 },
    { t: 3000, move: "fav" },
    { t: 3700, click: true },
    { t: 3850, phase: 3 },
  ],
  editor: [
    { t: 500, move: "wave" },
    { t: 1300, click: true },
    { t: 1450, phase: 1 },
    { t: 2200, move: "repeat" },
    { t: 2900, click: true },
    { t: 3050, phase: 2 },
    { t: 3350, phase: 3 },
  ],
  player: [
    { t: 500, move: "row2" },
    { t: 1250, click: true },
    { t: 1400, phase: 1 },
    { t: 2100, move: "play" },
    { t: 2800, click: true },
    { t: 2950, phase: 2 },
    { t: 3700, phase: 3 },
    { t: 4450, phase: 4 },
  ],
}

/* How long the finished state is held before the replay button appears. */
const SETTLE_MS = 700

function useDemoRunner(stage: DemoStage) {
  const [phase, setPhase] = useState(0)
  const [target, setTarget] = useState<string | null>(null)
  const [clickSeq, setClickSeq] = useState(0)
  const [finished, setFinished] = useState(false)
  const [runId, setRunId] = useState(0)

  // OnboardingScreen keys this component by stage, so a step change remounts
  // it and the initial state is already clean; only replay has to reset.
  useEffect(() => {
    const script = SCRIPTS[stage]
    const timers = script.map(beat =>
      setTimeout(() => {
        if (beat.move) setTarget(beat.move)
        if (beat.click) setClickSeq(n => n + 1)
        if (beat.phase !== undefined) setPhase(beat.phase)
      }, beat.t)
    )
    const last = script[script.length - 1].t
    timers.push(setTimeout(() => setFinished(true), last + SETTLE_MS))

    return () => timers.forEach(clearTimeout)
  }, [stage, runId])

  const replay = useCallback(() => {
    setPhase(0)
    setTarget(null)
    setFinished(false)
    setRunId(n => n + 1)
  }, [])
  return { phase, target, clickSeq, finished, replay }
}

export function OnboardingDemo({ stage }: { stage: DemoStage }) {
  const t = useT()
  const { phase, target, clickSeq, finished, replay } = useDemoRunner(stage)
  const viewportRef = useRef<HTMLDivElement>(null)
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)

  // Measure after the mock has rendered this phase, so the cursor can land on
  // controls that only just appeared. The cursor lives outside the scaled
  // frame, so screen-space deltas are already the right coordinates.
  useLayoutEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || !target) return
    const el = viewport.querySelector<HTMLElement>(`[data-demo="${target}"]`)
    if (!el) return
    const v = viewport.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    setCursor({
      x: r.left + r.width / 2 - v.left,
      y: r.top + r.height / 2 - v.top,
    })
  }, [target, phase])

  return (
    <div className={`ob-demo ob-demo--${stage}`}>
      <div className="ob-demo__viewport" ref={viewportRef}>
        {/* inert keeps the mock's buttons out of the tab order and the
            accessibility tree — they are scenery, not controls. */}
        <div className="ob-demo__frame" inert>
          {stage === "library" && <LibraryMock phase={phase} />}
          {stage === "sequences" && <SequencesMock phase={phase} />}
          {stage === "editor" && <EditorMock phase={phase} />}
          {stage === "player" && <PlayerMock phase={phase} />}
        </div>

        {cursor && (
          <div
            className="ob-demo__cursor"
            aria-hidden="true"
            style={{ "--x": `${cursor.x}px`, "--y": `${cursor.y}px` } as CSSProperties}
          >
            {clickSeq > 0 && <span key={clickSeq} className="ob-demo__ripple" />}
            <svg viewBox="0 0 24 24" width="20" height="20">
              <path d="M5 2l14 9.5-6.3 1.2 3.4 6.6-2.6 1.3-3.4-6.6L5 18.6z" />
            </svg>
          </div>
        )}
      </div>

      <div className="ob-demo__footer">
        {finished && (
          <button type="button" className="ob-demo__replay" onClick={replay}>
            {t("onboarding.replay")}
          </button>
        )}
      </div>
    </div>
  )
}

/* ── 01 · Audio Library ─────────────────────────────────────────────────── */

function LibraryMock({ phase }: { phase: number }) {
  return (
    <div className="page ob-demo__page">
      <h2>Audio Library</h2>

      <div>
        <button data-demo="upload">+ Upload audio</button>
      </div>

      {phase === 0 ? (
        <p>No audio files uploaded yet.</p>
      ) : (
        /* The real page repeats its "Audio Library" heading here (the h2 on
           LibraryPage plus the h3 inside AudioLibrary). Dropped in the demo —
           in a 480px panel it just reads as a mistake. */
        <ul className="audio-list">
          <li
            className={`audio-list__item${phase >= 2 ? " audio-list__item--selected" : ""}`}
            data-demo="row"
          >
            <span>lesson-01.mp3</span>
            <button className="btn-delete">Delete</button>
          </li>
        </ul>
      )}

      {phase >= 2 && (
        <div className="ob-demo__reveal">
          <h3>Player</h3>
          <div className="progress-wrap">
            <div className="progress-bar">
              <div className="progress-track">
                <div className="progress-fill ob-demo__progress-fill" />
              </div>
              <div className="progress-handle ob-demo__progress-handle" />
            </div>
            <div className="progress-time">
              <span>0:41</span>
              <span>3:40</span>
            </div>
          </div>
          <div className="player-controls">
            <button>Play</button>
            <button>Stop</button>
          </div>
          <div className="player-nav">
            <button className={phase >= 3 ? "ob-demo__pressed" : ""} data-demo="fragments">
              Fragments
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── 02 · Fragment Library ──────────────────────────────────────────────── */

/* Mirrors SequenceBar in FragmentLibraryPage: amber track, red fragment blocks. */
const SEQ_BARS = [
  [{ x: 4, w: 26 }, { x: 38, w: 34 }, { x: 80, w: 22 }, { x: 112, w: 40 }, { x: 158, w: 18 }, { x: 182, w: 14 }],
  [{ x: 10, w: 44 }, { x: 66, w: 30 }, { x: 108, w: 52 }],
]

function SequenceCard({ n, fragments, favourite }: { n: number; fragments: number; favourite: boolean }) {
  return (
    <div className="seq-card ob-demo__reveal">
      <div className="seq-bar-wrap">
        <span className="seq-label">#{n}</span>
        <span className="ob-demo__meta">{fragments} fragments</span>
        <svg width="200" height="16" className="ob-demo__seqbar">
          <rect x="0" y="2" width="200" height="12" fill="#fef3c7" />
          {SEQ_BARS[n - 1].map(f => (
            <rect key={f.x} x={f.x} y="2" width={f.w} height="12" fill="#f87171" opacity="0.85" />
          ))}
        </svg>
        <div className="seq-controls">
          <button className="seq-controls__btn"><PlayIcon /></button>
          <button className="seq-controls__btn"><EditIcon /></button>
          <button className="seq-controls__btn"><CopyIcon /></button>
          <button className="seq-controls__btn ob-demo__danger"><DeleteIcon /></button>
          <button className="seq-controls__btn" data-demo={n === 1 ? "fav" : undefined}>
            <FavouriteIcon filled={favourite} />
          </button>
        </div>
      </div>
    </div>
  )
}

function SequencesMock({ phase }: { phase: number }) {
  return (
    <div className="page ob-demo__page">
      <h2>Fragment Library</h2>
      <p className="sp-file-info">lesson-01.mp3</p>

      <div className="toolbar">
        <button>← Back</button>
        <button data-demo="new">+ New sequence</button>
        <button>Sub (1)</button>
        <button>Vocab (0)</button>
      </div>

      {phase === 0 && (
        <p className="empty-state">No sequences yet. Create one in the editor.</p>
      )}
      {phase >= 1 && <SequenceCard n={1} fragments={6} favourite={phase >= 3} />}
      {phase >= 2 && <SequenceCard n={2} fragments={3} favourite={false} />}
    </div>
  )
}

/* ── 03 · Fragment Editor ───────────────────────────────────────────────── */

/* The real editor draws its waveform to a canvas from decoded audio; this is a
   stand-in with the same fragment-overlay treatment. */
const WAVE = [
  0.22, 0.55, 0.38, 0.72, 0.48, 0.30, 0.61, 0.84, 0.52, 0.26, 0.14, 0.34,
  0.68, 0.90, 0.58, 0.36, 0.20, 0.44, 0.76, 0.62, 0.40, 0.24, 0.50, 0.32,
  0.18, 0.46, 0.70, 0.88, 0.54, 0.28, 0.42, 0.66, 0.36, 0.22, 0.58, 0.30,
]
const WAVE_W = 560
const WAVE_H = 84
const WAVE_PITCH = WAVE_W / WAVE.length

const EDITOR_REGIONS = [
  { x: 18, w: 118 },
  { x: 168, w: 96 },
]
const NEW_REGION = { x: 300, w: 132 }

function EditorMock({ phase }: { phase: number }) {
  const regions = phase >= 1 ? [...EDITOR_REGIONS, NEW_REGION] : EDITOR_REGIONS

  return (
    <div className="page ob-demo__page">
      <h2>Fragment Editor</h2>
      <p className="sp-file-info">lesson-01.mp3</p>

      <div className="ob-demo__wave" data-demo="wave">
        <svg viewBox={`0 0 ${WAVE_W} ${WAVE_H}`} preserveAspectRatio="none">
          {regions.map((r, i) => (
            <rect
              key={r.x}
              className={`ob-demo__region${i === regions.length - 1 && phase >= 1 ? " ob-demo__region--new" : ""}`}
              x={r.x}
              y="0"
              width={r.w}
              height={WAVE_H}
            />
          ))}
          {WAVE.map((a, i) => {
            const h = Math.max(2, a * (WAVE_H - 10))
            return (
              <rect
                key={i}
                className="ob-demo__wavebar"
                x={i * WAVE_PITCH + 1}
                y={(WAVE_H - h) / 2}
                width={WAVE_PITCH - 2}
                height={h}
              />
            )
          })}
        </svg>
      </div>

      <div className="file-player">
        <button>▶ Play all</button>
        <button disabled>⏹ Stop</button>
      </div>

      <div className="action-bar">
        <button className="action-bar__btn">Auto-detect speech</button>
        <button className="action-bar__btn">Trim silence</button>
        <button className="action-bar__btn">Normalize volume</button>
        <button className="action-bar__btn action-bar__btn--danger">Delete all fragments</button>
      </div>

      <div className="fragment-row">
        <span className="fragment-row__time">0:01 – 0:08</span>
        <div className="fragment-row__actions">
          <button className="btn-sub">▶</button>
          <button className="btn-sub ob-demo__danger">✕</button>
        </div>
      </div>
      <div className="fragment-row">
        <span className="fragment-row__time">0:10 – 0:16</span>
        <div className="fragment-row__actions">
          <button className="btn-sub">▶</button>
          <button className="btn-sub ob-demo__danger">✕</button>
        </div>
      </div>

      {phase >= 1 && (
        <div className="fragment-row fragment-row--editing ob-demo__reveal">
          <span className="fragment-row__time">0:19 – 0:27</span>
          <div className="fragment-row__actions">
            <button className="btn-sub">▶</button>
            <label className="ob-demo__repeat" data-demo="repeat">
              ×
              <span className="ob-demo__repeat-value">{phase >= 3 ? 3 : 1}</span>
            </label>
            <button className="btn-sub">Sub</button>
            <button className="btn-sub">Vocab</button>
            <button className="btn-sub ob-demo__danger">✕</button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── 04 · Sequence Player ───────────────────────────────────────────────── */

const PLAYER_ROWS = [
  { idx: 1, time: "0:01 – 0:08", dur: "7.0s" },
  { idx: 2, time: "0:10 – 0:16", dur: "6.0s" },
  { idx: 3, time: "0:19 – 0:27", dur: "8.0s" },
  { idx: 4, time: "0:31 – 0:36", dur: "5.0s" },
]

function PlayerMock({ phase }: { phase: number }) {
  const playing = phase >= 2
  const take = phase >= 4 ? 3 : phase >= 3 ? 2 : 1

  return (
    <div className="page ob-demo__page">
      <h2>Sequence Player</h2>
      <p className="sp-file-info">
        lesson-01.mp3
        <span className="sp-file-info-separator">·</span>
        #1
        <span className="sp-file-info-separator">·</span>
        4 fragments
      </p>

      <div className="sp-playall-row">
        <button className="sp-playall-btn">← Back</button>
        <button className="sp-playall-btn">▶ Play all</button>
        <button className="sp-playall-btn">Shuffle</button>
      </div>

      <div className="sp-fragment-list">
        {PLAYER_ROWS.map(r => {
          const selected = phase >= 1 && r.idx === 2
          const isPlaying = playing && r.idx === 2
          return (
            <div
              key={r.idx}
              className={`sp-frag-item${isPlaying ? " sp-frag-item--playing" : ""}${selected ? " sp-frag-item--selected" : ""}`}
            >
              <div className="sp-frag-row" data-demo={r.idx === 2 ? "row2" : undefined}>
                <span className="sp-frag-idx">{r.idx}</span>
                <span className="sp-frag-time">{r.time}</span>
                <span className="sp-frag-duration">{r.dur}</span>
                <span className="sp-frag-repeat">×{isPlaying ? take : 3}</span>
                <span className="sp-frag-sub-indicator">📝</span>
                {isPlaying && <span className="sp-frag-playing-indicator">▶</span>}
              </div>

              {selected && (
                <div className="ob-demo__reveal">
                  <div className="sp-subtitle-display">
                    <div className="ob-demo__sub-name">lesson-01.srt</div>
                    <div className="ob-demo__sub-text">
                      So what you want to do is listen for the linking — it all runs together.
                    </div>
                  </div>
                  <div className="sp-control-panel">
                    <div className="sp-control-row">
                      <button className="sp-ctrl-btn" data-demo="play">{isPlaying ? "⏸" : "▶"}</button>
                      <button className="sp-ctrl-btn">⏹</button>
                      <div className="sp-ctrl-separator" />
                      <button className="sp-ctrl-btn">×3</button>
                      <button className="sp-ctrl-btn">1.0×</button>
                      <div className="sp-ctrl-separator" />
                      <button className="sp-ctrl-btn">↑</button>
                      <button className="sp-ctrl-btn">↓</button>
                      <button className="sp-ctrl-btn">✎</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
