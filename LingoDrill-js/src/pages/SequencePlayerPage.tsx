// pages/SequencePlayerPage.tsx
//
// Sequence Player page — navigated to from Fragment Library play button.
// Displays:
// - Page header with sequence label and audio file name
// - Play-all button for consecutive playback
// - Fragment list with expandable control panels
// - Fragment control panel: play, pause, stop, infinite rewind, repeat, speed, nav, close
// - Subtitle display for selected fragment

import { useEffect, useState, useCallback, useRef, useMemo } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useSequences } from "../app/hooks/useSequences"
import { useSubtitles } from "../app/hooks/useSubtitles"
import { useSharedAudioEngine } from "../app/hooks/useSharedAudioEngine"
import type { Sequence, SequenceFragment } from "../core/domain/types"
import type { PlayableFragment } from "../core/audio/audioEngine"
import { VolumeControl } from "../app/components/VolumeControl"

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
            <div style={{ fontSize: 11, color: "#888" }}>{sub.subtitleFileName}</div>
            <div style={{ fontSize: 14, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{text}</div>
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
  localSpeed,
  onPlay,
  onPause,
  onStop,
  onInfiniteRewind,
  onPrev,
  onNext,
  onClose,
  onRepeatChange,
  onSpeedChange,
}: {
  fragmentIndex: number
  totalFragments: number
  isPlaying: boolean
  isPaused: boolean
  isInfiniteRewind: boolean
  localRepeat: number
  localSpeed: number
  onPlay: () => void
  onPause: () => void
  onStop: () => void
  onInfiniteRewind: () => void
  onPrev: () => void
  onNext: () => void
  onClose: () => void
  onRepeatChange: (value: number) => void
  onSpeedChange: (value: number) => void
}) {
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

        {/* Speed */}
        <label className="sp-ctrl-label" title="Playback speed">
          <span>⚡</span>
          <select
            value={localSpeed}
            onChange={e => onSpeedChange(parseFloat(e.target.value))}
            className="sp-ctrl-select"
          >
            <option value={0.5}>0.5×</option>
            <option value={0.75}>0.75×</option>
            <option value={1}>1×</option>
            <option value={1.25}>1.25×</option>
            <option value={1.5}>1.5×</option>
            <option value={2}>2×</option>
          </select>
        </label>

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

        {/* Close */}
        <button className="sp-ctrl-btn sp-ctrl-btn--close" onClick={onClose} title="Close control panel">
          <CloseIcon />
        </button>
      </div>
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

  // --- State ---
  const [playAllMode, setPlayAllMode] = useState(false)
  const [playingFragIdx, setPlayingFragIdx] = useState<number | null>(null)
  const [selectedFragIdx, setSelectedFragIdx] = useState<number | null>(null)
  const [infiniteRewind, setInfiniteRewind] = useState(false)

  // Local fragment overrides (repeat, speed) — keyed by fragment index
  const [localRepeats, setLocalRepeats] = useState<Record<number, number>>({})
  const [localSpeeds, setLocalSpeeds] = useState<Record<number, number>>({})

  // Refs for callbacks
  const playAllModeRef = useRef(false)
  const playingFragIdxRef = useRef<number | null>(null)
  const infiniteRewindRef = useRef(false)
  const sequenceRef = useRef<Sequence | null>(null)
  const localRepeatsRef = useRef<Record<number, number>>({})
  const localSpeedsRef = useRef<Record<number, number>>({})

  // Sync refs
  useEffect(() => { playAllModeRef.current = playAllMode }, [playAllMode])
  useEffect(() => { playingFragIdxRef.current = playingFragIdx }, [playingFragIdx])
  useEffect(() => { infiniteRewindRef.current = infiniteRewind }, [infiniteRewind])
  useEffect(() => { sequenceRef.current = sequence }, [sequence])
  useEffect(() => { localRepeatsRef.current = localRepeats }, [localRepeats])
  useEffect(() => { localSpeedsRef.current = localSpeeds }, [localSpeeds])

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

  // --- Play a single fragment with local overrides ---
  const playFragmentWithOverrides = useCallback((seq: Sequence, fragIdx: number) => {
    if (fragIdx < 0 || fragIdx >= seq.fragments.length) {
      console.log("[SequencePlayerPage] Fragment index out of bounds:", fragIdx)
      return
    }
    const f = seq.fragments[fragIdx]
    const repeat = localRepeatsRef.current[fragIdx] ?? f.repeat
    const speed = localSpeedsRef.current[fragIdx] ?? f.speed
    const fragment: PlayableFragment = { start: f.start, end: f.end, repeat }
    console.log("[SequencePlayerPage] Playing fragment", fragIdx, "start:", f.start.toFixed(2), "end:", f.end.toFixed(2), "repeat:", repeat, "speed:", speed)
    // TODO: apply playback speed when engine supports per-fragment speed
    playFragment(fragment)
    setPlayingFragIdx(fragIdx)
  }, [playFragment])

  // --- Play all ---
  const handlePlayAll = useCallback(() => {
    if (!sequence || sequence.fragments.length === 0) return
    console.log("[SequencePlayerPage] Starting play-all mode")
    setPlayAllMode(true)
    playAllModeRef.current = true
    playFragmentWithOverrides(sequence, 0)
  }, [sequence, playFragmentWithOverrides])

  // --- Stop all ---
  const handleStopAll = useCallback(() => {
    console.log("[SequencePlayerPage] Stopping playback")
    setPlayAllMode(false)
    playAllModeRef.current = false
    setPlayingFragIdx(null)
    playingFragIdxRef.current = null
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
        const fragment: PlayableFragment = { start: f.start, end: f.end, repeat }
        playFragment(fragment)
        return
      }

      // Play-all mode: advance to next
      if (playAllModeRef.current) {
        const nextIdx = currentIdx + 1
        if (nextIdx >= seq.fragments.length) {
          console.log("[SequencePlayerPage] Play-all finished")
          setPlayAllMode(false)
          playAllModeRef.current = false
          setPlayingFragIdx(null)
          playingFragIdxRef.current = null
          return
        }
        console.log("[SequencePlayerPage] Play-all advancing to fragment", nextIdx)
        const f = seq.fragments[nextIdx]
        const repeat = localRepeatsRef.current[nextIdx] ?? f.repeat
        const fragment: PlayableFragment = { start: f.start, end: f.end, repeat }
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
    setSelectedFragIdx(newIdx)
    // If currently playing, switch to new fragment
    if (playingFragIdx !== null) {
      setPlayAllMode(false)
      playAllModeRef.current = false
      playFragmentWithOverrides(sequence, newIdx)
    }
  }, [selectedFragIdx, playingFragIdx, sequence, playFragmentWithOverrides])

  const handleNextFragment = useCallback(() => {
    if (selectedFragIdx === null || !sequence || selectedFragIdx >= sequence.fragments.length - 1) return
    const newIdx = selectedFragIdx + 1
    setSelectedFragIdx(newIdx)
    // If currently playing, switch to new fragment
    if (playingFragIdx !== null) {
      setPlayAllMode(false)
      playAllModeRef.current = false
      playFragmentWithOverrides(sequence, newIdx)
    }
  }, [selectedFragIdx, playingFragIdx, sequence, playFragmentWithOverrides])

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

  const handleSpeedChange = useCallback((fragIdx: number, value: number) => {
    setLocalSpeeds(prev => ({ ...prev, [fragIdx]: value }))
    console.log("[SequencePlayerPage] Speed for fragment", fragIdx, "set to", value)
    // Also persist to sequence
    if (sequence) {
      const updatedFragments = sequence.fragments.map((f, i) =>
        i === fragIdx ? { ...f, speed: value } : f
      )
      updateSequence({ ...sequence, fragments: updatedFragments })
    }
  }, [sequence, updateSequence])

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
        <p style={{ color: "#888" }}>Loading sequence...</p>
        <button onClick={() => navigate(`/file/${audioId}/sequences`)}>← Back to sequences</button>
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

      {/* Play-all / Stop-all + Volume */}
      <div className="sp-playall-row">
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
        <div className="sp-volume">
          <VolumeControl volume={volume} onVolumeChange={setVolume} />
        </div>
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
          const speed = localSpeeds[idx] ?? frag.speed

          return (
            <div key={frag.id} className={`sp-frag-item ${isCurrentlyPlaying ? "sp-frag-item--playing" : ""} ${isSelected ? "sp-frag-item--selected" : ""}`}>
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
                  <span className="sp-frag-speed">{speed}×</span>
                )}
                {frag.subtitles.length > 0 && (
                  <span className="sp-frag-sub-indicator" title="Has subtitles">📝</span>
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
                    localSpeed={speed}
                    onPlay={() => isCurrentlyPlaying && isPaused ? handleFragResume() : handleFragPlay(idx)}
                    onPause={handleFragPause}
                    onStop={handleFragStop}
                    onInfiniteRewind={handleInfiniteRewind}
                    onPrev={handlePrevFragment}
                    onNext={handleNextFragment}
                    onClose={handleClosePanel}
                    onRepeatChange={(v) => handleRepeatChange(idx, v)}
                    onSpeedChange={(v) => handleSpeedChange(idx, v)}
                  />

                  {/* Subtitle display */}
                  <SubtitleDisplay fragment={frag} subtitleFiles={subtitleFiles} />
                </>
              )}
            </div>
          )
        })}
      </div>

      {/* Navigation */}
      <div className="player-nav" style={{ marginTop: 16 }}>
        <button onClick={() => navigate(`/file/${audioId}/sequences`)}>← Back to sequences</button>
      </div>

    </div>
  )
}