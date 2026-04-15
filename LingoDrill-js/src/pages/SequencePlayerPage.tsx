// pages/SequencePlayerPage.tsx
//
// Sequence Player page — navigated to from Fragment Library play button.
// Displays:
// - Page header with sequence label and audio file name
// - Play-all button for consecutive playback
// - Fragment list with expandable control panels
// - Fragment control panel: play, pause, stop, infinite rewind, disable, repeat, speed, nav, close
// - Subtitle display for selected fragment

import { useEffect, useState, useCallback, useRef, useMemo } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useSequences } from "../app/hooks/useSequences"
import { useSubtitles } from "../app/hooks/useSubtitles"
import { useSharedAudioEngine } from "../app/hooks/useSharedAudioEngine"
import type { Sequence, SequenceFragment } from "../core/domain/types"
import type { PlayableFragment } from "../core/audio/audioEngine"
import { VolumeControl } from "../app/components/VolumeControl"
import { setLastSequence } from "../utils/settings"

// --- Utility ---
function formatTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  const ms = Math.floor((sec % 1) * 10)
  return `${m}:${s.toString().padStart(2, "0")}.${ms}`
}

// --- Icons ---
// Control panel icons use "1em" so CSS font-size on the button controls their size.
// PlayAllIcon keeps an explicit px size since it's used outside the control panel.
const PlayIcon = () => (
  <svg width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
)
const PauseIcon = () => (
  <svg width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
)
const StopIcon = () => (
  <svg width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h12v12H6z" /></svg>
)
const InfiniteRewindIcon = () => (
  <svg width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
    <text x="12" y="15.5" textAnchor="middle" fontSize="7" fontWeight="bold" fill="currentColor">∞</text>
  </svg>
)
const SkipIcon = () => (
  <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="9" /><line x1="5.7" y1="5.7" x2="18.3" y2="18.3" />
  </svg>
)
const EditIcon = () => (
  <svg width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor">
    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
  </svg>
)
const PrevIcon = () => (
  <svg width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" /></svg>
)
const NextIcon = () => (
  <svg width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" /></svg>
)
const CloseIcon = () => (
  <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)
const PlayAllIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M4 4v16l8.5-8L4 4zm9 0v16l8.5-8L13 4z" />
  </svg>
)

// --- Subtitle display for a fragment ---
function SubtitleDisplay({
  fragment, subtitleFiles,
}: {
  fragment: SequenceFragment
  subtitleFiles: { id: string; content: string; name: string }[]
}) {
  if (!fragment.subtitles || fragment.subtitles.length === 0) return null

  return (
    <div className="sp-subtitle-display">
      {fragment.subtitles.map((sub, i) => {
        const file = subtitleFiles.find(sf => sf.id === sub.subtitleFileId)
        const text = file ? file.content.slice(sub.charStart, sub.charEnd) : "(file not found)"
        return (
          <div key={i} style={{ marginBottom: i < fragment.subtitles.length - 1 ? 6 : 0 }}>
            <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{sub.subtitleFileName}</div>
            <div style={{ fontSize: "var(--sub-font-size, 14px)", whiteSpace: "pre-wrap", lineHeight: 1.5, color: "var(--color-text)" }}>{text}</div>
          </div>
        )
      })}
    </div>
  )
}

// --- Fragment control panel ---
function FragmentControlPanel({
  fragmentIndex,
  totalFragments,
  isPlaying,
  isPaused,
  isInfiniteRewind,
  localRepeat,
  sequenceSpeed,
  isDisabled,
  onPlay,
  onPause,
  onStop,
  onInfiniteRewind,
  onToggleDisabled,
  onPrev,
  onNext,
  onClose,
  onEdit,
  onRepeatChange,
  onSpeedChange,
}: {
  fragmentIndex: number
  totalFragments: number
  isPlaying: boolean
  isPaused: boolean
  isInfiniteRewind: boolean
  localRepeat: number
  sequenceSpeed: number
  isDisabled: boolean
  onPlay: () => void
  onPause: () => void
  onStop: () => void
  onInfiniteRewind: () => void
  onToggleDisabled: () => void
  onPrev: () => void
  onNext: () => void
  onClose: () => void
  onEdit: () => void
  onRepeatChange: (value: number) => void
  onSpeedChange: (value: number) => void
}) {
  const [speedModalOpen, setSpeedModalOpen] = useState(false)
  const isMobile = document.documentElement.classList.contains("mobile")
  return (
    <div className="sp-control-panel">
      <div className="sp-control-row">
        {/* Play / Pause */}
        {isPlaying ? (
          <button className="sp-ctrl-btn" onClick={onPause} title="Pause">
            <PauseIcon />
          </button>
        ) : (
          <button className="sp-ctrl-btn" onClick={onPlay} title={isPaused ? "Resume" : "Play"}>
            <PlayIcon />
          </button>
        )}

        {/* Stop */}
        <button className="sp-ctrl-btn" onClick={onStop} title="Stop">
          <StopIcon />
        </button>

        {/* Infinite rewind */}
        <button
          className={`sp-ctrl-btn ${isInfiniteRewind ? "sp-ctrl-btn--active" : ""}`}
          onClick={onInfiniteRewind}
          title={isInfiniteRewind ? "Disable infinite rewind" : "Enable infinite rewind"}
        >
          <InfiniteRewindIcon />
        </button>

        {/* Disable/enable for play-all */}
        <button
          className={`sp-ctrl-btn ${isDisabled ? "sp-ctrl-btn--disabled" : ""}`}
          onClick={onToggleDisabled}
          title={isDisabled ? "Include in Play-all" : "Exclude from Play-all"}
        >
          <SkipIcon />
        </button>

        {/* Separator */}
        <div className="sp-ctrl-separator" />

        {/* Repeat */}
        <label className="sp-ctrl-label" title="Repeat count">
          <span>×</span>
          <input
            type="number"
            min={1}
            max={99}
            value={localRepeat}
            onChange={e => {
              const v = parseInt(e.target.value)
              if (!isNaN(v) && v >= 1) onRepeatChange(v)
            }}
            className="sp-ctrl-input"
          />
        </label>

        {/* Speed (controls sequence-wide playback speed) */}
        {isMobile ? (
          <button
            className="sp-ctrl-btn sp-speed-btn"
            onClick={() => setSpeedModalOpen(true)}
            title={`Playback speed: ${sequenceSpeed.toFixed(2)}×`}
          >
            <span>⚡</span>
            <span className="sp-speed-btn__value">{sequenceSpeed.toFixed(2)}×</span>
          </button>
        ) : (
          <label className="sp-speed-slider" title="Playback speed (applies to all fragments)">
            <span>⚡</span>
            <input
              type="range"
              min={0.5}
              max={1.5}
              step={0.05}
              value={sequenceSpeed}
              onChange={e => onSpeedChange(parseFloat(e.target.value))}
              className="sp-speed-slider__input"
            />
            <span className="sp-speed-slider__value">{sequenceSpeed.toFixed(2)}×</span>
          </label>
        )}

        {/* Separator */}
        <div className="sp-ctrl-separator" />

        {/* Prev / Next */}
        <button
          className="sp-ctrl-btn"
          onClick={onPrev}
          disabled={fragmentIndex <= 0}
          title="Previous fragment"
        >
          <PrevIcon />
        </button>
        <button
          className="sp-ctrl-btn"
          onClick={onNext}
          disabled={fragmentIndex >= totalFragments - 1}
          title="Next fragment"
        >
          <NextIcon />
        </button>

        {/* Edit in Fragment Editor */}
        <button className="sp-ctrl-btn" onClick={onEdit} title="Edit in Fragment Editor">
          <EditIcon />
        </button>

        {/* Close */}
        <button className="sp-ctrl-btn sp-ctrl-btn--close" onClick={onClose} title="Close control panel">
          <CloseIcon />
        </button>
      </div>

      {speedModalOpen && (
        <div className="modal-overlay" onClick={() => setSpeedModalOpen(false)}>
          <div className="modal-box sp-speed-modal" onClick={e => e.stopPropagation()}>
            <h3 className="sp-speed-modal__title">Playback speed</h3>
            <div className="sp-speed-modal__value">{sequenceSpeed.toFixed(2)}×</div>
            <input
              type="range"
              min={0.5}
              max={1.5}
              step={0.05}
              value={sequenceSpeed}
              onChange={e => onSpeedChange(parseFloat(e.target.value))}
              className="sp-speed-modal__input"
            />
            <div className="sp-speed-modal__range">
              <span>0.5×</span>
              <span>1.5×</span>
            </div>
            <div className="modal-actions">
              <button className="sp-ctrl-btn" onClick={() => onSpeedChange(1)} title="Reset to 1.00×" style={{ width: "auto", padding: "0 16px" }}>
                Reset
              </button>
              <button onClick={() => setSpeedModalOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// --- Main page ---
export function SequencePlayerPage() {
  return <SequencePlayerPageInner />
}

function SequencePlayerPageInner() {
  const { id: audioId, seqId } = useParams<{ id: string; seqId: string }>()
  const navigate = useNavigate()

  const {
    files,
    loadById, playFragment, pause, play, stop,
    isFragmentsReady, isPlaying, isPaused, setOnEnded,
    volume, setVolume,
  } = useSharedAudioEngine()

  const { sequences, updateSequence } = useSequences(audioId ?? null)
  const { subtitleFiles } = useSubtitles(audioId ?? null)

  // Find the sequence
  const sequence = sequences.find(s => s.id === seqId) ?? null

  // Track last played sequence for the "Last sequence" start page setting
  useEffect(() => {
    if (audioId && seqId) setLastSequence({ audioId, seqId })
  }, [audioId, seqId])

  // --- State ---
  const [playAllMode, setPlayAllMode] = useState(false)
  const [playingFragIdx, setPlayingFragIdx] = useState<number | null>(null)
  const [selectedFragIdx, setSelectedFragIdx] = useState<number | null>(null)
  const [infiniteRewind, setInfiniteRewind] = useState(false)
  const [sequenceSpeed, setSequenceSpeed] = useState(1)

  // Local fragment overrides (repeat) — keyed by fragment index
  const [localRepeats, setLocalRepeats] = useState<Record<number, number>>({})
  // Disabled fragments — excluded from Play-all
  const [disabledFragments, setDisabledFragments] = useState<Record<number, boolean>>({})

  // Refs for callbacks
  const playAllModeRef = useRef(false)
  const playingFragIdxRef = useRef<number | null>(null)
  const infiniteRewindRef = useRef(false)
  const sequenceRef = useRef<Sequence | null>(null)
  const sequenceSpeedRef = useRef(1)
  const localRepeatsRef = useRef<Record<number, number>>({})
  const disabledFragmentsRef = useRef<Record<number, boolean>>({})

  // Sync refs
  useEffect(() => { playAllModeRef.current = playAllMode }, [playAllMode])
  useEffect(() => { playingFragIdxRef.current = playingFragIdx }, [playingFragIdx])
  useEffect(() => { infiniteRewindRef.current = infiniteRewind }, [infiniteRewind])
  useEffect(() => { sequenceSpeedRef.current = sequenceSpeed }, [sequenceSpeed])
  useEffect(() => { sequenceRef.current = sequence }, [sequence])
  useEffect(() => { localRepeatsRef.current = localRepeats }, [localRepeats])
  useEffect(() => { disabledFragmentsRef.current = disabledFragments }, [disabledFragments])

  // Auto-select (expand) the playing fragment
  const [prevPlayingFragIdx, setPrevPlayingFragIdx] = useState<number | null>(null)
  if (playingFragIdx !== prevPlayingFragIdx) {
    setPrevPlayingFragIdx(playingFragIdx)
    if (playingFragIdx !== null) {
      setSelectedFragIdx(playingFragIdx)
    }
  }

  // Display order: playing fragment goes to top
  const displayOrder = useMemo(() => {
    if (!sequence) return []
    const indices = sequence.fragments.map((_, i) => i)
    if (playingFragIdx !== null && playingFragIdx >= 0 && playingFragIdx < sequence.fragments.length) {
      const rest = indices.filter(i => i !== playingFragIdx)
      return [playingFragIdx, ...rest]
    }
    return indices
  }, [sequence, playingFragIdx])

  // Load audio
  useEffect(() => {
    if (audioId) {
      console.log("[SequencePlayerPage] Loading audio:", audioId)
      loadById(audioId)
    }
  }, [audioId, loadById])

  // Stop playback on unmount
  const stopRef = useRef(stop)
  useEffect(() => { stopRef.current = stop }, [stop])
  useEffect(() => {
    return () => {
      console.log("[SequencePlayerPage] unmounting, stopping playback")
      stopRef.current()
    }
  }, [])

  // --- Effective speed: sequence speed × fragment speed ---
  const getEffectiveSpeed = useCallback((f: SequenceFragment) => {
    return sequenceSpeedRef.current * f.speed
  }, [])

  // --- Play a single fragment with local overrides ---
  const playFragmentWithOverrides = useCallback((seq: Sequence, fragIdx: number) => {
    if (fragIdx < 0 || fragIdx >= seq.fragments.length) {
      console.log("[SequencePlayerPage] Fragment index out of bounds:", fragIdx)
      return
    }
    const f = seq.fragments[fragIdx]
    const repeat = localRepeatsRef.current[fragIdx] ?? f.repeat
    const speed = getEffectiveSpeed(f)
    const fragment: PlayableFragment = { start: f.start, end: f.end, repeat, speed }
    console.log("[SequencePlayerPage] Playing fragment", fragIdx, "start:", f.start.toFixed(2), "end:", f.end.toFixed(2), "repeat:", repeat, "speed:", speed)
    playFragment(fragment)
    setPlayingFragIdx(fragIdx)
  }, [playFragment, getEffectiveSpeed])

  // --- Play all (skips disabled fragments) ---
  const handlePlayAll = useCallback(() => {
    if (!sequence || sequence.fragments.length === 0) return
    // Find first enabled fragment
    let firstIdx = 0
    while (firstIdx < sequence.fragments.length && disabledFragments[firstIdx]) {
      firstIdx++
    }
    if (firstIdx >= sequence.fragments.length) return // all disabled
    console.log("[SequencePlayerPage] Starting play-all mode from fragment", firstIdx)
    setPlayAllMode(true)
    playAllModeRef.current = true
    playFragmentWithOverrides(sequence, firstIdx)

    // On mobile, scroll the active fragment to just below the sticky header
    if (document.documentElement.classList.contains("mobile")) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const el = document.querySelector(".sp-frag-item--playing")
          if (el) el.scrollIntoView({ block: "start", behavior: "smooth" })
        })
      })
    }
  }, [sequence, disabledFragments, playFragmentWithOverrides])

  // --- Stop all ---
  const handleStopAll = useCallback(() => {
    console.log("[SequencePlayerPage] Stopping playback")
    setPlayAllMode(false)
    playAllModeRef.current = false
    setPlayingFragIdx(null)
    playingFragIdxRef.current = null
    setSelectedFragIdx(null)
    stop()
  }, [stop])

  // --- onEnded: advance to next fragment in play-all, or loop in infinite rewind ---
  useEffect(() => {
    setOnEnded(() => {
      const seq = sequenceRef.current
      if (!seq) return

      const currentIdx = playingFragIdxRef.current
      if (currentIdx === null) return

      // Infinite rewind: replay same fragment
      if (infiniteRewindRef.current) {
        console.log("[SequencePlayerPage] Infinite rewind: replaying fragment", currentIdx)
        const f = seq.fragments[currentIdx]
        const repeat = localRepeatsRef.current[currentIdx] ?? f.repeat
        const speed = sequenceSpeedRef.current * f.speed
        const fragment: PlayableFragment = { start: f.start, end: f.end, repeat, speed }
        playFragment(fragment)
        return
      }

      // Play-all mode: advance to next enabled fragment
      if (playAllModeRef.current) {
        let nextIdx = currentIdx + 1
        // Skip disabled fragments
        while (nextIdx < seq.fragments.length && disabledFragmentsRef.current[nextIdx]) {
          nextIdx++
        }
        if (nextIdx >= seq.fragments.length) {
          console.log("[SequencePlayerPage] Play-all finished")
          setPlayAllMode(false)
          playAllModeRef.current = false
          setPlayingFragIdx(null)
          playingFragIdxRef.current = null
          setSelectedFragIdx(null)
          return
        }
        console.log("[SequencePlayerPage] Play-all advancing to fragment", nextIdx)
        const f = seq.fragments[nextIdx]
        const repeat = localRepeatsRef.current[nextIdx] ?? f.repeat
        const speed = sequenceSpeedRef.current * f.speed
        const fragment: PlayableFragment = { start: f.start, end: f.end, repeat, speed }
        playFragment(fragment)
        setPlayingFragIdx(nextIdx)
        playingFragIdxRef.current = nextIdx
        return
      }

      // Single fragment mode ended
      console.log("[SequencePlayerPage] Fragment", currentIdx, "playback ended")
      setPlayingFragIdx(null)
      playingFragIdxRef.current = null
    })
    return () => setOnEnded(null)
  }, [setOnEnded, playFragment])

  // --- Fragment control panel handlers ---
  const handleFragPlay = useCallback((fragIdx: number) => {
    if (!sequence) return
    setPlayAllMode(false)
    playAllModeRef.current = false
    playFragmentWithOverrides(sequence, fragIdx)
  }, [sequence, playFragmentWithOverrides])

  const handleFragPause = useCallback(() => {
    pause()
  }, [pause])

  const handleFragResume = useCallback(() => {
    play()
  }, [play])

  const handleFragStop = useCallback(() => {
    stop()
    setPlayingFragIdx(null)
    playingFragIdxRef.current = null
    setPlayAllMode(false)
    playAllModeRef.current = false
  }, [stop])

  const handleInfiniteRewind = useCallback(() => {
    setInfiniteRewind(prev => {
      const next = !prev
      console.log("[SequencePlayerPage] Infinite rewind:", next ? "ON" : "OFF")
      return next
    })
  }, [])

  const handlePrevFragment = useCallback(() => {
    if (selectedFragIdx === null || selectedFragIdx <= 0 || !sequence) return
    const newIdx = selectedFragIdx - 1
    playFragmentWithOverrides(sequence, newIdx)
  }, [selectedFragIdx, sequence, playFragmentWithOverrides])

  const handleNextFragment = useCallback(() => {
    if (selectedFragIdx === null || !sequence || selectedFragIdx >= sequence.fragments.length - 1) return
    const newIdx = selectedFragIdx + 1
    playFragmentWithOverrides(sequence, newIdx)
  }, [selectedFragIdx, sequence, playFragmentWithOverrides])

  const handleClosePanel = useCallback(() => {
    setSelectedFragIdx(null)
  }, [])

  const handleRepeatChange = useCallback((fragIdx: number, value: number) => {
    setLocalRepeats(prev => ({ ...prev, [fragIdx]: value }))
    console.log("[SequencePlayerPage] Repeat for fragment", fragIdx, "set to", value)
    // Also persist to sequence
    if (sequence) {
      const updatedFragments = sequence.fragments.map((f, i) =>
        i === fragIdx ? { ...f, repeat: value } : f
      )
      updateSequence({ ...sequence, fragments: updatedFragments })
    }
  }, [sequence, updateSequence])

  const handleSequenceSpeedChange = useCallback((value: number) => {
    setSequenceSpeed(value)
  }, [])

  const handleToggleDisabled = useCallback((fragIdx: number) => {
    setDisabledFragments(prev => {
      const next = { ...prev }
      if (next[fragIdx]) {
        delete next[fragIdx]
      } else {
        next[fragIdx] = true
      }
      return next
    })
  }, [])

  const handleEditFragment = useCallback((fragIdx: number) => {
    if (!sequence) return
    const frag = sequence.fragments[fragIdx]
    stop()
    navigate(`/file/${audioId}/editor/${seqId}`, { state: { fragmentId: frag.id } })
  }, [sequence, audioId, seqId, navigate, stop])

  // --- Select fragment (toggle) ---
  const handleSelectFragment = useCallback((fragIdx: number) => {
    setSelectedFragIdx(prev => prev === fragIdx ? null : fragIdx)
  }, [])

  // --- Derived ---
  const fileName = files.find(f => f.id === audioId)?.name ?? "Unknown"

  if (!audioId || !seqId) {
    return (
      <div className="page">
        <p>Invalid URL. Missing audio or sequence ID.</p>
        <button onClick={() => navigate("/")}>← Back to library</button>
      </div>
    )
  }

  if (!sequence) {
    return (
      <div className="page">
        <h2>Sequence Player</h2>
        <h3>Test 4</h3>
        <p className="empty-state">Loading sequence...</p>
        <button onClick={() => navigate(-1)}>← Back</button>
      </div>
    )
  }

  const isPlayAllActive = playAllMode && playingFragIdx !== null

  return (
    <div className="page">
      {/* Header */}
      <h2>Sequence Player</h2>
      <p className="sp-file-info">
        <strong>#{sequence.label}</strong>
        <span className="sp-file-info-separator">·</span>
        {fileName}
        <span className="sp-file-info-separator">·</span>
        {sequence.fragments.length} fragment{sequence.fragments.length !== 1 ? "s" : ""}
      </p>

      {/* Back + Play-all / Stop-all + Volume */}
      <div className="sp-playall-row">
        <button className="sp-playall-btn" onClick={() => navigate(-1)}>
          <span>← Back</span>
        </button>
        {isPlayAllActive ? (
          <>
            {isPlaying ? (
              <button className="sp-playall-btn sp-playall-btn--playing" onClick={() => pause()}>
                <PauseIcon />
                <span>Pause all</span>
              </button>
            ) : isPaused ? (
              <button className="sp-playall-btn sp-playall-btn--playing" onClick={() => play()}>
                <PlayIcon />
                <span>Resume all</span>
              </button>
            ) : null}
            <button className="sp-playall-btn sp-playall-btn--stop" onClick={handleStopAll}>
              <StopIcon />
              <span>Stop</span>
            </button>
          </>
        ) : (
          <button
            className="sp-playall-btn"
            onClick={handlePlayAll}
            disabled={!isFragmentsReady || sequence.fragments.length === 0}
            title={!isFragmentsReady ? "Audio still decoding..." : "Play all fragments consecutively"}
          >
            <PlayAllIcon size={20} />
            <span>Play all</span>
          </button>
        )}
        <VolumeControl volume={volume} onVolumeChange={setVolume} />
      </div>

      {!isFragmentsReady && (
        <div className="sp-decode-indicator">
          <div className="spinner spinner--decode" /> Decoding audio for playback...
        </div>
      )}

      {/* Fragment list */}
      <div className="sp-fragment-list">
        {displayOrder.map(idx => {
          const frag = sequence.fragments[idx]
          const isSelected = selectedFragIdx === idx
          const isCurrentlyPlaying = playingFragIdx === idx
          const repeat = localRepeats[idx] ?? frag.repeat
          const isFragDisabled = !!disabledFragments[idx]

          return (
            <div key={frag.id} className={`sp-frag-item ${isCurrentlyPlaying ? "sp-frag-item--playing" : ""} ${isSelected ? "sp-frag-item--selected" : ""} ${isFragDisabled ? "sp-frag-item--disabled" : ""}`}>
              {/* Fragment row */}
              <div
                className="sp-frag-row"
                onClick={() => handleSelectFragment(idx)}
              >
                <span className="sp-frag-idx">{idx + 1}</span>
                <span className="sp-frag-time">
                  {formatTime(frag.start)} – {formatTime(frag.end)}
                </span>
                <span className="sp-frag-duration">
                  {((frag.end - frag.start)).toFixed(1)}s
                </span>
                {frag.repeat > 1 && (
                  <span className="sp-frag-repeat">×{repeat}</span>
                )}
                {frag.speed !== 1 && (
                  <span className="sp-frag-speed">{frag.speed}×</span>
                )}
                {frag.subtitles.length > 0 && (
                  <span className="sp-frag-sub-indicator" title="Has subtitles">📝</span>
                )}
                {isFragDisabled && (
                  <span className="sp-frag-disabled-indicator" title="Excluded from Play-all">skip</span>
                )}
                {isCurrentlyPlaying && (
                  <span className="sp-frag-playing-indicator">▶</span>
                )}
              </div>

              {/* Control panel (when selected) */}
              {isSelected && (
                <>
                  <FragmentControlPanel
                    fragmentIndex={idx}
                    totalFragments={sequence.fragments.length}
                    isPlaying={isCurrentlyPlaying && isPlaying}
                    isPaused={isCurrentlyPlaying && isPaused}
                    isInfiniteRewind={infiniteRewind}
                    localRepeat={repeat}
                    sequenceSpeed={sequenceSpeed}
                    isDisabled={isFragDisabled}
                    onPlay={() => isCurrentlyPlaying && isPaused ? handleFragResume() : handleFragPlay(idx)}
                    onPause={handleFragPause}
                    onStop={handleFragStop}
                    onInfiniteRewind={handleInfiniteRewind}
                    onToggleDisabled={() => handleToggleDisabled(idx)}
                    onPrev={handlePrevFragment}
                    onNext={handleNextFragment}
                    onClose={handleClosePanel}
                    onEdit={() => handleEditFragment(idx)}
                    onRepeatChange={(v) => handleRepeatChange(idx, v)}
                    onSpeedChange={handleSequenceSpeedChange}
                  />

                  {/* Subtitle display */}
                  <SubtitleDisplay fragment={frag} subtitleFiles={subtitleFiles} />
                </>
              )}
            </div>
          )
        })}
      </div>

    </div>
  )
}
