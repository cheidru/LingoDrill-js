// pages/FragmentEditorPage.tsx

import { useEffect, useState, useCallback, useRef, useMemo } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useSharedAudioEngine } from "../app/hooks/useSharedAudioEngine"
import { useSequences } from "../app/hooks/useSequences"
import { useSubtitles } from "../app/hooks/useSubtitles"
import { Waveform } from "../app/components/Waveform"
import { VolumeControl } from "../app/components/VolumeControl"
import type { WaveformFragment } from "../app/components/Waveform"
import { buildWaveform } from "../utils/buildWaveform"
import { detectSpeechSegments } from "../utils/detectSpeech"
import { trimSilence } from "../utils/trimSilence"
import type { PlayableFragment } from "../core/audio/audioEngine"
import type { SequenceFragment, FragmentSubtitle, SubtitleFile } from "../core/domain/types"
import { nanoid } from "nanoid"

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

export function FragmentEditorPage() {
  const { id: audioId, seqId } = useParams<{ id: string; seqId?: string }>()
  const navigate = useNavigate()

  const {
    getBlob, addFile, files,
    loadById, playFragment, pause, play, stop, seekTo,
    isReady, isFragmentsReady, isPlaying, isPaused, duration, currentTime,
    volume, setVolume, getAudioBuffer,
  } = useSharedAudioEngine()

  const { sequences, addSequence, updateSequence } = useSequences(audioId ?? null)
  const { subtitleFiles } = useSubtitles(audioId ?? null)

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
  // Prompt to choose fragment for subtitle binding
  const [subPromptMode, setSubPromptMode] = useState(false)
  const [pendingSubFile, setPendingSubFile] = useState<SubtitleFile | null>(null)

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
  useEffect(() => {
    if (!audioId) return
    let cancelled = false

    const load = async () => {
      // Пробуем загрузить waveform из кеша DB
      const { WaveformCacheStorage } = await import("../infrastructure/indexeddb/waveformCacheStorage")
      const cache = new WaveformCacheStorage()
      const cached = await cache.get(audioId)

      if (cached && cached.length > 0 && !cancelled) {
        setWaveformData(cached)
        setWaveformLoading(false)
        return
      }

      // Кеша нет — ждём AudioBuffer от фонового декодирования
      if (!isFragmentsReady) return

      const audioBuffer = getAudioBuffer(audioId)
      if (!audioBuffer || cancelled) return

      // Грубый waveform — мгновенно
      const coarseData = buildWaveform(audioBuffer, 100)
      if (!cancelled) {
        setWaveformData(coarseData)
        setWaveformLoading(false)
      }

      // Детальный waveform — в фоне
      setTimeout(() => {
        if (cancelled) return
        const detailedData = buildWaveform(audioBuffer, 1000)
        if (!cancelled) {
          setWaveformData(detailedData)
          cache.save(audioId, detailedData)
        }
      }, 0)
    }
    load()

    return () => { cancelled = true }
  }, [audioId, isFragmentsReady, getAudioBuffer, getBlob])

  // Load sequence fragments
  useEffect(() => {
    if (sequenceLoaded) return
    if (!seqId) { setSequenceLoaded(true); return }
    const seq = sequences.find(s => s.id === seqId)
    if (seq) {
      setFragments(seq.fragments.map(f => ({ ...f, subtitles: f.subtitles ?? [] })))
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
        window.history.replaceState(null, "", `/file/${audioId}/editor/${newSeq.id}`)
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

  // --- Editing handlers ---

  const startEditing = useCallback((fragId: string) => {
    if (editingId && editingId !== fragId && savedBoundsRef.current) {
      const prev = fragments.find(fr => fr.id === editingId)
      if (prev) updateLocalFragment({ ...prev, start: savedBoundsRef.current.start, end: savedBoundsRef.current.end })
    }
    const f = fragments.find(fr => fr.id === fragId)
    if (!f) return
    setEditingId(fragId)
    savedBoundsRef.current = { start: f.start, end: f.end }
  }, [editingId, fragments, updateLocalFragment])

  const handleFragmentClick = useCallback((fragId: string) => {
    // If in subtitle prompt mode, open subtitle selection for this fragment
    if (subPromptMode && pendingSubFile) {
      setSubModalFragId(fragId)
      setSubModalFile(pendingSubFile)
      setSubModalStep("select-text")
      setSubPromptMode(false)
      setPendingSubFile(null)
      return
    }
    startEditing(fragId)
  }, [startEditing, subPromptMode, pendingSubFile])

  const handleClickOutside = useCallback(() => {
    if (subPromptMode) {
      setSubPromptMode(false)
      setPendingSubFile(null)
      return
    }
    if (!editingId) return
    if (savedBoundsRef.current) {
      const f = fragments.find(fr => fr.id === editingId)
      if (f) updateLocalFragment({ ...f, start: savedBoundsRef.current.start, end: savedBoundsRef.current.end })
    }
    setEditingId(null)
    savedBoundsRef.current = null
  }, [editingId, fragments, updateLocalFragment, subPromptMode])

  const handleEditDrag = useCallback((fragId: string, newStart: number, newEnd: number) => {
    const f = fragments.find(fr => fr.id === fragId)
    if (!f) return
    updateLocalFragment({ ...f, start: newStart, end: newEnd })
  }, [fragments, updateLocalFragment])

  const handleSave = useCallback(async () => {
    if (!editingId) return
    await persistSequence(fragments)
    setEditingId(null)
    savedBoundsRef.current = null
  }, [editingId, fragments, persistSequence])

  // --- Repeat ---

  const incrementRepeat = useCallback(async (fragId: string) => {
    const f = fragments.find(fr => fr.id === fragId)
    if (!f) return
    const updatedAll = fragments.map(fr => fr.id === fragId ? { ...fr, repeat: fr.repeat + 1 } : fr)
    setFragments(updatedAll)
    await persistSequence(updatedAll)
  }, [fragments, persistSequence])

  const decrementRepeat = useCallback(async (fragId: string) => {
    const f = fragments.find(fr => fr.id === fragId)
    if (!f) return
    const updatedAll = fragments.map(fr => fr.id === fragId ? { ...fr, repeat: Math.max(1, fr.repeat - 1) } : fr)
    setFragments(updatedAll)
    await persistSequence(updatedAll)
  }, [fragments, persistSequence])

  // --- Play/Pause ---

  const handlePlayPause = useCallback((f: SequenceFragment) => {
    if (isPlaying && playingFragment?.start === f.start && playingFragment.end === f.end) { pause(); return }
    if (isPaused && playingFragment?.start === f.start && playingFragment.end === f.end) { play(); return }
    const fragment: PlayableFragment = { start: f.start, end: f.end, repeat: f.repeat }
    setPlayingFragment({ start: f.start, end: f.end })
    playFragment(fragment)
  }, [playFragment, pause, play, isPlaying, isPaused, playingFragment])

  // --- Subtitle: Sub button opens file chooser ---

  const handleSubClick = useCallback((fragId: string) => {
    if (subtitleFiles.length === 0) {
      alert("No subtitle files loaded. Upload subtitles on the Fragment Library page.")
      return
    }
    if (subtitleFiles.length === 1) {
      // Only one file — go directly to text selection
      setSubModalFragId(fragId)
      setSubModalFile(subtitleFiles[0])
      setSubModalStep("select-text")
    } else {
      // Multiple files — show chooser
      setSubModalFragId(fragId)
      setSubModalStep("choose-file")
    }
  }, [subtitleFiles])

  const handleSubFileChosen = useCallback((file: SubtitleFile) => {
    setSubModalFile(file)
    setSubModalStep("select-text")
  }, [])

  const handleSubTextSelected = useCallback(async () => {
    if (!subModalFragId || !subModalFile) return

    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      alert("Please select text in the subtitle content.")
      return
    }

    // Find char positions within the subtitle content
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
      // Удаляем предыдущий отрезок из того же файла субтитров, оставляем из других файлов
      const filtered = f.subtitles.filter(s => s.subtitleFileId !== subModalFile.id)
      return { ...f, subtitles: [...filtered, newSub] }
    })

    setFragments(updatedAll)
    await persistSequence(updatedAll)

    // Close modal
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

  // --- Auto-detect speech fragments via VAD ---

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

    // Удаляем существующие фрагменты
    setFragments([])
    setEditingId(null)
    savedBoundsRef.current = null

    setVadDetecting(true)
    setVadProgress(0)

    try {
      const buffer = await blob.arrayBuffer()
      const ctx = new AudioContext()
      const audioBuffer = await ctx.decodeAudioData(buffer)
      await ctx.close()

      const segments = await detectSpeechSegments(audioBuffer, (p) => {
        setVadProgress(p)
      })

      if (segments.length === 0) {
        alert("No speech segments detected.")
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
    } catch (err) {
      // TODO обработка ошибки при сбое в библиотеке Auto-detect speech
      console.error("VAD detection failed:", err)
      alert("Speech detection failed. See console for details.")
    } finally {
      setVadDetecting(false)
      setVadProgress(0)
    }
  }, [audioId, vadDetecting, getBlob, persistSequence])

  const handleAutoDetectClick = useCallback(() => {
    if (fragments.length > 0) {
      setShowAutoDetectConfirm(true)
    } else {
      handleAutoDetectRun()
    }
  }, [fragments.length, handleAutoDetectRun])

  // --- Trim silence ---

  const [trimming, setTrimming] = useState(false)

  const handleTrimSilence = useCallback(async () => {
    if (!audioId || trimming || vadDetecting) return

    const blob = await getBlob(audioId)
    if (!blob) return

    setTrimming(true)

    try {
      const buffer = await blob.arrayBuffer()
      const ctx = new AudioContext()
      const audioBuffer = await ctx.decodeAudioData(buffer)
      await ctx.close()

      let segments: { start: number; end: number }[]

      if (fragments.length > 0) {
        // Используем границы существующих фрагментов (возможно, отредактированных вручную)
        segments = fragments.map(f => ({ start: f.start, end: f.end }))
      } else {
        // Фрагментов нет — запускаем VAD-детекцию
        setVadDetecting(true)
        setVadProgress(0)

        segments = await detectSpeechSegments(audioBuffer, (p) => {
          setVadProgress(p)
        })

        setVadDetecting(false)
        setVadProgress(0)

        if (segments.length === 0) {
          alert("No speech segments detected — nothing to trim.")
          return
        }
      }

      // Trim and create new file
      const { blob: trimmedBlob, segmentMap, newDuration } = trimSilence(audioBuffer, segments)

      const sourceFile = files.find(f => f.id === audioId)
      const baseName = sourceFile?.name?.replace(/\.[^.]+$/, "") ?? "audio"
      const trimmedName = `${baseName}_trimmed.wav`
      const trimmedFile = new File([trimmedBlob], trimmedName, { type: "audio/wav" })
      await addFile(trimmedFile)

      const removedDuration = audioBuffer.duration - newDuration
      const pct = Math.round((removedDuration / audioBuffer.duration) * 100)
      alert(
        `Done! Created "${trimmedName}"\n` +
        `Original: ${audioBuffer.duration.toFixed(1)}s → Trimmed: ${newDuration.toFixed(1)}s\n` +
        `Removed ${removedDuration.toFixed(1)}s of silence (${pct}%)\n` +
        `${segmentMap.length} speech segments preserved.\n\n` +
        `The new file is available in your Audio Library.`
      )
    } catch (err) {
      console.error("Trim silence failed:", err)
      alert("Trim failed. See console for details.")
    } finally {
      setTrimming(false)
      setVadDetecting(false)
      setVadProgress(0)
    }
  }, [audioId, trimming, vadDetecting, getBlob, addFile, fragments, files])

  // --- File playback (full file, not fragment) ---
  const [isFilePlayback, setIsFilePlayback] = useState(false)

  const handleFilePlay = useCallback(() => {
    setIsFilePlayback(true)
    setPlayingFragment(null)
    play()
  }, [play])

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

  // Список фрагментов для отображения:
  // - редактируемый фрагмент всегда первый
  // - остальные отсортированы по start
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

  // Capture positions before render
  const capturePositions = useCallback(() => {
    const rects = new Map<string, DOMRect>()
    fragmentRefsMap.current.forEach((el, id) => {
      rects.set(id, el.getBoundingClientRect())
    })
    prevRectsRef.current = rects
  }, [])

  // Animate after render
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
        requestAnimationFrame(() => {
          el.style.transition = "transform 300ms ease"
          el.style.transform = ""
          el.addEventListener("transitionend", () => {
            el.style.zIndex = ""
            el.style.transition = ""
          }, { once: true })
        })
      })
    })

    prevRectsRef.current = new Map()
  }, [displayFragments, editingId])

  // Capture before editing changes
  const startEditingWithAnim = useCallback((fragId: string) => {
    capturePositions()
    startEditing(fragId)
  }, [capturePositions, startEditing])

  const handleSaveWithAnim = useCallback(async () => {
    capturePositions()
    await handleSave()
  }, [capturePositions, handleSave])

  const handleFragmentClickWithAnim = useCallback((fragId: string) => {
    if (subPromptMode && pendingSubFile) {
      handleFragmentClick(fragId)
      return
    }
    capturePositions()
    startEditing(fragId)
  }, [capturePositions, startEditing, subPromptMode, pendingSubFile, handleFragmentClick])

  return (
    <div className="page">
      <button onClick={() => navigate(`/file/${audioId}/sequences`)}>← Back</button>

      <h2>Fragment Editor {seqId ? "(Edit Sequence)" : "(New Sequence)"}</h2>

      {subPromptMode && (
        <div className="subtitle-prompt">
          Click on a fragment to attach subtitles. <button onClick={() => { setSubPromptMode(false); setPendingSubFile(null) }}>Cancel</button>
        </div>
      )}

      {waveformLoading && (
        <div className="frag-editor__loading">
          <div className="spinner spinner--wf" />
          <span>Loading waveform...</span>
        </div>
      )}

      {!waveformLoading && isReady && (
        <>
          <Waveform
            data={waveformData} duration={duration} fragments={waveformFragments}
            onSelect={addFragment} onFragmentClick={handleFragmentClickWithAnim}
            onClickOutside={handleClickOutside} onEditDrag={handleEditDrag}
            editingId={editingId} currentTime={currentTime} playingFragment={playingFragment}
            showPlaybackCursor={isFilePlayback} isFilePlaying={isFilePlayback && isPlaying}
            onSeek={handleFileSeek}
          />

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

          {!isFragmentsReady && (
            <div className="decode-indicator">
              <div className="spinner spinner--decode" />
              Decoding audio for fragments...
            </div>
          )}

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

          <div className="fragment-list">
            {displayFragments.map(f => {
              const isEditing = f.id === editingId
              return (
                <div key={f.id} ref={el => { if (el) fragmentRefsMap.current.set(f.id, el); else fragmentRefsMap.current.delete(f.id) }}
                  className="fragment-panel">
                  <div onClick={() => { if (!isEditing) startEditingWithAnim(f.id) }}
                    className={`fragment-row${isEditing ? " fragment-row--editing" : ""}`}
                    style={{ marginBottom: f.subtitles.length > 0 ? 0 : 6 }}>
                    <div className="fragment-row__time">{f.start.toFixed(2)} – {f.end.toFixed(2)}</div>
                    <div className="fragment-row__actions" onClick={e => e.stopPropagation()}>
                      {isEditing && <button className="btn-save" onClick={handleSaveWithAnim}>Save</button>}
                      <button className="btn-sub" onClick={() => handleSubClick(f.id)} title="Attach subtitles"
                        disabled={subtitleFiles.length === 0}>Sub</button>
                      <button onClick={() => handlePlayPause(f)}>
                        {isPlaying && playingFragment?.start === f.start && playingFragment.end === f.end ? "Pause" : "Play"}
                      </button>
                      <button onClick={() => deleteLocalFragment(f.id)}>Delete</button>
                      <button onClick={() => decrementRepeat(f.id)}>-</button>
                      <span>x{f.repeat}</span>
                      <button onClick={() => incrementRepeat(f.id)}>+</button>
                    </div>
                  </div>
                  {f.subtitles.length > 0 && (
                    <div className="subtitle-display">
                      {f.subtitles.map((sub, i) => {
                        const file = subtitleFiles.find(sf => sf.id === sub.subtitleFileId)
                        const text = file ? file.content.slice(sub.charStart, sub.charEnd) : "(file not found)"
                        return (
                          <div key={i} className="subtitle-display__row">
                            <span className="subtitle-display__name">{sub.subtitleFileName}:</span>
                            <span className="subtitle-display__text">{text}</span>
                            <button className="btn-remove-sub" onClick={() => handleRemoveSubtitle(f.id, i)}>×</button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {subModalFragId && subModalStep === "choose-file" && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ textAlign: "left" }}>
            <h3 style={{ marginTop: 0 }}>Choose subtitle file</h3>
            {subtitleFiles.map(sf => (
              <div key={sf.id} style={{ marginBottom: 8 }}>
                <button onClick={() => handleSubFileChosen(sf)}>{sf.name}</button>
              </div>
            ))}
            <button onClick={() => { setSubModalFragId(null); setSubModalFile(null) }} style={{ marginTop: 12 }}>Cancel</button>
          </div>
        </div>
      )}

      {subModalFragId && subModalStep === "select-text" && subModalFile && (
        <div className="modal-overlay">
          <div className="modal-box modal-box--wide">
            <h3 style={{ marginTop: 0 }}>Select subtitle text for fragment</h3>
            <p style={{ fontSize: 12, color: "#888", margin: "0 0 12px" }}>
              File: {subModalFile.name} — Highlight the relevant text, then click "Attach Selected"
            </p>
            <div id="subtitle-text-container" className="subtitle-content">{subModalFile.content}</div>
            <div className="modal-actions" style={{ justifyContent: "flex-end" }}>
              <button onClick={() => { setSubModalFragId(null); setSubModalFile(null) }}>Cancel</button>
              <button className="btn-primary" onClick={handleSubTextSelected}>Attach Selected</button>
            </div>
          </div>
        </div>
      )}

      {showAutoDetectConfirm && (
        <div className="modal-overlay">
          <div className="modal-box">
            <p>Auto-detect will remove all existing fragments and replace them with detected speech segments.</p>
            <div className="modal-actions">
              <button className="btn-primary" onClick={handleAutoDetectRun}>Proceed</button>
              <button onClick={() => setShowAutoDetectConfirm(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showDeleteAllConfirm && (
        <div className="modal-overlay">
          <div className="modal-box">
            <p>Delete all {fragments.length} fragments in this sequence?</p>
            <div className="modal-actions">
              <button className="btn-danger" onClick={handleDeleteAllFragments}>Delete all</button>
              <button onClick={() => setShowDeleteAllConfirm(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}