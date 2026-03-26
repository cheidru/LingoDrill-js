// pages/FragmentEditorPage.tsx
//
// ИЗМЕНЕНИЯ:
// 1. Все тяжёлые операции обёрнуты в wrapHeavyOp (decode, waveform, VAD, trim)
// 2. Добавлен ExportBundleButton для экспорта данных на мобильное устройство
// 3. При ошибке тяжёлой операции показывается MobileInstructionModal
// 4. Компонент обёрнут в HeavyOperationErrorBoundary (для ошибок рендера)
// 5. Кнопка play фрагмента переключается на pause при воспроизведении
// 6. При уходе со страницы воспроизведение останавливается
// 7. НОВОЕ: raw ctx.decodeAudioData() в handleAutoDetectRun и handleTrimSilence
//    заменены на safeDecodeAudioBuffer() с watchdog-таймаутом (5с), чтобы
//    бросить JS-ошибку ДО того, как браузер убьёт вкладку (~10-15с watchdog).

import { useEffect, useState, useCallback, useRef, useMemo } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useSharedAudioEngine } from "../app/hooks/useSharedAudioEngine"
import { useSequences } from "../app/hooks/useSequences"
import { useSubtitles } from "../app/hooks/useSubtitles"
import { useHeavyOperation } from "../app/hooks/useHeavyOperation"
import { Waveform } from "../app/components/Waveform"
import { VolumeControl } from "../app/components/VolumeControl"
import { ExportBundleButton } from "../app/components/ExportBundleButton"
import { MobileInstructionModal } from "../app/components/MobileInstructionModal"
import { HeavyOperationErrorBoundary } from "../app/components/HeavyOperationErrorBoundary"
import type { WaveformFragment } from "../app/components/Waveform"
import { buildWaveform } from "../utils/buildWaveform"
import { detectSpeechSegments } from "../utils/detectSpeech"
import { trimSilence } from "../utils/trimSilence"
import { safeDecodeAudioBuffer } from "../infrastructure/audio/safeDecodeAudioBuffer"
import type { PlayableFragment } from "../core/audio/audioEngine"
import type { SequenceFragment, FragmentSubtitle, SubtitleFile } from "../core/domain/types"
import { nanoid } from "nanoid"

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

/**
 * Обёртка с Error Boundary для рендер-ошибок.
 */
export function FragmentEditorPage() {
  return (
    <HeavyOperationErrorBoundary operationName="Fragment Editor">
      <FragmentEditorPageInner />
    </HeavyOperationErrorBoundary>
  )
}

function FragmentEditorPageInner() {
  const { id: audioId, seqId } = useParams<{ id: string; seqId?: string }>()
  const navigate = useNavigate()

  const {
    getBlob, addFile, files,
    loadById, playFragment, pause, play, stop, seekTo,
    isReady, isFragmentsReady, isPlaying, isPaused, duration, currentTime,
    volume, setVolume, getAudioBuffer,
    decodeError,
  } = useSharedAudioEngine()

  const { sequences, addSequence, updateSequence } = useSequences(audioId ?? null)
  const { subtitleFiles } = useSubtitles(audioId ?? null)

  // --- Heavy operation error handling ---
  const { heavyError, showMobileHelp, wrapHeavyOp, clearError, closeHelp } = useHeavyOperation()

  // Decode error from background chunked decode (in useAudioEngine)
  const [dismissDecodeHelp, setDismissDecodeHelp] = useState(false)
  const showDecodeHelp = !!decodeError && !dismissDecodeHelp

  const [waveformData, setWaveformData] = useState<number[]>([])
  const [waveformLoading, setWaveformLoading] = useState(true)
  const [playingFragment, setPlayingFragment] =
    useState<{ start: number; end: number } | null>(null)

  const [fragments, setFragments] = useState<SequenceFragment[]>([])
  const [sequenceLoaded, setSequenceLoaded] = useState(false)
  const currentSeqIdRef = useRef<string | null>(seqId ?? null)

  // --- Editing state ---
  const [editingId, setEditingId] = useState<string | null>(null)
  const savedBoundsRef = useRef<{ start: number; end: number } | null>(null)

  // --- Subtitle selection modal ---
  const [subModalFragId, setSubModalFragId] = useState<string | null>(null)
  const [subModalStep, setSubModalStep] = useState<"choose-file" | "select-text">("choose-file")
  const [subModalFile, setSubModalFile] = useState<SubtitleFile | null>(null)

  // --- VAD auto-detect state ---
  const [vadDetecting, setVadDetecting] = useState(false)
  const [, setVadProgress] = useState(0)
  const [vadDone, setVadDone] = useState(false)

  // Load audio
  useEffect(() => {
    if (!audioId) return
    loadById(audioId)
  }, [audioId, loadById])

  // Build waveform: from cache, or from AudioBuffer when ready
  // ОБЁРНУТО в wrapHeavyOp для перехвата ошибок на мобильных
  useEffect(() => {
    if (!audioId) return
    let cancelled = false

    const load = async () => {
      const { WaveformCacheStorage } = await import("../infrastructure/indexeddb/waveformCacheStorage")
      const cache = new WaveformCacheStorage()
      const cached = await cache.get(audioId)

      if (cached && cached.length > 0 && !cancelled) {
        setWaveformData(cached)
        setWaveformLoading(false)
        return
      }

      if (!isFragmentsReady) return

      const audioBuffer = getAudioBuffer(audioId)
      if (!audioBuffer || cancelled) return

      // Waveform build обёрнут в wrapHeavyOp
      const coarseResult = await wrapHeavyOp("Building waveform", async () => {
        return buildWaveform(audioBuffer, 100)
      })

      if (coarseResult && !cancelled) {
        setWaveformData(coarseResult)
        setWaveformLoading(false)
      }

      // Detailed waveform in background
      setTimeout(async () => {
        if (cancelled) return
        const detailedResult = await wrapHeavyOp("Building detailed waveform", async () => {
          return buildWaveform(audioBuffer, 1000)
        })
        if (detailedResult && !cancelled) {
          setWaveformData(detailedResult)
          cache.save(audioId, detailedResult)
        }
      }, 0)
    }
    load()

    return () => { cancelled = true }
  }, [audioId, isFragmentsReady, getAudioBuffer, getBlob, wrapHeavyOp])

  // Load sequence fragments
  useEffect(() => {
    if (sequenceLoaded) return
    if (!seqId) { setSequenceLoaded(true); return }
    const seq = sequences.find(s => s.id === seqId)
    if (seq) {
      setFragments(seq.fragments.map(f => ({ ...f, subtitles: f.subtitles ? [...f.subtitles] : [] })))
      currentSeqIdRef.current = seq.id
      setSequenceLoaded(true)
      if (seq.fragments.length > 0) setVadDone(true)
    }
  }, [seqId, sequences, sequenceLoaded])

  // --- Persist ---

  const persistSequence = useCallback(async (updatedFragments: SequenceFragment[]) => {
    if (!audioId) return
    const sorted = [...updatedFragments].sort((a, b) => a.start - b.start)
    if (currentSeqIdRef.current) {
      const seq = sequences.find(s => s.id === currentSeqIdRef.current)
      if (seq) await updateSequence({ ...seq, fragments: sorted })
    } else {
      const newSeq = await addSequence(sorted)
      if (newSeq) {
        currentSeqIdRef.current = newSeq.id
        window.history.replaceState(null, "", `/LingoDrill-js/file/${audioId}/editor/${newSeq.id}`)
      }
    }
  }, [audioId, sequences, addSequence, updateSequence])

  // --- Fragment operations ---

  const addFragment = useCallback(async (start: number, end: number) => {
    if (editingId) { setEditingId(null); savedBoundsRef.current = null }
    const frag: SequenceFragment = {
      id: nanoid(), start, end, repeat: 1, speed: 1, subtitles: [],
    }
    const updated = [...fragments, frag]
    setFragments(updated)
    await persistSequence(updated)
  }, [editingId, fragments, persistSequence])

  const deleteLocalFragment = useCallback(async (fragId: string) => {
    if (editingId === fragId) { setEditingId(null); savedBoundsRef.current = null }
    const updated = fragments.filter(f => f.id !== fragId)
    setFragments(updated)
    stop(); setPlayingFragment(null)
    await persistSequence(updated)
  }, [editingId, fragments, stop, persistSequence])

  const updateLocalFragment = useCallback((updated: SequenceFragment) => {
    setFragments(prev => prev.map(f => f.id === updated.id ? updated : f))
  }, [])

  // --- Auto-detect speech fragments via VAD ---
  // ОБЁРНУТО в wrapHeavyOp

  const [showAutoDetectConfirm, setShowAutoDetectConfirm] = useState(false)
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false)

  const handleDeleteAllFragments = useCallback(async () => {
    setShowDeleteAllConfirm(false)
    setFragments([])
    setEditingId(null)
    savedBoundsRef.current = null
    stop()
    setPlayingFragment(null)
    setVadDone(false)
    await persistSequence([])
  }, [stop, persistSequence])

  const handleAutoDetectRun = useCallback(async () => {
    setShowAutoDetectConfirm(false)
    if (!audioId || vadDetecting) return

    const blob = await getBlob(audioId)
    if (!blob) return

    setFragments([])
    setEditingId(null)
    savedBoundsRef.current = null

    setVadDetecting(true)
    setVadProgress(0)

    // ОБЁРНУТО в wrapHeavyOp
    // ИСПРАВЛЕНО: используем safeDecodeAudioBuffer вместо raw ctx.decodeAudioData
    const segments = await wrapHeavyOp("Auto-detect speech (audio decoding + VAD)", async () => {
      const audioBuffer = await safeDecodeAudioBuffer(blob)

      const segs = await detectSpeechSegments(audioBuffer, (p) => {
        setVadProgress(p)
      })
      return segs
    })

    if (segments === null) {
      // Error handled by wrapHeavyOp → MobileInstructionModal shown
      setVadDetecting(false)
      setVadProgress(0)
      return
    }

    if (segments.length === 0) {
      alert("No speech segments detected.")
      setVadDetecting(false)
      setVadProgress(0)
      return
    }

    const newFragments: SequenceFragment[] = segments.map(seg => ({
      id: nanoid(),
      start: seg.start,
      end: seg.end,
      repeat: 1,
      speed: 1,
      subtitles: [],
    }))

    setFragments(newFragments)
    await persistSequence(newFragments)
    setVadDone(true)
    setVadDetecting(false)
    setVadProgress(0)
  }, [audioId, vadDetecting, getBlob, persistSequence, wrapHeavyOp])

  const handleAutoDetectClick = useCallback(() => {
    if (fragments.length > 0) {
      setShowAutoDetectConfirm(true)
    } else {
      handleAutoDetectRun()
    }
  }, [fragments.length, handleAutoDetectRun])

  // --- Trim silence ---
  // ОБЁРНУТО в wrapHeavyOp

  const [trimming, setTrimming] = useState(false)

  const handleTrimSilence = useCallback(async () => {
    if (!audioId || trimming || vadDetecting) return

    const blob = await getBlob(audioId)
    if (!blob) return

    setTrimming(true)

    // ОБЁРНУТО в wrapHeavyOp
    // ИСПРАВЛЕНО: используем safeDecodeAudioBuffer вместо raw ctx.decodeAudioData
    const result = await wrapHeavyOp("Trim silence (audio decoding + processing)", async () => {
      const audioBuffer = await safeDecodeAudioBuffer(blob)

      let segments: { start: number; end: number }[]

      if (fragments.length > 0) {
        segments = fragments.map(f => ({ start: f.start, end: f.end }))
      } else {
        setVadDetecting(true)
        setVadProgress(0)

        segments = await detectSpeechSegments(audioBuffer, (p) => {
          setVadProgress(p)
        })

        setVadDetecting(false)
        setVadProgress(0)

        if (segments.length === 0) {
          throw new Error("No speech segments detected — nothing to trim.")
        }
      }

      const { blob: trimmedBlob, segmentMap, newDuration } = trimSilence(audioBuffer, segments)

      const sourceFile = files.find(f => f.id === audioId)
      const baseName = sourceFile?.name?.replace(/\.[^.]+$/, "") ?? "audio"
      const trimmedName = `${baseName}_trimmed.wav`
      const trimmedFile = new File([trimmedBlob], trimmedName, { type: "audio/wav" })
      await addFile(trimmedFile)

      return { audioBuffer, segmentMap, newDuration, trimmedName }
    })

    if (result) {
      const { audioBuffer, segmentMap, newDuration, trimmedName } = result
      const removedDuration = audioBuffer.duration - newDuration
      const pct = Math.round((removedDuration / audioBuffer.duration) * 100)
      alert(
        `Done! Created "${trimmedName}"\n` +
        `Original: ${audioBuffer.duration.toFixed(1)}s → Trimmed: ${newDuration.toFixed(1)}s\n` +
        `Removed ${removedDuration.toFixed(1)}s of silence (${pct}%)\n` +
        `${segmentMap.length} speech segments preserved.\n\n` +
        `The new file is available in your Audio Library.`
      )
    }

    setTrimming(false)
    setVadDetecting(false)
    setVadProgress(0)
  }, [audioId, trimming, vadDetecting, getBlob, addFile, fragments, files, wrapHeavyOp])

  // --- File playback ---
  const [isFilePlayback, setIsFilePlayback] = useState(false)

  const handleFilePlay = useCallback(() => {
    stop()  // stop any fragment playback, resets activeEngine to html
    setIsFilePlayback(true)
    setPlayingFragment(null)
    play()
  }, [stop, play])

  const handleFilePause = useCallback(() => {
    pause()
  }, [pause])

  const handleFileStop = useCallback(() => {
    stop()
    setIsFilePlayback(false)
  }, [stop])

  const handleFileSeek = useCallback((time: number) => {
    seekTo(time)
    setIsFilePlayback(true)
  }, [seekTo])

  // --- Waveform and display fragments ---

  const waveformFragments: WaveformFragment[] =
    fragments.map(f => ({ id: f.id, start: f.start, end: f.end, repeat: f.repeat }))

  const displayFragments = useMemo(() => {
    const sorted = [...fragments].sort((a, b) => a.start - b.start)
    if (!editingId) return sorted
    const editingFrag = sorted.find(f => f.id === editingId)
    if (!editingFrag) return sorted
    const rest = sorted.filter(f => f.id !== editingId)
    return [editingFrag, ...rest]
  }, [fragments, editingId])

  // --- FLIP animation for fragment list ---
  const fragmentRefsMap = useRef<Map<string, HTMLDivElement>>(new Map())
  const prevRectsRef = useRef<Map<string, DOMRect>>(new Map())

  const capturePositions = useCallback(() => {
    const rects = new Map<string, DOMRect>()
    fragmentRefsMap.current.forEach((el, id) => {
      rects.set(id, el.getBoundingClientRect())
    })
    prevRectsRef.current = rects
  }, [])

  useEffect(() => {
    const prevRects = prevRectsRef.current
    if (prevRects.size === 0) return

    fragmentRefsMap.current.forEach((el, id) => {
      const prevRect = prevRects.get(id)
      if (!prevRect) return

      const newRect = el.getBoundingClientRect()
      const deltaY = prevRect.top - newRect.top

      if (Math.abs(deltaY) < 2) return

      el.style.transition = "none"
      el.style.transform = `translateY(${deltaY}px)`
      el.style.zIndex = id === editingId ? "10" : "1"

      requestAnimationFrame(() => {
        el.style.transition = "transform 0.3s ease"
        el.style.transform = ""
        el.addEventListener("transitionend", () => {
          el.style.zIndex = ""
        }, { once: true })
      })
    })

    prevRectsRef.current = new Map()
  }, [displayFragments, editingId])

  const startEditingWithAnim = useCallback((fragId: string) => {
    capturePositions()
    setEditingId(fragId)
    const frag = fragments.find(f => f.id === fragId)
    if (frag) savedBoundsRef.current = { start: frag.start, end: frag.end }
  }, [capturePositions, fragments])

  // --- Fragment playback ---
  const handlePlayFragment = useCallback((f: SequenceFragment) => {
    stop()
    setIsFilePlayback(false)
    const pf: PlayableFragment = { start: f.start, end: f.end, repeat: f.repeat }
    setPlayingFragment({ start: f.start, end: f.end })
    playFragment(pf)
  }, [stop, playFragment])

  const handlePauseFragment = useCallback(() => {
    pause()
  }, [pause])

  const handleResumeFragment = useCallback(() => {
    play()
  }, [play])

  // Stop playback when leaving the page (unmount)
  const stopRef = useRef(stop)
  stopRef.current = stop
  useEffect(() => {
    return () => {
      stopRef.current()
    }
  }, [])

  // --- Subtitle handlers ---
  const handleSubtitleSelect = useCallback(async () => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || !subModalFile || !subModalFragId) return

    const container = document.getElementById("subtitle-text-container")
    if (!container) return

    const range = sel.getRangeAt(0)
    const preRange = document.createRange()
    preRange.selectNodeContents(container)
    preRange.setEnd(range.startContainer, range.startOffset)
    const charStart = preRange.toString().length
    const charEnd = charStart + range.toString().length

    const newSub: FragmentSubtitle = {
      subtitleFileId: subModalFile.id,
      subtitleFileName: subModalFile.name,
      charStart,
      charEnd,
    }

    const updatedAll = fragments.map(f => {
      if (f.id !== subModalFragId) return f
      const filtered = f.subtitles.filter(s => s.subtitleFileId !== subModalFile.id)
      return { ...f, subtitles: [...filtered, newSub] }
    })

    setFragments(updatedAll)
    await persistSequence(updatedAll)
    setSubModalFragId(null)
    setSubModalFile(null)
    sel.removeAllRanges()
  }, [subModalFragId, subModalFile, fragments, persistSequence])

  const handleRemoveSubtitle = useCallback(async (fragId: string, subIdx: number) => {
    const updatedAll = fragments.map(f => {
      if (f.id !== fragId) return f
      const newSubs = f.subtitles.filter((_, i) => i !== subIdx)
      return { ...f, subtitles: newSubs }
    })
    setFragments(updatedAll)
    await persistSequence(updatedAll)
  }, [fragments, persistSequence])

  // --- Get audio file info for export ---
  const audioFile = files.find(f => f.id === audioId)
  const audioName = audioFile?.name?.replace(/\.[^.]+$/, "") ?? "audio"

  // --- Get full sequences for export ---
  const allSequencesForExport = useMemo(() => {
    if (!audioId) return sequences
    if (!currentSeqIdRef.current) return sequences

    return sequences.map(s => {
      if (s.id === currentSeqIdRef.current) {
        return { ...s, fragments: [...fragments].sort((a, b) => a.start - b.start) }
      }
      return s
    })
  }, [sequences, fragments, audioId])

  // --- RENDER ---

  if (!audioId) return <div className="page"><p>No audio file selected.</p></div>

  return (
    <div className="page">
      <h2>Fragment Editor</h2>

      {!isReady && (
        <div className="frag-editor__loading">
          <div className="spinner spinner--wf" /> Loading audio...
        </div>
      )}

      {isReady && (
        <>
          {/* Waveform */}
          {decodeError ? (
            <div style={{
              padding: "16px",
              backgroundColor: "#fff3e0",
              border: "1px solid #ffcc80",
              borderRadius: 8,
              marginBottom: 12,
            }}>
              <p style={{ color: "#e65100", fontWeight: 600, margin: "0 0 8px" }}>
                ⚠ Audio decoding failed
              </p>
              <p style={{ fontSize: "0.85rem", color: "#666", margin: "0 0 12px" }}>
                {decodeError.message}
              </p>
              <p style={{ fontSize: "0.85rem", color: "#555", margin: "0 0 12px" }}>
                This file is too large to decode on this device.
                Prepare the data on a desktop computer and transfer via a <code style={{
                  background: "#f0f0f0", padding: "1px 4px", borderRadius: 3
                }}>.lingodrill</code> bundle.
              </p>
              <button
                onClick={() => setDismissDecodeHelp(false)}
                className="btn-primary"
                style={{ backgroundColor: "#ff9800" }}
              >
                How to prepare on desktop
              </button>
            </div>
          ) : waveformLoading ? (
            <div className="frag-editor__loading">
              <div className="spinner spinner--wf" /> Building waveform...
            </div>
          ) : (
            <Waveform
              data={waveformData}
              duration={duration}
              fragments={waveformFragments}
              onSelect={addFragment}
              onFragmentClick={startEditingWithAnim}
              onClickOutside={() => { setEditingId(null); savedBoundsRef.current = null }}
              onEditDrag={(id, newStart, newEnd) => {
                const frag = fragments.find(f => f.id === id)
                if (frag) {
                  const updated = { ...frag, start: newStart, end: newEnd }
                  updateLocalFragment(updated)
                }
              }}
              editingId={editingId}
              currentTime={currentTime}
              playingFragment={playingFragment}
              showPlaybackCursor={isFilePlayback}
              isFilePlaying={isFilePlayback && isPlaying}
              onSeek={handleFileSeek}
            />
          )}

          {/* File player */}
          <div className="file-player">
            <button onClick={isFilePlayback && isPlaying ? handleFilePause : handleFilePlay}>
              {isFilePlayback && isPlaying ? "⏸ Pause" : "▶ Play all"}
            </button>
            <button onClick={handleFileStop} disabled={!isFilePlayback}>⏹ Stop</button>
            <VolumeControl volume={volume} onVolumeChange={setVolume} />
            {isFilePlayback && (
              <span className="file-player__time">{formatTime(currentTime)} / {formatTime(duration)}</span>
            )}
          </div>

          {!isFragmentsReady && !decodeError && (
            <div className="decode-indicator">
              <div className="spinner spinner--decode" />
              Decoding audio for fragments...
            </div>
          )}

          {decodeError && !isFragmentsReady && (
            <div style={{
              marginTop: 8, marginBottom: 8,
              padding: "8px 12px",
              fontSize: "0.85rem",
              color: "#c62828",
              backgroundColor: "#ffebee",
              border: "1px solid #ef9a9a",
              borderRadius: 4,
            }}>
              ⚠ Fragment decoding failed: {decodeError.message}
            </div>
          )}

          {/* Heavy operation error banner */}
          {heavyError && (
            <div style={{
              padding: "10px 16px",
              backgroundColor: "#ffebee",
              border: "1px solid #ef9a9a",
              borderRadius: 4,
              marginTop: 8,
              marginBottom: 8,
            }}>
              <p style={{ color: "#c62828", margin: 0, fontWeight: 500 }}>
                ⚠ {heavyError.operationName} failed
              </p>
              <p style={{ color: "#666", fontSize: "0.85rem", margin: "4px 0 8px" }}>
                {heavyError.error.message}
              </p>
              <button
                onClick={clearError}
                style={{ marginRight: 8, padding: "4px 12px" }}
              >
                Dismiss
              </button>
              <button
                onClick={() => { /* openHelp is triggered automatically */ }}
                className="btn-primary"
                style={{ backgroundColor: "#ff9800", padding: "4px 12px" }}
              >
                How to prepare on desktop
              </button>
            </div>
          )}

          {/* Action bar */}
          <div className="action-bar">
            <button className="action-bar__btn" onClick={handleAutoDetectClick}
              disabled={vadDetecting || trimming || vadDone || !isFragmentsReady}>
              {vadDetecting && !trimming ? "Detecting..." : vadDone ? "Auto-detect speech ✓" : "Auto-detect speech"}
            </button>
            <button className="action-bar__btn" onClick={handleTrimSilence} disabled={vadDetecting || trimming}>
              {trimming ? "Trimming..." : "Trim silence"}
            </button>
            <button className="action-bar__btn action-bar__btn--danger"
              onClick={() => fragments.length > 0 ? setShowDeleteAllConfirm(true) : undefined}
              disabled={vadDetecting || trimming || fragments.length === 0}>
              Delete all fragments
            </button>
            {vadDetecting && (
              <div className="vad-indicator">
                <div className={`spinner spinner--vad ${trimming ? "spinner--vad-trim" : "spinner--vad-detect"}`} />
                <span>{trimming ? "Detecting speech..." : "Detecting..."}</span>
              </div>
            )}
          </div>

          {/* Fragment list */}
          <div className="fragment-list">
            {displayFragments.map(f => {
              const isEditing = f.id === editingId
              const isThisFragPlaying = !isFilePlayback && isPlaying && playingFragment != null &&
                playingFragment.start === f.start && playingFragment.end === f.end
              const isThisFragPaused = !isFilePlayback && isPaused && playingFragment != null &&
                playingFragment.start === f.start && playingFragment.end === f.end
              return (
                <div key={f.id} ref={el => { if (el) fragmentRefsMap.current.set(f.id, el); else fragmentRefsMap.current.delete(f.id) }}
                  className="fragment-panel">
                  <div onClick={() => { if (!isEditing) startEditingWithAnim(f.id) }}
                    className={`fragment-row${isEditing ? " fragment-row--editing" : ""}`}
                    style={{ marginBottom: f.subtitles.length > 0 ? 0 : undefined }}>
                    <span className="fragment-row__time">
                      {formatTime(f.start)} – {formatTime(f.end)}
                    </span>
                    <div className="fragment-row__actions">
                      <button className="btn-sub" onClick={e => {
                        e.stopPropagation()
                        if (isThisFragPlaying) { handlePauseFragment() }
                        else if (isThisFragPaused) { handleResumeFragment() }
                        else { handlePlayFragment(f) }
                      }}>
                        {isThisFragPlaying ? "⏸" : "▶"}
                      </button>
                      {isEditing && (
                        <>
                          <label style={{ fontSize: "0.8rem", display: "flex", alignItems: "center", gap: 4 }}>
                            ×
                            <input type="number" min={1} max={20} value={f.repeat}
                              style={{ width: 40 }}
                              onClick={e => e.stopPropagation()}
                              onChange={e => {
                                const val = Math.max(1, Math.min(20, Number(e.target.value) || 1))
                                const updated = { ...f, repeat: val }
                                updateLocalFragment(updated)
                                persistSequence(fragments.map(fr => fr.id === f.id ? updated : fr))
                              }}
                            />
                          </label>
                          <button className="btn-sub" onClick={e => {
                            e.stopPropagation()
                            setSubModalFragId(f.id)
                            setSubModalStep("choose-file")
                          }}>
                            Sub
                          </button>
                        </>
                      )}
                      <button className="btn-sub" onClick={e => { e.stopPropagation(); deleteLocalFragment(f.id) }}
                        style={{ color: "#d32f2f" }}>
                        ✕
                      </button>
                    </div>
                  </div>

                  {/* Subtitle display */}
                  {f.subtitles && f.subtitles.length > 0 && (
                    <div className="subtitle-display">
                      {f.subtitles.map((sub, i) => {
                        const file = subtitleFiles.find(sf => sf.id === sub.subtitleFileId)
                        const text = file ? file.content.slice(sub.charStart, sub.charEnd) : "(file not found)"
                        return (
                          <div key={i} className="subtitle-display__row">
                            <span className="subtitle-display__name">{sub.subtitleFileName}:</span>
                            <span className="subtitle-display__text">{text}</span>
                            {isEditing && (
                              <button className="btn-remove-sub" onClick={() => handleRemoveSubtitle(f.id, i)}>✕</button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Export for mobile */}
          <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid #e0e0e0" }}>
            <ExportBundleButton
              audioId={audioId}
              audioName={audioName}
              getBlob={getBlob}
              waveformData={waveformData}
              sequences={allSequencesForExport}
              subtitleFiles={subtitleFiles}
              disabled={!isReady}
            />
          </div>
        </>
      )}

      {/* Back navigation */}
      <div className="player-nav" style={{ marginTop: 16 }}>
        <button onClick={() => navigate(audioId ? `/file/${audioId}/sequences` : "/")}>
          ← Back to sequences
        </button>
      </div>

      {/* Confirm modals */}
      {showAutoDetectConfirm && (
        <div className="modal-overlay" onClick={() => setShowAutoDetectConfirm(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <p>This will replace all existing fragments. Continue?</p>
            <div className="modal-actions">
              <button onClick={handleAutoDetectRun} className="btn-danger">Replace all</button>
              <button onClick={() => setShowAutoDetectConfirm(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showDeleteAllConfirm && (
        <div className="modal-overlay" onClick={() => setShowDeleteAllConfirm(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <p>Delete all fragments? This cannot be undone.</p>
            <div className="modal-actions">
              <button onClick={handleDeleteAllFragments} className="btn-danger">Delete all</button>
              <button onClick={() => setShowDeleteAllConfirm(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Subtitle modal */}
      {subModalFragId && (
        <div className="modal-overlay" onClick={() => { setSubModalFragId(null); setSubModalFile(null) }}>
          <div className="modal-box modal-box--wide" onClick={e => e.stopPropagation()}>
            {subModalStep === "choose-file" ? (
              <>
                <h3 style={{ marginTop: 0 }}>Choose subtitle file</h3>
                {subtitleFiles.length === 0 ? (
                  <p>No subtitle files uploaded. Upload a subtitle file first from the Sequences page.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {subtitleFiles.map(sf => (
                      <button key={sf.id} onClick={() => { setSubModalFile(sf); setSubModalStep("select-text") }}
                        style={{ textAlign: "left", padding: "8px 12px" }}>
                        {sf.name}
                      </button>
                    ))}
                  </div>
                )}
                <div className="modal-actions">
                  <button onClick={() => { setSubModalFragId(null); setSubModalFile(null) }}>Cancel</button>
                </div>
              </>
            ) : (
              <>
                <h3 style={{ marginTop: 0 }}>Select text for subtitle</h3>
                <p style={{ fontSize: "0.85rem", color: "#666" }}>
                  Select the text portion that corresponds to this fragment, then click "Bind selected text".
                </p>
                <div id="subtitle-text-container" className="subtitle-content">
                  {subModalFile?.content}
                </div>
                <div className="modal-actions">
                  <button onClick={handleSubtitleSelect} className="btn-primary">Bind selected text</button>
                  <button onClick={() => { setSubModalStep("choose-file"); setSubModalFile(null) }}>Back</button>
                  <button onClick={() => { setSubModalFragId(null); setSubModalFile(null) }}>Cancel</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Mobile instruction modal (triggered by wrapHeavyOp errors) */}
      {showMobileHelp && heavyError && (
        <MobileInstructionModal
          operationName={heavyError.operationName}
          errorMessage={heavyError.error.message}
          onClose={closeHelp}
        />
      )}

      {/* Mobile instruction modal (triggered by background decode error) */}
      {showDecodeHelp && decodeError && (
        <MobileInstructionModal
          operationName="Audio decoding"
          errorMessage={decodeError.message}
          onClose={() => setDismissDecodeHelp(true)}
        />
      )}
    </div>
  )
}