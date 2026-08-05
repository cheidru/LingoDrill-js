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
import { VolumeControl } from "./VolumeControl"

export type DemoStage = "library" | "sequences" | "editor" | "player"

/* A beat fires at `t` ms after the run starts. `move` names a [data-demo]
   target for the cursor; `click` fires the ripple; `press` holds the button
   down (or lets it up) for drags; `phase` advances the mock. */
type Beat = {
  t: number
  move?: string
  click?: boolean
  press?: boolean
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
    { t: 3000, move: "edit" },
    { t: 3700, click: true },
    { t: 3850, phase: 3 },
  ],
  /* Two drags, so the beats come in press → move → release triplets. The
     region grows under the cursor because it shares its transition timing. */
  editor: [
    { t: 400, move: "mark-a" },
    { t: 1000, press: true },
    { t: 1120, phase: 1 },
    { t: 1250, move: "mark-b", phase: 2 },
    { t: 1950, press: false, phase: 3 },
    { t: 2750, press: true },
    { t: 2900, move: "mark-c", phase: 4 },
    { t: 3600, press: false, phase: 5 },
  ],
  /* Starts a page early, on the sequence list, because the player is somewhere
     you arrive at rather than open. Phases 2–5 are the four fragments taking
     their turn at the top of the list. */
  player: [
    { t: 400, move: "seqplay" },
    { t: 1100, click: true },
    { t: 1250, phase: 1 },
    { t: 1950, move: "playall" },
    { t: 2650, click: true },
    { t: 2800, phase: 2 },
    { t: 3600, phase: 3 },
    { t: 4400, phase: 4 },
    { t: 5200, phase: 5 },
  ],
}

/* How long the finished state is held before the replay button appears. */
const SETTLE_MS = 700

function useDemoRunner(stage: DemoStage) {
  const [phase, setPhase] = useState(0)
  const [target, setTarget] = useState<string | null>(null)
  const [clickSeq, setClickSeq] = useState(0)
  const [pressed, setPressed] = useState(false)
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
        if (beat.press !== undefined) setPressed(beat.press)
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
    setPressed(false)
    setFinished(false)
    setRunId(n => n + 1)
  }, [])
  return { phase, target, clickSeq, pressed, finished, replay }
}

export function OnboardingDemo({ stage }: { stage: DemoStage }) {
  const t = useT()
  const { phase, target, clickSeq, pressed, finished, replay } = useDemoRunner(stage)
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
            className={`ob-demo__cursor${pressed ? " ob-demo__cursor--down" : ""}`}
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

/* `edit` / `play` mark one of the card's buttons as a cursor target: step 02
   ends on Edit (the route into step 03) and step 04 opens on Play (the route
   into the player). "pressed" is the held-down look after the click lands. */
type Mark = "target" | "pressed"

function SequenceCard({
  n,
  fragments,
  edit,
  play,
}: {
  n: number
  fragments: number
  edit?: Mark
  play?: Mark
}) {
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
          <button
            className={`seq-controls__btn${play === "pressed" ? " ob-demo__pressed" : ""}`}
            data-demo={play ? "seqplay" : undefined}
          >
            <PlayIcon />
          </button>
          <button
            className={`seq-controls__btn${edit === "pressed" ? " ob-demo__pressed" : ""}`}
            data-demo={edit ? "edit" : undefined}
          >
            <EditIcon />
          </button>
          <button className="seq-controls__btn"><CopyIcon /></button>
          <button className="seq-controls__btn ob-demo__danger"><DeleteIcon /></button>
          <button className="seq-controls__btn"><FavouriteIcon filled={false} /></button>
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
      {phase >= 1 && <SequenceCard n={1} fragments={6} edit={phase >= 3 ? "pressed" : "target"} />}
      {phase >= 2 && <SequenceCard n={2} fragments={3} />}
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

/* The page starts empty and the demo marks its first fragment by hand. All
   geometry is in percent of the waveform width so the region overlay and the
   cursor's [data-demo] marks stay in step at any scale.
   MARK_A → MARK_B is the create drag; MARK_B → MARK_C drags the right edge. */
const MARK_A = 22
const MARK_B = 46
const MARK_C = 58

/* Positions read off the same percentages against a ~55s file. */
const DRAG_TIME = "0:12 – 0:25"
const RESIZED_TIME = "0:12 – 0:32"

function EditorMock({ phase }: { phase: number }) {
  // phase 0 none · 1 drag started · 2 dragging · 3 created · 4 edge dragged
  // · 5 released
  const hasRegion = phase >= 1
  const dragging = phase === 1 || phase === 2 || phase === 4
  const right = phase >= 4 ? MARK_C : phase >= 2 ? MARK_B : MARK_A

  return (
    <div className="page ob-demo__page">
      <h2>Fragment Editor</h2>
      <p className="sp-file-info">lesson-01.mp3</p>

      <div className="toolbar">
        <button>← Back</button>
        <button>Export for mobile</button>
        <label className="export-bundle__checkbox">
          <input type="checkbox" defaultChecked />
          <span className="ob-demo__meta">Include audio</span>
        </label>
        {/* The real page hides the export controls on phones — the mock says so
            rather than pretending they are there. */}
        <span className="ob-demo__badge">desktop only</span>
      </div>

      <div className="ob-demo__wave">
        <svg viewBox={`0 0 ${WAVE_W} ${WAVE_H}`} preserveAspectRatio="none">
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

        {hasRegion && (
          <div
            className={`ob-demo__region${dragging ? " ob-demo__region--active" : ""}`}
            style={{ left: `${MARK_A}%`, width: `${right - MARK_A}%` }}
          >
            <span className="ob-demo__handle" />
            <span className={`ob-demo__handle ob-demo__handle--right${phase === 4 ? " ob-demo__handle--held" : ""}`} />
          </div>
        )}

        <i className="ob-demo__mark ob-demo__mark--a" data-demo="mark-a" />
        <i className="ob-demo__mark ob-demo__mark--b" data-demo="mark-b" />
        <i className="ob-demo__mark ob-demo__mark--c" data-demo="mark-c" />
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

      {phase < 3 ? (
        <p className="empty-state">No fragments yet. Drag across the waveform to mark one.</p>
      ) : (
        <div className="fragment-row fragment-row--editing ob-demo__reveal">
          <span className="fragment-row__time">{phase >= 4 ? RESIZED_TIME : DRAG_TIME}</span>
          <div className="fragment-row__actions">
            <button className="btn-sub">▶</button>
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
  { idx: 1, time: "0:01 – 0:08", dur: "7.0s", sub: "Right, so where were we — you said you'd been there before?" },
  { idx: 2, time: "0:10 – 0:16", dur: "6.0s", sub: "So what you want to do is listen for the linking — it all runs together." },
  { idx: 3, time: "0:19 – 0:27", dur: "8.0s", sub: "Once more, slower this time, and mind the vowel in the second word." },
  { idx: 4, time: "0:31 – 0:36", dur: "5.0s", sub: "That's it — you've got it. Same again from the top." },
]

/* The list is laid out by hand so the reorder can be animated: every item is
   absolutely placed and only its `top` changes, which the eye reads as the
   playing fragment travelling to the front. Heights are fixed because the mock
   renders at a fixed --demo-w and is scaled as a whole. */
const ITEM_H = 48
const GAP = 6
const PITCH = ITEM_H + GAP
/* Subtitle display + control panel, revealed under whichever fragment plays. */
const STRIP_H = 116
const LIST_H = ITEM_H + GAP + STRIP_H + GAP + 3 * PITCH

const PlayAllGlyph = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M4 4v16l8.5-8L4 4zm9 0v16l8.5-8L13 4z" />
  </svg>
)
/* Pause and Stop appear twice at different sizes: fixed px in the play-all
   row, and 1em inside the control panel, where .sp-ctrl-btn's font-size sets
   the icon size the way it does on the real page. */
const PauseGlyph = ({ size = 16 }: { size?: number | string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
  </svg>
)
const StopGlyph = ({ size = 16 }: { size?: number | string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M6 6h12v12H6z" />
  </svg>
)
const SpeedGlyph = () => (
  <svg width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 4C6.48 4 2 8.48 2 14h3a7 7 0 0 1 14 0h3c0-5.52-4.48-10-10-10z" />
    <path d="M14.5 15c0 1.38-1.12 2.5-2.5 2.5S9.5 16.38 9.5 15c0-1.16.79-2.13 1.86-2.41l5.92-5.18-3.92 6.65c.69.41 1.14 1.17 1.14 2.04z" />
  </svg>
)

/* The rest of the fragment control panel, copied from SequencePlayerPage's
   own icon set so the mock shows the buttons the tips talk about. */
const SkipGlyph = () => (
  <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <circle cx="12" cy="12" r="9" /><line x1="5.7" y1="5.7" x2="18.3" y2="18.3" />
  </svg>
)
const RewindCountGlyph = () => (
  <svg width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
    <path d="M10.5 10v5L15 12.5z" />
  </svg>
)
const InfiniteRewindGlyph = () => (
  <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9.828 9.172a4 4 0 1 0 0 5.656a10 10 0 0 0 2.172 -2.828a10 10 0 0 1 2.172 -2.828a4 4 0 1 1 0 5.656a10 10 0 0 1 -2.172 -2.828a10 10 0 0 0 -2.172 -2.828" />
  </svg>
)
const PrevGlyph = () => (
  <svg width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
  </svg>
)
const NextGlyph = () => (
  <svg width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
  </svg>
)
const EditPencilGlyph = () => (
  <svg width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
  </svg>
)
const CloseGlyph = () => (
  <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)

/* Where the player is reached from: the sequence list, one click earlier. */
function SequencePickMock({ phase }: { phase: number }) {
  return (
    <div className="page ob-demo__page">
      <h2>Fragment Library</h2>
      <p className="sp-file-info">lesson-01.mp3</p>

      <div className="toolbar">
        <button>← Back</button>
        <button>+ New sequence</button>
        <button>Sub (1)</button>
        <button>Vocab (0)</button>
      </div>

      <SequenceCard n={1} fragments={6} play={phase >= 1 ? "pressed" : "target"} />
      <SequenceCard n={2} fragments={3} />
    </div>
  )
}

function PlayerMock({ phase }: { phase: number }) {
  // phase 0 sequence list · 1 player page idle · 2–5 fragments 1–4 playing
  if (phase === 0) return <SequencePickMock phase={phase} />

  const playing = phase >= 2 ? phase - 2 : -1
  // Matches SequencePlayerPage's displayOrder: the playing fragment jumps to
  // the front, everything else keeps its own order.
  const order = playing >= 0
    ? [playing, ...PLAYER_ROWS.map((_, i) => i).filter(i => i !== playing)]
    : PLAYER_ROWS.map((_, i) => i)
  const firstPitch = playing >= 0 ? ITEM_H + GAP + STRIP_H + GAP : PITCH

  return (
    <div className="page ob-demo__page ob-demo__reveal">
      <h2>Sequence Player</h2>
      <p className="sp-file-info">
        <strong>#1</strong>
        <span className="sp-file-info-separator">·</span>
        lesson-01.mp3
        <span className="sp-file-info-separator">·</span>
        4 fragments
      </p>

      <div className="sp-playall-row">
        <button className="sp-playall-btn">← Back</button>
        {playing >= 0 ? (
          <>
            <button className="sp-playall-btn" data-demo="playall">
              <PauseGlyph />
              <span>Pause all</span>
            </button>
            <button className="sp-playall-btn">
              <StopGlyph />
              <span>Stop</span>
            </button>
          </>
        ) : (
          <button className="sp-playall-btn" data-demo="playall">
            <PlayAllGlyph />
            <span>Play all</span>
          </button>
        )}
        <label className="sp-global-speed">
          <span className="sp-global-speed__icon"><SpeedGlyph /></span>
          <input type="range" min={0.5} max={1.5} step={0.05} defaultValue={1} className="sp-global-speed__input" />
          <span className="sp-global-speed__value">1.00×</span>
        </label>
        <VolumeControl volume={0.8} onVolumeChange={() => {}} />
      </div>

      <div className="ob-demo__sp-list" style={{ height: `${LIST_H}px` }}>
        {PLAYER_ROWS.map((r, i) => {
          const slot = order.indexOf(i)
          const isPlaying = i === playing
          return (
            <div
              key={r.idx}
              className={`sp-frag-item ob-demo__sp-item${isPlaying ? " sp-frag-item--playing sp-frag-item--selected" : ""}`}
              style={{ top: `${slot === 0 ? 0 : firstPitch + (slot - 1) * PITCH}px` }}
            >
              <div className="sp-frag-row">
                <span className="sp-frag-idx">{r.idx}</span>
                <span className="sp-frag-time">{r.time}</span>
                <span className="sp-frag-duration">{r.dur}</span>
                <span className="sp-frag-repeat">×3</span>
                <span className="sp-frag-sub-indicator">📝</span>
                {isPlaying && <span className="sp-frag-playing-indicator">▶</span>}
              </div>
            </div>
          )
        })}

        {playing >= 0 && (
          <div className="ob-demo__sp-strip">
            <div className="sp-subtitle-display">
              <div className="ob-demo__sub-name">lesson-01.srt</div>
              <div className="ob-demo__sub-text">{PLAYER_ROWS[playing].sub}</div>
            </div>
            {/* Mirrors FragmentControlPanel in SequencePlayerPage, button for
                button, so the tips on this step point at something real. */}
            <div className="sp-control-panel">
              <div className="sp-control-row">
                <button className="sp-ctrl-btn"><PauseGlyph size="1em" /></button>
                <button className="sp-ctrl-btn"><StopGlyph size="1em" /></button>
                <button className="sp-ctrl-btn"><SkipGlyph /></button>
                <div className="sp-ctrl-separator" />
                <button className="sp-ctrl-btn sp-speed-btn sp-rewind-btn">
                  <RewindCountGlyph />
                  <span className="sp-speed-btn__value">×3</span>
                </button>
                <button className="sp-ctrl-btn"><InfiniteRewindGlyph /></button>
                <label className="sp-speed-slider">
                  <span className="sp-speed-slider__icon"><SpeedGlyph /></span>
                  <input type="range" min={0.5} max={1.5} step={0.05} defaultValue={1} className="sp-speed-slider__input" />
                  <span className="sp-speed-slider__value">1.00×</span>
                </label>
                <div className="sp-ctrl-separator" />
                <button className="sp-ctrl-btn"><PrevGlyph /></button>
                <button className="sp-ctrl-btn"><NextGlyph /></button>
                <button className="sp-ctrl-btn"><EditPencilGlyph /></button>
                <button className="sp-ctrl-btn sp-ctrl-btn--close"><CloseGlyph /></button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
