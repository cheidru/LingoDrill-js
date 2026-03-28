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
// 8. НОВОЕ: если только 1 файл субтитров — сразу открывается "Select text", минуя "Choose subtitle file"
// 9. НОВОЕ: субтитры НЕ отображаются под fragment box в списке фрагментов
// 10. НОВОЕ: кнопка Sub в невыбранном фрагменте показывается только если есть привязанные субтитры
// 11. НОВОЕ: удаление выбранного фрагмента клавишей Delete на клавиатуре

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

  // Ref to read the current visible start time from the Waveform component
  const waveformVisibleStartRef = useRef(0)

  // --- Subtitle selection modal ---
  const [subModalFragId, setSubModalFragId] = useState<string | null>(null)
  const [subModalStep, setSubModalStep] = useState<"choose-file" | "view-existing" | "select-text">("choose-file")
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
    // --- File playback ---
  const [isFilePlayback, setIsFilePlayback] = useState(false)
 
  const handleFilePlay = useCallback(() => {
    // If already in file playback mode and paused — just resume
    if (isFilePlayback && isPaused) {
      play()
      return
    }
    // Otherwise stop any fragment playback and start fresh
    stop()
    setIsFilePlayback(true)
    setPlayingFragment(null)
    // Start playback from the beginning of the visible waveform area
    const visStart = waveformVisibleStartRef.current
    if (visStart > 0.05) {
      console.log("[FragmentEditor] Starting playback from visible waveform start:", visStart.toFixed(2), "s")
      seekTo(visStart)
    }
    play()
  }, [stop, play, seekTo, isFilePlayback, isPaused])
 
  const handleFilePause = useCallback(() => {
    pause()
  }, [pause])
 
  const handleFileStop = useCallback(() => {
    stop()
    setIsFilePlayback(false)
  }, [stop])
 
  const handleFileSeek = useCallback((time: number) => {
    const wasPlaying = isPlaying
    seekTo(time)
    setIsFilePlayback(true)
    setPlayingFragment(null)
    // If was playing, continue playing from new position
    if (wasPlaying) {
      play()
    }
  }, [seekTo, isPlaying, play])

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
    // Stop any playing fragment when selecting a different one
    if (playingFragment) {
      console.log("[FragmentEditor] Stopping playback on fragment selection change")
      stop()
      setPlayingFragment(null)
      setIsFilePlayback(false)
    }
    capturePositions()
    setEditingId(fragId)
    const frag = fragments.find(f => f.id === fragId)
    if (frag) savedBoundsRef.current = { start: frag.start, end: frag.end }
  }, [capturePositions, fragments, playingFragment, stop])

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
  useEffect(() => { stopRef.current = stop }, [stop])
  useEffect(() => {
    return () => {
      stopRef.current()
    }
  }, [])

  // --- Delete fragment by Delete key ---
  // CHANGE 4: Add keyboard listener for Delete key to delete the selected (editing) fragment
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Delete" && editingId) {
        // Don't delete if user is typing in an input field
        const target = e.target as HTMLElement
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return
        console.log("[FragmentEditor] Delete key pressed, deleting fragment:", editingId)
        e.preventDefault()
        deleteLocalFragment(editingId)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [editingId, deleteLocalFragment])

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


  // --- Helper: after subtitle file is determined, check if fragment already has subtitle from that file ---
  const goToSubStepForFile = useCallback((fragId: string, sf: SubtitleFile) => {
    setSubModalFile(sf)
    const frag = fragments.find(f => f.id === fragId)
    const existingSub = frag?.subtitles.find(s => s.subtitleFileId === sf.id)
    if (existingSub) {
      // Fragment already has subtitle from this file — show existing text
      console.log("[FragmentEditor] Existing subtitle found for file:", sf.name)
      setSubModalStep("view-existing")
    } else {
      setSubModalStep("select-text")
    }
  }, [fragments])

  // --- Open subtitle modal ---
  // If only one subtitle file, skip "choose-file" step
  const openSubtitleModal = useCallback((fragId: string) => {
    setSubModalFragId(fragId)
    if (subtitleFiles.length === 1) {
      // Only one subtitle file — skip file selection
      console.log("[FragmentEditor] Single subtitle file detected, skipping file chooser")
      goToSubStepForFile(fragId, subtitleFiles[0])
    } else {
      setSubModalStep("choose-file")
      setSubModalFile(null)
    }
  }, [subtitleFiles, goToSubStepForFile])

  // --- Remove subtitle binding from a fragment ---
  const handleRemoveSubtitle = useCallback(async (fragId: string, subtitleFileId: string) => {
    const updatedAll = fragments.map(f => {
      if (f.id !== fragId) return f
      const newSubs = f.subtitles.filter(s => s.subtitleFileId !== subtitleFileId)
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
              visibleStartRef={waveformVisibleStartRef}
            />
          )}

          {/* File player */}
          <div className="file-player">
            <button onClick={isFilePlayback && isPlaying ? handleFilePause : handleFilePlay}>
              {isFilePlayback && isPlaying ? "⏸ Pause" : isFilePlayback && isPaused ? "▶ Resume" : "▶ Play all"}
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
              // CHANGE 3: Show Sub button in non-selected fragment only if it has subtitles attached
              const hasSubtitles = f.subtitles && f.subtitles.length > 0
              return (
                <div key={f.id} ref={el => { if (el) fragmentRefsMap.current.set(f.id, el); else fragmentRefsMap.current.delete(f.id) }}
                  className="fragment-panel">
                  <div onClick={() => { if (!isEditing) startEditingWithAnim(f.id) }}
                    className={`fragment-row${isEditing ? " fragment-row--editing" : ""}`}>
                    <span className="fragment-row__time">
                      {formatTime(f.start)} – {formatTime(f.end)}
                    </span>
                    <div className="fragment-row__actions">
                      <button className="btn-sub" onClick={e => {
                        e.stopPropagation()
                        if (!isEditing) startEditingWithAnim(f.id)
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
                          {/* CHANGE 3: Sub button always shown for selected (editing) fragment */}
                          <button className="btn-sub" onClick={e => {
                            e.stopPropagation()
                            openSubtitleModal(f.id)
                          }}>
                            Sub
                          </button>
                        </>
                      )}
                      {/* CHANGE 3: Sub button in non-selected fragment only if subtitles are attached */}
                      {!isEditing && hasSubtitles && (
                        <button className="btn-sub" onClick={e => {
                          e.stopPropagation()
                          startEditingWithAnim(f.id)
                          openSubtitleModal(f.id)
                        }}>
                          Sub
                        </button>
                      )}
                      <button className="btn-sub" onClick={e => { e.stopPropagation(); deleteLocalFragment(f.id) }}
                        style={{ color: "#d32f2f" }}>
                        ✕
                      </button>
                    </div>
                  </div>

                  {/* CHANGE 2: Subtitle display below fragment box removed */}
                  {/* Subtitles are no longer shown below the fragment row */}
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
                      <button key={sf.id} onClick={() => goToSubStepForFile(subModalFragId, sf)}
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
            ) : subModalStep === "view-existing" ? (
              <>
                <h3 style={{ marginTop: 0 }}>Attached subtitle</h3>
                {(() => {
                  const frag = fragments.find(f => f.id === subModalFragId)
                  const existingSub = frag?.subtitles.find(s => s.subtitleFileId === subModalFile?.id)
                  const text = existingSub && subModalFile
                    ? subModalFile.content.slice(existingSub.charStart, existingSub.charEnd)
                    : "(not found)"
                  return (
                    <>
                      <p style={{ fontSize: "0.85rem", color: "#666", marginBottom: 8 }}>
                        File: {subModalFile?.name}
                      </p>
                      <div className="subtitle-content" style={{ minHeight: 60, maxHeight: "40vh" }}>
                        {text}
                      </div>
                    </>
                  )
                })()}
                <div className="modal-actions">
                  <button onClick={() => setSubModalStep("select-text")} className="btn-primary">Edit</button>
                  <button onClick={async () => {
                    if (subModalFile) {
                      await handleRemoveSubtitle(subModalFragId, subModalFile.id)
                    }
                    setSubModalFragId(null)
                    setSubModalFile(null)
                  }} className="btn-danger">Unbind</button>
                  {subtitleFiles.length > 1 && (
                    <button onClick={() => { setSubModalStep("choose-file"); setSubModalFile(null) }}>Back</button>
                  )}
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
                  {subtitleFiles.length > 1 && (
                    <button onClick={() => { setSubModalStep("choose-file"); setSubModalFile(null) }}>Back</button>
                  )}
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