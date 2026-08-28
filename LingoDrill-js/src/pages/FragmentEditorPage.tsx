// pages/FragmentEditorPage.tsx
//
// ИЗМЕНЕНИЯ:
// 1. Все тяжёлые операции обёрнуты в wrapHeavyOp (decode, waveform, VAD, trim)
// 2. Добавлен ExportBundleButton для экспорта данных на мобильное устройство
// 3. При ошибке тяжёлой операции показывается MobileInstructionModal
// 4. Компонент обёрнут в HeavyOperationErrorBoundary (для ошибок рендера)
// 5. Кнопка play фрагмента переключается на pause при воспроизведении
// 6. При уходе со страницы воспроизведение останавливается
// 7. НОВОЕ: handleAutoDetectRun, handleTrimSilence и runVolumeOp не декодируют
//    файл целиком. Auto-detect идёт через decodeMonoPcm (моно 16 кГц чанками),
//    trim/normalize/maximize — через streamAudioChunks (~30 с чанками,
//    результат пишется в WAV по частям). Полное декодирование многочасового
//    файла просило у браузера буфер на несколько гигабайт и падало — это и
//    были ошибки "… failed" на десктопе.
// 12. НОВОЕ: Maximize volume — поднимает каждый фрагмент до потолка (без
//    искажений), в отличие от Normalize, который выравнивает громкость
//    фрагментов между собой. Оба используют один общий выбор фрагментов.
// 8. НОВОЕ: если только 1 файл субтитров — сразу открывается "Select text", минуя "Choose subtitle file"
// 9. НОВОЕ: субтитры НЕ отображаются под fragment box в списке фрагментов
// 10. НОВОЕ: кнопка Sub в невыбранном фрагменте показывается только если есть привязанные субтитры
// 11. НОВОЕ: удаление выбранного фрагмента клавишей Delete на клавиатуре

import { useEffect, useState, useCallback, useRef, useMemo } from "react"
import { useParams, useNavigate, useLocation } from "react-router-dom"
import { useSharedAudioEngine } from "../app/hooks/useSharedAudioEngine"
import { useSequences } from "../app/hooks/useSequences"
import { useSubtitles } from "../app/hooks/useSubtitles"
import { useVocabularies } from "../app/hooks/useVocabularies"
import { useHeavyOperation } from "../app/hooks/useHeavyOperation"
import { Waveform } from "../app/components/Waveform"
import { VolumeControl } from "../app/components/VolumeControl"
import { ExportBundleButton } from "../app/components/ExportBundleButton"
import { MobileInstructionModal } from "../app/components/MobileInstructionModal"
import { HeavyOperationErrorBoundary } from "../app/components/HeavyOperationErrorBoundary"
import type { WaveformFragment } from "../app/components/Waveform"
import { streamWaveform } from "../utils/streamWaveform"
import { detectSpeechSegments } from "../utils/detectSpeech"
import { decodeMonoPcm } from "../utils/decodeMonoPcm"
import { trimSilence } from "../utils/trimSilence"
import { useT } from "../utils/i18n"
import { normalizeFragments } from "../utils/normalizeFragments"
import { maximizeFragments } from "../utils/maximizeFragments"
import type { PlayableFragment } from "../core/audio/audioEngine"
import { getFragmentGap } from "../utils/settings"
import type { Sequence, SequenceFragment, FragmentSubtitle, FragmentVocabulary, SubtitleFile, VocabularyFile, ProcessedOp } from "../core/domain/types"
import { sequenceAudioId, isProcessed } from "../core/domain/sequenceAudio"
import type { TextEdit, BindingSource, BindingOverlap } from "../core/domain/textBindings"
import {
  diffText,
  rebaseSubtitleBindings,
  rebaseVocabularyBindings,
  findSubtitleOverlap,
  findVocabularyOverlap,
} from "../core/domain/textBindings"
import { nanoid } from "nanoid"

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

/** "2 h 24 min" / "3 h" / "45 min" — for the "file is too long" message. */
function formatHoursMinutes(sec: number, hLabel: string, mLabel: string): string {
  const total = Math.round(sec / 60)
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return `${m} ${mLabel}`
  return m === 0 ? `${h} ${hLabel}` : `${h} ${hLabel} ${m} ${mLabel}`
}

/**
 * Longest file auto-detect will run on. Decoding is streamed now, so the cap is
 * about the user's time rather than memory: past this the run takes long enough
 * that splitting the file into parts is the better answer.
 */
const MAX_AUTO_DETECT_SEC = 3 * 60 * 60

/** Share of the auto-detect progress bar spent decoding, before VAD starts. */
const DECODE_PROGRESS_SHARE = 0.4

/** The two fragment-gain operations, which share one fragment picker. */
type VolumeOp = "normalize" | "maximize"

/** "+6.0" / "0.0" — signed decibels for the Maximize result modal. */
function formatDb(db: number): string {
  const rounded = Math.abs(db) < 0.05 ? 0 : db
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)}`
}

/**
 * `processedOps` after an edit that may have dropped fragments.
 *
 * A deleted fragment leaves its audio behind — in a trimmed file it becomes a
 * fresh silent gap — so Trim silence has work to do again and its tick goes.
 * The gain ops do not: every fragment that is still here was already normalized
 * or maximized, and running them again would change nothing.
 */
function nextProcessedOps(seq: Sequence, updated: SequenceFragment[]): ProcessedOp[] | undefined {
  const ops = seq.processedOps
  if (!ops?.includes("trim")) return ops
  const kept = new Set(updated.map(f => f.id))
  if (seq.fragments.every(f => kept.has(f.id))) return ops
  return ops.filter(op => op !== "trim")
}

/** Amplification cap in maximizeFragments — shown in the result modal. */
const MAXIMIZE_GAIN_CAP = 20

/**
 * Прокручивает контейнер с текстом (субтитры / словарь) к символу charOffset,
 * ставя его примерно на четверть высоты сверху. Вызывать после того, как DOM
 * контейнера отрисован.
 */
function scrollTextContainerToChar(
  containerId: string,
  charOffset: number,
  contentLength: number,
  behavior: ScrollBehavior,
): boolean {
  const container = document.getElementById(containerId)
  if (!container) return false

  const textNode = container.firstChild
  if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return false

  try {
    const clamped = Math.max(0, Math.min(charOffset, contentLength))
    const range = document.createRange()
    range.setStart(textNode, clamped)
    range.setEnd(textNode, clamped)

    const rect = range.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()
    const scrollTarget = container.scrollTop + (rect.top - containerRect.top) - containerRect.height / 4
    container.scrollTo({ top: Math.max(0, scrollTarget), behavior })
    return true
  } catch (err) {
    console.warn("[FragmentEditor] Failed to scroll text container:", err)
    return false
  }
}

/**
 * Обёртка с Error Boundary для рендер-ошибок.
 */
export function FragmentEditorPage() {
  const t = useT()
  return (
    <HeavyOperationErrorBoundary operationName={t("editor.op.editor")}>
      <FragmentEditorPageInner />
    </HeavyOperationErrorBoundary>
  )
}

function FragmentEditorPageInner() {
  const { id: audioId, seqId } = useParams<{ id: string; seqId?: string }>()
  const navigate = useNavigate()
  const t = useT()
  const location = useLocation()

  const {
    getBlob, addFile, removeFile, files,
    loadById, playFragment, pause, play, stop, seekTo, setOnEnded,
    isReady, isPlaying, isPaused, duration, currentTime,
    volume, setVolume,
  } = useSharedAudioEngine()

  const { sequences, addSequence, updateSequence } = useSequences(audioId ?? null)
  const { subtitleFiles, updateSubtitleContent } = useSubtitles(audioId ?? null)
  const { vocabularyFiles, updateVocabularyContent } = useVocabularies(audioId ?? null)

  // --- Heavy operation error handling ---
  const { heavyError, showMobileHelp, wrapHeavyOp, clearError, closeHelp } = useHeavyOperation()

  // Error from building the waveform (streaming decode).
  const [waveformError, setWaveformError] = useState<Error | null>(null)
  const [dismissDecodeHelp, setDismissDecodeHelp] = useState(false)
  const showDecodeHelp = !!waveformError && !dismissDecodeHelp

  const [waveformData, setWaveformData] = useState<number[]>([])
  const [waveformLoading, setWaveformLoading] = useState(true)
  const [playingFragment, setPlayingFragment] =
    useState<{ start: number; end: number } | null>(null)


  const [fragments, setFragments] = useState<SequenceFragment[]>([])
  const [sequenceLoaded, setSequenceLoaded] = useState(false)
  const currentSeqIdRef = useRef<string | null>(seqId ?? null)
  /* Mirrors currentSeqIdRef for rendering. The ref is what callbacks read, but
     a ref assignment does not re-render — and a sequence created on the fly
     (persistSequence) only updates the URL via history.replaceState, which
     React Router never sees. Without this the header would keep showing no
     sequence until something else happened to re-render. */
  const [currentSeqId, setCurrentSeqId] = useState<string | null>(seqId ?? null)

  /* The sequence being edited. Read from `sequences` rather than captured once,
     so a rename made in the Sequence library — or the audio swap a processing
     run performs — is picked up here too. */
  const currentSequence = useMemo(
    () => sequences.find(s => s.id === currentSeqId) ?? null,
    [sequences, currentSeqId],
  )

  /* Which audio the editor loads, plays and processes. Not always the file in
     the URL: a sequence that has been trimmed or had its volume raised keeps
     its place in that file's list but plays a processed copy.

     Null means "not known yet" — the sequence exists but has not come back from
     IndexedDB. Loading the original in the meantime would decode a file we are
     about to replace and flash the wrong waveform, so everything downstream
     waits instead. */
  const audioSourceId = useMemo(() => {
    if (!audioId) return null
    if (!currentSeqId) return audioId
    return currentSequence ? sequenceAudioId(currentSequence) : null
  }, [audioId, currentSeqId, currentSequence])

  // --- Editing state ---
  const [editingId, setEditingId] = useState<string | null>(null)
  const savedBoundsRef = useRef<{ start: number; end: number } | null>(null)

  // Refs to read the currently visible waveform window from the Waveform component
  const waveformVisibleStartRef = useRef(0)
  const waveformVisibleEndRef = useRef(Infinity)

  // --- Subtitle selection modal ---
  const [subModalFragId, setSubModalFragId] = useState<string | null>(null)
  const [subModalStep, setSubModalStep] = useState<"choose-file" | "view-existing" | "select-text">("choose-file")
  const [subModalFile, setSubModalFile] = useState<SubtitleFile | null>(null)
  /* Text editing inside the "select text" step. Off by default: binding a
     snippet stays a pure selection, the text is only editable on request.
     What is editable is the fragment's own snippet, not the whole file. */
  const [subTextEditing, setSubTextEditing] = useState(false)
  const [subDraft, setSubDraft] = useState("")
  const [subSaving, setSubSaving] = useState(false)
  /* Set when the snippet shares characters with another fragment's snippet:
     the edit is refused and this names the sequence it clashed with. */
  const [subOverlap, setSubOverlap] = useState<BindingOverlap | null>(null)

  // --- Vocabulary selection modal ---
  const [vocabModalFragId, setVocabModalFragId] = useState<string | null>(null)
  const [vocabModalStep, setVocabModalStep] = useState<"choose-file" | "view-existing" | "select-text">("choose-file")
  const [vocabModalFile, setVocabModalFile] = useState<VocabularyFile | null>(null)
  const [vocabTextEditing, setVocabTextEditing] = useState(false)
  const [vocabDraft, setVocabDraft] = useState("")
  const [vocabSaving, setVocabSaving] = useState(false)
  const [vocabOverlap, setVocabOverlap] = useState<BindingOverlap | null>(null)

  // --- Block delete state ---
  const [blockDeleteStartId, setBlockDeleteStartId] = useState<string | null>(null)
  const [blockDeleteEndId, setBlockDeleteEndId] = useState<string | null>(null)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // --- VAD auto-detect state ---
  const [vadDetecting, setVadDetecting] = useState(false)
  const [, setVadProgress] = useState(0)
  const [vadDone, setVadDone] = useState(false)

  // Load audio
  useEffect(() => {
    if (!audioSourceId) return
    loadById(audioSourceId)
  }, [audioSourceId, loadById])

  // Build the waveform:
  //  1. a cached 4000-point envelope → use directly;
  //  2. otherwise stream-decode the file in frame-aligned chunks, folding RMS
  //     into the 4000-point envelope and rendering it progressively (fills in
  //     left-to-right), then store the finished envelope for future loads.
  // Streaming keeps memory constant, so multi-hour files no longer fail.
  useEffect(() => {
    if (!audioSourceId) return
    let cancelled = false
    const abort = new AbortController()
    /* Bound to audioSourceId, not the URL's file: after a processing run this
       effect re-runs and draws the processed audio the sequence now plays. */
    const sourceId = audioSourceId

    const load = async () => {
      const { WaveformCacheStorage } = await import("../infrastructure/indexeddb/waveformCacheStorage")
      const cache = new WaveformCacheStorage()
      const cached = await cache.get(sourceId)

      if (cached && cached.length > 0 && !cancelled) {
        setWaveformData(cached)
        setWaveformLoading(false)
        return
      }

      const blob = await getBlob(sourceId)
      if (!blob || cancelled) return
      setWaveformError(null)

      try {
        const envelope = await streamWaveform(blob, 4000, {
          signal: abort.signal,
          onProgress: (partial) => {
            if (cancelled) return
            setWaveformData(partial)
            setWaveformLoading(false)
          },
        })
        if (cancelled) return
        setWaveformData(envelope)
        setWaveformLoading(false)
        cache.save(sourceId, envelope)
      } catch (err) {
        if (cancelled) return
        if (err instanceof DOMException && err.name === "AbortError") return
        console.error("Waveform build failed:", err)
        setWaveformError(err instanceof Error ? err : new Error(String(err)))
      }
    }
    load()

    return () => { cancelled = true; abort.abort() }
  }, [audioSourceId, getBlob])

  // Load sequence fragments
  useEffect(() => {
    if (sequenceLoaded) return
    if (!seqId) { setSequenceLoaded(true); return }
    const seq = sequences.find(s => s.id === seqId)
    if (seq) {
      setFragments(seq.fragments.map(f => ({ ...f, subtitles: f.subtitles ? [...f.subtitles] : [] })))
      currentSeqIdRef.current = seq.id
      setCurrentSeqId(seq.id)
      setSequenceLoaded(true)
      if (seq.fragments.length > 0) setVadDone(true)
    }
  }, [seqId, sequences, sequenceLoaded])

  // Pre-select fragment from navigation state (e.g., from Sequence Player edit button)
  const preselectedRef = useRef(false)
  useEffect(() => {
    if (preselectedRef.current) return
    const fragId = (location.state as Record<string, unknown>)?.fragmentId as string | undefined
    if (fragId && fragments.some(f => f.id === fragId)) {
      setEditingId(fragId)
      const frag = fragments.find(f => f.id === fragId)
      if (frag) savedBoundsRef.current = { start: frag.start, end: frag.end }
      preselectedRef.current = true
    }
  }, [fragments, location.state])

  // --- Persist ---

  const persistSequence = useCallback(async (updatedFragments: SequenceFragment[]) => {
    if (!audioId) return
    const sorted = [...updatedFragments].sort((a, b) => a.start - b.start)
    if (currentSeqIdRef.current) {
      const seq = sequences.find(s => s.id === currentSeqIdRef.current)
      if (seq) await updateSequence({ ...seq, fragments: sorted, processedOps: nextProcessedOps(seq, sorted) })
    } else {
      const newSeq = await addSequence(sorted)
      if (newSeq) {
        currentSeqIdRef.current = newSeq.id
        setCurrentSeqId(newSeq.id)
        window.history.replaceState(null, "", `/LingoDrill-js/file/${audioId}/editor/${newSeq.id}`)
      }
    }
  }, [audioId, sequences, addSequence, updateSequence])

  /**
   * Hands the sequence being edited over to a processed copy of its audio
   * (trimmed, normalized, maximized) and returns the sequence's name.
   *
   * The sequence itself does not move: same id, same label, same place in this
   * file's list, same subtitle and vocabulary bindings. Only `processedAudioId`,
   * `processedOps` and the fragment positions change. When the editor has no
   * sequence yet — trimming a freshly opened file — one is created here, still under the
   * original file, because a processed copy is hidden from the library and a
   * sequence is the only thing that can lead back to it.
   */
  const attachProcessedAudio = useCallback(async (
    processedFragments: SequenceFragment[],
    processedAudioId: string,
    processedDuration: number,
    op: ProcessedOp,
  ): Promise<string> => {
    if (!audioId) return ""

    const previous = currentSeqIdRef.current
      ? sequences.find(s => s.id === currentSeqIdRef.current)
      : undefined
    const replacedAudioId = previous?.processedAudioId

    let label: string
    if (previous) {
      /* Ops accumulate: trimming and then maximizing ticks off both buttons. */
      const processedOps = previous.processedOps?.includes(op)
        ? previous.processedOps
        : [...(previous.processedOps ?? []), op]
      await updateSequence({
        ...previous,
        fragments: processedFragments,
        processedAudioId,
        processedDuration,
        processedOps,
      })
      label = previous.label
    } else {
      const newSeq = await addSequence(processedFragments, { audioId: processedAudioId, duration: processedDuration, ops: [op] })
      if (!newSeq) return ""
      currentSeqIdRef.current = newSeq.id
      setCurrentSeqId(newSeq.id)
      window.history.replaceState(null, "", `/LingoDrill-js/file/${audioId}/editor/${newSeq.id}`)
      label = newSeq.label
    }

    /* Processing twice — trim, then maximize — leaves the intermediate copy
       behind. Nothing can reach it once this sequence has moved on, so it goes,
       unless a copy of the sequence is still playing it. */
    if (replacedAudioId && replacedAudioId !== processedAudioId) {
      const stillUsed = sequences.some(
        s => s.id !== previous?.id && s.processedAudioId === replacedAudioId,
      )
      if (!stillUsed) {
        console.log("[FragmentEditor] Dropping superseded processed audio:", replacedAudioId)
        await removeFile(replacedAudioId)
      }
    }

    return label
  }, [audioId, sequences, addSequence, updateSequence, removeFile])

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
    /* Deleting the selected fragment moves the selection to its neighbour on
       the left, so working backwards through a sequence — delete, delete,
       delete — never needs a fresh click in between. The leftmost fragment has
       no neighbour to hand over to, so there the selection simply clears. */
    if (editingId === fragId) {
      const sorted = [...fragments].sort((a, b) => a.start - b.start)
      const idx = sorted.findIndex(f => f.id === fragId)
      const left = idx > 0 ? sorted[idx - 1] : null
      setEditingId(left?.id ?? null)
      savedBoundsRef.current = left ? { start: left.start, end: left.end } : null
    }
    const updated = fragments.filter(f => f.id !== fragId)
    setFragments(updated)
    stop(); setPlayingFragment(null)
    await persistSequence(updated)
  }, [editingId, fragments, stop, persistSequence])

  const updateLocalFragment = useCallback((updated: SequenceFragment) => {
    setFragments(prev => prev.map(f => f.id === updated.id ? updated : f))
  }, [])

  // --- Block delete ---
  const handleBlockDeleteStart = useCallback((fragId: string) => {
    setBlockDeleteStartId(fragId)
    setBlockDeleteEndId(null)
    console.log("[FragmentEditor] Block delete started from fragment:", fragId)
  }, [])

  const handleBlockDeleteSelectEnd = useCallback((fragId: string) => {
    if (!blockDeleteStartId || fragId === blockDeleteStartId) return
    setBlockDeleteEndId(fragId)
  }, [blockDeleteStartId])

  const handleBlockDeleteConfirm = useCallback(async () => {
    if (!blockDeleteStartId || !blockDeleteEndId) return
    const sorted = [...fragments].sort((a, b) => a.start - b.start)
    const startIdx = sorted.findIndex(f => f.id === blockDeleteStartId)
    const endIdx = sorted.findIndex(f => f.id === blockDeleteEndId)
    if (startIdx === -1 || endIdx === -1) return
    const fromIdx = Math.min(startIdx, endIdx)
    const toIdx = Math.max(startIdx, endIdx)
    const idsToDelete = new Set(sorted.slice(fromIdx, toIdx + 1).map(f => f.id))
    console.log("[FragmentEditor] Block deleting", idsToDelete.size, "fragments")
    if (editingId && idsToDelete.has(editingId)) {
      setEditingId(null); savedBoundsRef.current = null
    }
    const updated = fragments.filter(f => !idsToDelete.has(f.id))
    setFragments(updated)
    stop(); setPlayingFragment(null)
    await persistSequence(updated)
    setBlockDeleteStartId(null)
    setBlockDeleteEndId(null)
  }, [blockDeleteStartId, blockDeleteEndId, fragments, editingId, stop, persistSequence])

  const handleBlockDeleteCancel = useCallback(() => {
    setBlockDeleteStartId(null)
    setBlockDeleteEndId(null)
  }, [])

  // Compute block delete info for UI
  const blockDeleteCount = useMemo(() => {
    if (!blockDeleteStartId || !blockDeleteEndId) return 0
    const sorted = [...fragments].sort((a, b) => a.start - b.start)
    const startIdx = sorted.findIndex(f => f.id === blockDeleteStartId)
    const endIdx = sorted.findIndex(f => f.id === blockDeleteEndId)
    if (startIdx === -1 || endIdx === -1) return 0
    return Math.abs(endIdx - startIdx) + 1
  }, [blockDeleteStartId, blockDeleteEndId, fragments])

  // Fragment long-press handlers for block delete
  const longPressFiredRef = useRef(false)

  const handleFragmentPointerDown = useCallback((fragId: string) => {
    longPressFiredRef.current = false
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current)
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null
      longPressFiredRef.current = true
      handleBlockDeleteStart(fragId)
    }, 600)
  }, [handleBlockDeleteStart])

  const handleFragmentPointerUp = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }, [])

  const handleFragmentPointerLeave = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }, [])

  // --- Auto-detect speech fragments via VAD ---
  // ОБЁРНУТО в wrapHeavyOp

  const [showAutoDetectConfirm, setShowAutoDetectConfirm] = useState(false)
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false)
  /** Duration of the file that was rejected as too long, or null. */
  const [autoDetectTooLong, setAutoDetectTooLong] = useState<number | null>(null)

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
    if (!audioSourceId || vadDetecting) return

    // Guard before anything heavy: past a few hours the run takes long enough
    // that splitting the file is the better answer.
    if (duration > MAX_AUTO_DETECT_SEC) {
      setAutoDetectTooLong(duration)
      return
    }

    const blob = await getBlob(audioSourceId)
    if (!blob) return

    setFragments([])
    setEditingId(null)
    savedBoundsRef.current = null

    setVadDetecting(true)
    setVadProgress(0)

    // ОБЁРНУТО в wrapHeavyOp
    // Декодируем в моно 16 кГц чанками (decodeMonoPcm), а не целиком через
    // safeDecodeAudioBuffer: полное декодирование многочасового файла просит у
    // браузера буфер на несколько гигабайт и падает — это и была ошибка
    // «Auto-detect speech failed» на десктопе.
    const segments = await wrapHeavyOp(t("editor.op.autoDetect"), async () => {
      const { samples, sampleRate } = await decodeMonoPcm(blob, {
        onProgress: (p) => setVadProgress(p * DECODE_PROGRESS_SHARE),
      })

      const segs = await detectSpeechSegments(samples, sampleRate, (p) => {
        setVadProgress(DECODE_PROGRESS_SHARE + p * (1 - DECODE_PROGRESS_SHARE))
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
      alert(t("editor.noSpeechDetected"))
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
  }, [audioSourceId, vadDetecting, duration, getBlob, persistSequence, wrapHeavyOp, t])

  const handleAutoDetectClick = useCallback(() => {
    // Check the length first, so an over-long file is not preceded by a
    // pointless "replace all fragments?" confirmation.
    if (duration > MAX_AUTO_DETECT_SEC) {
      setAutoDetectTooLong(duration)
      return
    }
    if (fragments.length > 0) {
      setShowAutoDetectConfirm(true)
    } else {
      handleAutoDetectRun()
    }
  }, [fragments.length, duration, handleAutoDetectRun])

  // --- Trim silence ---
  // ОБЁРНУТО в wrapHeavyOp

  const [trimming, setTrimming] = useState(false)
  const [trimResultInfo, setTrimResultInfo] = useState<{
    trimmedName: string
    originalDuration: number
    newDuration: number
    removedDuration: number
    pct: number
    segmentCount: number
    /** Label of the sequence that now plays the trimmed audio. */
    sequenceLabel: string
  } | null>(null)

  // --- Volume operation state ---
  //
  // Normalize volume and Maximize volume share one fragment-picker mode: the
  // checkboxes, the banner and the result modal are identical, only the gain
  // rule and the wording differ. `volumeMode` says which one the picker is
  // currently arming, or null when it is closed.
  const [volumeMode, setVolumeMode] = useState<VolumeOp | null>(null)
  const [volumeExcluded, setVolumeExcluded] = useState<Set<string>>(new Set())
  const [normalizing, setNormalizing] = useState(false)
  const [maximizing, setMaximizing] = useState(false)
  const [volumeResultInfo, setVolumeResultInfo] = useState<{
    op: VolumeOp
    createdName: string
    selectedCount: number
    totalCount: number
    /** Label of the sequence that now plays the processed audio. */
    sequenceLabel: string
    /** Maximize only: gains actually applied, in dB. */
    gainsDb?: number[]
    /** Maximize only: fragments that stopped at the amplification cap. */
    cappedCount?: number
  } | null>(null)

  const handleTrimSilence = useCallback(async () => {
    if (!audioId || !audioSourceId || trimming || vadDetecting) return

    const blob = await getBlob(audioSourceId)
    if (!blob) return

    setTrimming(true)

    // ОБЁРНУТО в wrapHeavyOp
    const result = await wrapHeavyOp(t("editor.op.trim"), async () => {
      let segments: { start: number; end: number }[]

      if (fragments.length > 0) {
        segments = fragments.map(f => ({ start: f.start, end: f.end }))
      } else {
        setVadDetecting(true)
        setVadProgress(0)

        // Chunked mono decode, same as auto-detect: decoding a multi-hour file
        // whole asks the browser for a several-GB buffer and fails.
        const { samples, sampleRate } = await decodeMonoPcm(blob, {
          onProgress: (p) => setVadProgress(p * DECODE_PROGRESS_SHARE),
        })

        segments = await detectSpeechSegments(samples, sampleRate, (p) =>
          setVadProgress(DECODE_PROGRESS_SHARE + p * (1 - DECODE_PROGRESS_SHARE)),
        )

        setVadDetecting(false)
        setVadProgress(0)

        if (segments.length === 0) {
          throw new Error(t("editor.noSpeechToTrim"))
        }
      }

      const {
        blob: trimmedBlob,
        segmentMap,
        newDuration,
        originalDuration,
        waveform: trimmedWaveform,
      } = await trimSilence(blob, segments)

      const sourceFile = files.find(f => f.id === audioSourceId)
      const baseName = sourceFile?.name?.replace(/\.[^.]+$/, "") ?? "audio"
      const trimmedName = `${baseName}_trimmed.wav`
      const trimmedFile = new File([trimmedBlob], trimmedName, { type: "audio/wav" })

      /* The trimmed audio is a processed copy of the file in the URL, not a
         library entry of its own: `derivedFrom` keeps it out of the Audio
         Library and ties its lifetime to the original. */
      const newAudioId = crypto.randomUUID()
      await addFile(trimmedFile, newAudioId, audioId)

      // --- Cache the waveform built while writing the trimmed file ---
      const { WaveformCacheStorage } = await import("../infrastructure/indexeddb/waveformCacheStorage")
      const waveformCache = new WaveformCacheStorage()
      await waveformCache.save(newAudioId, trimmedWaveform)
      console.log("[FragmentEditor] Built and cached waveform for trimmed file")

      /* Subtitles and vocabularies are not copied. The sequence stays under the
         original file, so its fragments keep pointing at that file's subtitle
         files — and trimming moves fragments in time without touching a single
         character offset, so those bindings stay correct as they are. */

      // --- Remap fragments to the new trimmed timeline ---
      // Helper: convert an old time to the new trimmed time using segmentMap
      const remapTime = (oldTime: number): number | null => {
        for (const seg of segmentMap) {
          if (oldTime >= seg.oldStart && oldTime <= seg.oldEnd) {
            const offset = oldTime - seg.oldStart
            return seg.newStart + offset
          }
        }
        return null // time falls in a removed gap
      }

      /* Fragment ids survive the remap: the fragment is the same drill, just at
         a new position on a shorter timeline, and keeping the id means anything
         holding onto one (the player's edit link, for instance) still resolves. */
      const remappedFragments: SequenceFragment[] = []
      for (const frag of fragments) {
        const newStart = remapTime(frag.start)
        const newEnd = remapTime(frag.end)
        if (newStart !== null && newEnd !== null && newEnd > newStart) {
          remappedFragments.push({ ...frag, start: newStart, end: newEnd })
        }
      }

      /* Trimming a file that had no fragments yet: the detected speech segments
         become the sequence, on the trimmed timeline. Without this the trimmed
         audio would have nothing pointing at it and — being hidden from the
         library — no way back to it. */
      if (fragments.length === 0) {
        for (const seg of segments) {
          const newStart = remapTime(seg.start)
          const newEnd = remapTime(seg.end)
          if (newStart !== null && newEnd !== null && newEnd > newStart) {
            remappedFragments.push({
              id: nanoid(), start: newStart, end: newEnd, repeat: 1, speed: 1, subtitles: [],
            })
          }
        }
      }

      remappedFragments.sort((a, b) => a.start - b.start)

      /* Point the sequence at the trimmed audio, in place. It keeps its id, its
         name and its spot in this file's list — only what it plays changes. */
      const label = await attachProcessedAudio(remappedFragments, newAudioId, newDuration, "trim")

      return { originalDuration, segmentMap, newDuration, trimmedName, remappedFragments, label }
    })

    if (result) {
      const { originalDuration, segmentMap, newDuration, trimmedName, remappedFragments, label } = result
      const removedDuration = originalDuration - newDuration
      const pct = Math.round((removedDuration / originalDuration) * 100)

      // The waveform under the fragments is about to change, so drop any
      // in-progress edit and show the fragments at their new positions.
      stop()
      setPlayingFragment(null)
      setEditingId(null)
      savedBoundsRef.current = null
      setFragments(remappedFragments)
      if (remappedFragments.length > 0) setVadDone(true)

      setTrimResultInfo({
        trimmedName,
        originalDuration,
        newDuration,
        removedDuration,
        pct,
        segmentCount: segmentMap.length,
        sequenceLabel: label,
      })
    }

    setTrimming(false)
    setVadDetecting(false)
    setVadProgress(0)
  }, [audioId, audioSourceId, trimming, vadDetecting, getBlob, addFile, fragments, files, stop, attachProcessedAudio, wrapHeavyOp, t])

  // --- Normalize / Maximize volume ---
  //
  // Both write a new WAV beside the original and clone its subtitles and
  // sequence onto it; only the gain rule and the wording differ, so one runner
  // serves both. Normalize matches every fragment's average loudness to the
  // loudest one; Maximize lifts each fragment on its own to just under full
  // scale, which is the most gain possible without clipping.

  /** A gain operation is running — both block the same set of actions. */
  const volumeBusy = normalizing || maximizing

  /* Steps already applied to the sequence being edited. The button that ran one
     is ticked and disabled, the way Auto-detect speech is once it has run. */
  const processedOps = currentSequence?.processedOps ?? []
  const trimDone = processedOps.includes("trim")
  const normalizeDone = processedOps.includes("normalize")
  const maximizeDone = processedOps.includes("maximize")

  const openVolumeMode = useCallback((op: VolumeOp) => {
    setVolumeExcluded(new Set())
    setVolumeMode(op)
  }, [])

  const runVolumeOp = useCallback(async (op: VolumeOp) => {
    if (!audioId || !audioSourceId || normalizing || maximizing || vadDetecting || trimming) return

    const setBusy = op === "normalize" ? setNormalizing : setMaximizing
    setBusy(true)
    setVolumeMode(null)

    const opLabel = op === "normalize" ? t("editor.op.normalize") : t("editor.op.maximize")

    const result = await wrapHeavyOp(opLabel, async () => {
      const srcBlob = await getBlob(audioSourceId)
      if (!srcBlob) {
        throw new Error(t("editor.audioNotFound"))
      }
      const selectedFragments = fragments.filter(f => !volumeExcluded.has(f.id))
      if (selectedFragments.length === 0) {
        throw new Error(t("editor.noFragmentsNormalize"))
      }

      let blob: Blob
      let waveform: number[]
      let gainsDb: number[] | undefined
      let cappedCount: number | undefined

      if (op === "normalize") {
        const r = await normalizeFragments(srcBlob, selectedFragments)
        blob = r.blob
        waveform = r.waveform
      } else {
        const r = await maximizeFragments(srcBlob, selectedFragments)
        blob = r.blob
        waveform = r.waveform
        gainsDb = r.fragmentGains.map(g => 20 * Math.log10(g.gainApplied))
        cappedCount = r.cappedCount
      }

      const sourceFile = files.find(f => f.id === audioSourceId)
      const baseName = sourceFile?.name?.replace(/\.[^.]+$/, "") ?? "audio"
      const suffix = op === "normalize" ? "normalized" : "maximized"
      const createdName = `${baseName}_${suffix}.wav`
      const createdFile = new File([blob], createdName, { type: "audio/wav" })

      /* Derived from the file in the URL: hidden from the Audio Library and
         deleted along with it (see AudioFile.derivedFrom). */
      const newAudioId = crypto.randomUUID()
      await addFile(createdFile, newAudioId, audioId)

      // Cache the waveform built while writing the new file
      const { WaveformCacheStorage } = await import("../infrastructure/indexeddb/waveformCacheStorage")
      const waveformCache = new WaveformCacheStorage()
      await waveformCache.save(newAudioId, waveform)

      /* Fragments carry over untouched — a gain change moves nothing in time —
         and so do their subtitle and vocabulary bindings, which still belong to
         the file this sequence lives under. */
      const label = await attachProcessedAudio([...fragments].sort((a, b) => a.start - b.start), newAudioId, duration, op)

      return {
        op,
        createdName,
        selectedCount: selectedFragments.length,
        totalCount: fragments.length,
        sequenceLabel: label,
        gainsDb,
        cappedCount,
      }
    })

    if (result) {
      // Same timeline, louder audio: only the waveform under the fragments
      // changes, but playback has to stop for the new file to take over.
      stop()
      setPlayingFragment(null)
      setVolumeResultInfo(result)
    }

    setBusy(false)
  }, [audioId, audioSourceId, normalizing, maximizing, vadDetecting, trimming, getBlob, fragments, volumeExcluded, files, addFile, duration, stop, attachProcessedAudio, wrapHeavyOp, t])

  // --- File playback ---
    // --- File playback ---
  const [isFilePlayback, setIsFilePlayback] = useState(false)
 
  const handleFilePlay = useCallback(() => {
    // Start playback from the beginning of the visible waveform area
    const visStart = waveformVisibleStartRef.current
    // If already in file playback mode and paused — just resume
    if (isFilePlayback && isPaused) {
      /* Unless the waveform has since been scrolled away from the cursor:
         resuming from a point off either edge plays audio the user cannot see
         and leaves the view looking untouched, so pick up at the first sample
         that is actually on screen instead. */
      const offScreen = currentTime < visStart || currentTime > waveformVisibleEndRef.current
      if (offScreen) seekTo(visStart)
      play()
      return
    }
    // Otherwise stop any fragment playback and start fresh
    stop()
    setIsFilePlayback(true)
    setPlayingFragment(null)
    if (visStart > 0.05) {
      console.log("[FragmentEditor] Starting playback from visible waveform start:", visStart.toFixed(2), "s")
      seekTo(visStart)
    }
    play()
  }, [stop, play, seekTo, isFilePlayback, isPaused, currentTime])
 
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
  // Fragments play straight from the streamed file via start/end time bounds —
  // no decode, so playback starts immediately.
  const handlePlayFragment = useCallback((f: SequenceFragment) => {
    stop()
    setIsFilePlayback(false)
    const pf: PlayableFragment = { start: f.start, end: f.end, repeat: f.repeat, speed: f.speed, gap: getFragmentGap() }
    setPlayingFragment({ start: f.start, end: f.end })
    playFragment(pf)
  }, [stop, playFragment])

  const handlePauseFragment = useCallback(() => {
    pause()
  }, [pause])

  const handleResumeFragment = useCallback(() => {
    play()
  }, [play])

  /* Is this the fragment currently loaded into the transport? Compared by
     bounds rather than id because that is all playingFragment carries — and
     the bounds are also what stops matching the moment an edge is dragged. */
  const isTransportFragment = useCallback((f: SequenceFragment) =>
    !isFilePlayback && playingFragment != null &&
    playingFragment.start === f.start && playingFragment.end === f.end,
  [isFilePlayback, playingFragment])

  /* Once a fragment is selected there is nothing left for a click on it to
     select, so it becomes the transport: play, then pause, then resume, as many
     times as the user clicks. The first click on any other fragment still only
     selects it — and stops whatever was sounding. */
  const handleFragmentClick = useCallback((fragId: string) => {
    const frag = fragments.find(f => f.id === fragId)
    if (!frag) return
    if (isTransportFragment(frag)) {
      if (isPlaying) { handlePauseFragment(); return }
      if (isPaused) { handleResumeFragment(); return }
    }
    /* Falls through to a fresh play when the fragment is selected but silent —
       including once it has played out, which drops it from the transport. */
    if (fragId === editingId) { handlePlayFragment(frag); return }
    startEditingWithAnim(fragId)
  }, [fragments, isTransportFragment, isPlaying, isPaused, handlePauseFragment,
      handleResumeFragment, editingId, handlePlayFragment, startEditingWithAnim])

  /* Dragging an edge invalidates what is sounding: the sound is bounded by the
     old start/end, not the ones now on screen. Playback stops outright, and
     with it the green progress shading — it measures against bounds that have
     moved. Cheap to call on every drag tick: without playback it does nothing. */
  const stopPlaybackForEdit = useCallback(() => {
    if (!playingFragment) return
    console.log("[FragmentEditor] Stopping playback — fragment boundary dragged")
    stop()
    setPlayingFragment(null)
  }, [playingFragment, stop])

  /* The last repeat running out ends the shading too. The engine reports it
     through onEnded — the only end the page never triggers itself — and without
     dropping playingFragment here the green progress fill would sit frozen over
     a fragment that has finished sounding. */
  useEffect(() => {
    setOnEnded(() => {
      console.log("[FragmentEditor] Fragment playback ended")
      setPlayingFragment(null)
    })
    return () => setOnEnded(null)
  }, [setOnEnded])

  // Stop playback when leaving the page (unmount)
  const stopRef = useRef(stop)
  useEffect(() => { stopRef.current = stop }, [stop])
  useEffect(() => {
    return () => {
      stopRef.current()
    }
  }, [])

  // --- Delete fragment by Delete key, Escape cancels block delete ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return

      if (e.key === "Escape" && blockDeleteStartId) {
        e.preventDefault()
        handleBlockDeleteCancel()
        return
      }
      if (e.key === "Delete" && editingId) {
        console.log("[FragmentEditor] Delete key pressed, deleting fragment:", editingId)
        e.preventDefault()
        deleteLocalFragment(editingId)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [editingId, deleteLocalFragment, blockDeleteStartId, handleBlockDeleteCancel])

  const closeSubModal = useCallback(() => {
    setSubModalFragId(null)
    setSubModalFile(null)
    setSubTextEditing(false)
    setSubOverlap(null)
  }, [])

  const closeVocabModal = useCallback(() => {
    setVocabModalFragId(null)
    setVocabModalFile(null)
    setVocabTextEditing(false)
    setVocabOverlap(null)
  }, [])

  /* --- Where a snippet may clash ---
     Bindings are ranges into one shared text, so a fragment in any sequence of
     this audio file can be reading the very characters being edited. The
     sequence open in the editor contributes its live state, the rest come from
     storage. */
  const bindingSources = useMemo<BindingSource[]>(() => {
    const others = sequences
      .filter(s => s.id !== currentSeqId)
      .map(s => ({ label: s.label, fragments: s.fragments }))
    return [{ label: currentSequence?.label ?? t("editor.thisSequence"), fragments }, ...others]
  }, [sequences, currentSeqId, currentSequence, fragments, t])

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
    closeSubModal()
    sel.removeAllRanges()
  }, [subModalFragId, subModalFile, fragments, persistSequence, closeSubModal])


  // --- Helper: after subtitle file is determined, check if fragment already has subtitle from that file ---
  const goToSubStepForFile = useCallback((fragId: string, sf: SubtitleFile) => {
    setSubModalFile(sf)
    setSubOverlap(null)
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

  /* --- Editing the subtitle file's own text ---

     A snippet is a character range into the file's text, shared by every
     sequence of this audio file, so rewriting a word moves every binding that
     sits after it. The edit is therefore applied to the file and re-based
     through all of those sequences in one go: the one open in the editor from
     the live `fragments` state, the rest straight from storage. */
  const applySubtitleTextEdit = useCallback(async (subtitleFileId: string, edit: TextEdit) => {
    const rebasedLocal = rebaseSubtitleBindings(fragments, subtitleFileId, edit)
    if (rebasedLocal !== fragments) {
      setFragments(rebasedLocal)
      // No sequence yet means no bindings either — nothing to write.
      if (currentSeqIdRef.current) await persistSequence(rebasedLocal)
    }

    for (const seq of sequences) {
      if (seq.id === currentSeqIdRef.current) continue
      const rebased = rebaseSubtitleBindings(seq.fragments, subtitleFileId, edit)
      if (rebased !== seq.fragments) {
        console.log("[FragmentEditor] Rebased subtitle bindings in sequence:", seq.label)
        await updateSequence({ ...seq, fragments: rebased })
      }
    }
  }, [fragments, sequences, persistSequence, updateSequence])

  /* The snippet the open fragment reads from the open file — what "Edit text"
     edits. Absent while a fragment with no binding is picking its text, and
     then there is nothing to edit yet. */
  const subBinding = useMemo(() => {
    if (!subModalFragId || !subModalFile) return null
    const frag = fragments.find(f => f.id === subModalFragId)
    return frag?.subtitles.find(s => s.subtitleFileId === subModalFile.id) ?? null
  }, [subModalFragId, subModalFile, fragments])

  const startSubTextEdit = useCallback(() => {
    if (!subModalFile || !subModalFragId || !subBinding) return

    /* Two fragments reading the same characters cannot both be edited here:
       rewriting the span would rewrite the other fragment's snippet as well,
       and there is no re-basing that keeps it on its own words. */
    const overlap = findSubtitleOverlap(bindingSources, subModalFile.id, subBinding, subModalFragId)
    if (overlap) {
      console.log("[FragmentEditor] Subtitle snippet overlaps another fragment's:", overlap)
      setSubOverlap(overlap)
      return
    }

    setSubOverlap(null)
    setSubDraft(subModalFile.content.slice(subBinding.charStart, subBinding.charEnd))
    setSubTextEditing(true)
  }, [subModalFile, subModalFragId, subBinding, bindingSources])

  const handleSubTextSave = useCallback(async () => {
    if (!subModalFile || !subBinding) return

    /* Only the snippet was editable, so the file's new text is the old one with
       that span replaced — which is exactly the shape `diffText` reduces to,
       and every other binding re-bases across it as usual. */
    const content = subModalFile.content
    const nextContent = content.slice(0, subBinding.charStart) + subDraft + content.slice(subBinding.charEnd)

    const edit = diffText(content, nextContent)
    if (!edit) {
      setSubTextEditing(false)
      return
    }

    setSubSaving(true)
    try {
      const updated = await updateSubtitleContent(subModalFile.id, nextContent)
      if (updated) setSubModalFile(updated)
      await applySubtitleTextEdit(subModalFile.id, edit)
    } finally {
      setSubSaving(false)
      setSubTextEditing(false)
    }
  }, [subModalFile, subBinding, subDraft, updateSubtitleContent, applySubtitleTextEdit])

  // --- Vocabulary handlers ---
  const handleVocabularySelect = useCallback(async () => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || !vocabModalFile || !vocabModalFragId) return

    const container = document.getElementById("vocab-text-container")
    if (!container) return

    const range = sel.getRangeAt(0)
    const preRange = document.createRange()
    preRange.selectNodeContents(container)
    preRange.setEnd(range.startContainer, range.startOffset)
    const charStart = preRange.toString().length
    const charEnd = charStart + range.toString().length

    const newVocab: FragmentVocabulary = {
      vocabularyFileId: vocabModalFile.id,
      vocabularyFileName: vocabModalFile.name,
      charStart,
      charEnd,
    }

    const updatedAll = fragments.map(f => {
      if (f.id !== vocabModalFragId) return f
      const existing = f.vocabularies ?? []
      const filtered = existing.filter(v => v.vocabularyFileId !== vocabModalFile.id)
      return { ...f, vocabularies: [...filtered, newVocab] }
    })

    setFragments(updatedAll)
    await persistSequence(updatedAll)
    closeVocabModal()
    sel.removeAllRanges()
  }, [vocabModalFragId, vocabModalFile, fragments, persistSequence, closeVocabModal])

  const goToVocabStepForFile = useCallback((fragId: string, vf: VocabularyFile) => {
    setVocabModalFile(vf)
    setVocabOverlap(null)
    const frag = fragments.find(f => f.id === fragId)
    const existing = (frag?.vocabularies ?? []).find(v => v.vocabularyFileId === vf.id)
    if (existing) {
      setVocabModalStep("view-existing")
    } else {
      setVocabModalStep("select-text")
    }
  }, [fragments])

  const openVocabularyModal = useCallback((fragId: string) => {
    setVocabModalFragId(fragId)
    if (vocabularyFiles.length === 1) {
      goToVocabStepForFile(fragId, vocabularyFiles[0])
    } else {
      setVocabModalStep("choose-file")
      setVocabModalFile(null)
    }
  }, [vocabularyFiles, goToVocabStepForFile])

  const handleRemoveVocabulary = useCallback(async (fragId: string, vocabularyFileId: string) => {
    const updatedAll = fragments.map(f => {
      if (f.id !== fragId) return f
      const newVocabs = (f.vocabularies ?? []).filter(v => v.vocabularyFileId !== vocabularyFileId)
      return { ...f, vocabularies: newVocabs }
    })
    setFragments(updatedAll)
    await persistSequence(updatedAll)
  }, [fragments, persistSequence])

  /* --- Editing the vocabulary file's own text --- (same contract as subtitles) */
  const applyVocabularyTextEdit = useCallback(async (vocabularyFileId: string, edit: TextEdit) => {
    const rebasedLocal = rebaseVocabularyBindings(fragments, vocabularyFileId, edit)
    if (rebasedLocal !== fragments) {
      setFragments(rebasedLocal)
      if (currentSeqIdRef.current) await persistSequence(rebasedLocal)
    }

    for (const seq of sequences) {
      if (seq.id === currentSeqIdRef.current) continue
      const rebased = rebaseVocabularyBindings(seq.fragments, vocabularyFileId, edit)
      if (rebased !== seq.fragments) {
        console.log("[FragmentEditor] Rebased vocabulary bindings in sequence:", seq.label)
        await updateSequence({ ...seq, fragments: rebased })
      }
    }
  }, [fragments, sequences, persistSequence, updateSequence])

  /* The vocabulary snippet of the open fragment — same contract as subtitles. */
  const vocabBinding = useMemo(() => {
    if (!vocabModalFragId || !vocabModalFile) return null
    const frag = fragments.find(f => f.id === vocabModalFragId)
    return (frag?.vocabularies ?? []).find(v => v.vocabularyFileId === vocabModalFile.id) ?? null
  }, [vocabModalFragId, vocabModalFile, fragments])

  const startVocabTextEdit = useCallback(() => {
    if (!vocabModalFile || !vocabModalFragId || !vocabBinding) return

    const overlap = findVocabularyOverlap(bindingSources, vocabModalFile.id, vocabBinding, vocabModalFragId)
    if (overlap) {
      console.log("[FragmentEditor] Vocabulary snippet overlaps another fragment's:", overlap)
      setVocabOverlap(overlap)
      return
    }

    setVocabOverlap(null)
    setVocabDraft(vocabModalFile.content.slice(vocabBinding.charStart, vocabBinding.charEnd))
    setVocabTextEditing(true)
  }, [vocabModalFile, vocabModalFragId, vocabBinding, bindingSources])

  const handleVocabTextSave = useCallback(async () => {
    if (!vocabModalFile || !vocabBinding) return

    const content = vocabModalFile.content
    const nextContent = content.slice(0, vocabBinding.charStart) + vocabDraft + content.slice(vocabBinding.charEnd)

    const edit = diffText(content, nextContent)
    if (!edit) {
      setVocabTextEditing(false)
      return
    }

    setVocabSaving(true)
    try {
      const updated = await updateVocabularyContent(vocabModalFile.id, nextContent)
      if (updated) setVocabModalFile(updated)
      await applyVocabularyTextEdit(vocabModalFile.id, edit)
    } finally {
      setVocabSaving(false)
      setVocabTextEditing(false)
    }
  }, [vocabModalFile, vocabBinding, vocabDraft, updateVocabularyContent, applyVocabularyTextEdit])

  // --- Auto-scroll the subtitle text when the "select-text" step opens ---
  // If the fragment already has a subtitle from this file (we came here via "Edit"),
  // scroll to that snippet so the view stays where the user left it. Otherwise scroll
  // to where the previous fragment (by time order) has its subtitle, so the user can
  // find the right area.
  useEffect(() => {
    if (subModalStep !== "select-text" || !subModalFragId || !subModalFile) return
    if (subTextEditing) return // the textarea has replaced the text container

    const currentFrag = fragments.find(f => f.id === subModalFragId)
    if (!currentFrag) return

    const existingSub = currentFrag.subtitles.find(s => s.subtitleFileId === subModalFile.id)

    let targetChar: number | null = null
    let behavior: ScrollBehavior = "smooth"

    if (existingSub) {
      // Editing an existing binding — jump straight to its start, no animation from the top
      targetChar = existingSub.charStart
      behavior = "auto"
    } else {
      // Search backwards from the current fragment for a bound subtitle
      const sorted = [...fragments].sort((a, b) => a.start - b.start)
      const currentIdx = sorted.findIndex(f => f.id === subModalFragId)
      for (let i = currentIdx - 1; i >= 0; i--) {
        const prevSub = sorted[i].subtitles.find(s => s.subtitleFileId === subModalFile.id)
        if (prevSub) {
          targetChar = prevSub.charEnd
          break
        }
      }
    }

    if (targetChar === null) return // nothing to scroll to — leave at the top

    // Wait for the DOM to render the subtitle-text-container
    requestAnimationFrame(() => {
      const ok = scrollTextContainerToChar("subtitle-text-container", targetChar!, subModalFile.content.length, behavior)
      if (ok) console.log("[FragmentEditor] Scrolled subtitle text to char:", targetChar)
    })
  }, [subModalStep, subModalFragId, subModalFile, subTextEditing, fragments])

  // --- Same auto-scroll for the vocabulary text ---
  useEffect(() => {
    if (vocabModalStep !== "select-text" || !vocabModalFragId || !vocabModalFile) return
    if (vocabTextEditing) return

    const currentFrag = fragments.find(f => f.id === vocabModalFragId)
    if (!currentFrag) return

    const existing = (currentFrag.vocabularies ?? []).find(v => v.vocabularyFileId === vocabModalFile.id)

    let targetChar: number | null = null
    let behavior: ScrollBehavior = "smooth"

    if (existing) {
      targetChar = existing.charStart
      behavior = "auto"
    } else {
      const sorted = [...fragments].sort((a, b) => a.start - b.start)
      const currentIdx = sorted.findIndex(f => f.id === vocabModalFragId)
      for (let i = currentIdx - 1; i >= 0; i--) {
        const prev = (sorted[i].vocabularies ?? []).find(v => v.vocabularyFileId === vocabModalFile.id)
        if (prev) {
          targetChar = prev.charEnd
          break
        }
      }
    }

    if (targetChar === null) return

    requestAnimationFrame(() => {
      const ok = scrollTextContainerToChar("vocab-text-container", targetChar!, vocabModalFile.content.length, behavior)
      if (ok) console.log("[FragmentEditor] Scrolled vocabulary text to char:", targetChar)
    })
  }, [vocabModalStep, vocabModalFragId, vocabModalFile, vocabTextEditing, fragments])

  // --- Get audio file info ---
  const audioFile = files.find(f => f.id === audioId)
  /* The audio that is actually open — the original, or the processed copy this
     sequence plays. What gets exported, and what the header names. */
  const sourceFile = files.find(f => f.id === audioSourceId)
  const audioName = sourceFile?.name?.replace(/\.[^.]+$/, "") ?? "audio"

  /* --- Sequences for export ---
     A bundle carries exactly one audio file, so it can only carry the sequences
     that play it: with a processed sequence open, that is the processed audio
     and its own sequences, not the whole file's list. The current one is merged
     from local state so unsaved edits go too. */
  const allSequencesForExport = useMemo(() => {
    const forThisAudio = sequences.filter(s => sequenceAudioId(s) === audioSourceId)
    if (!currentSeqId) return forThisAudio

    return forThisAudio.map(s =>
      s.id === currentSeqId
        ? { ...s, fragments: [...fragments].sort((a, b) => a.start - b.start) }
        : s,
    )
  }, [sequences, fragments, audioSourceId, currentSeqId])

  /** Sequences left out of the export because they play a different audio. */
  const sequencesNotExported = sequences.length - allSequencesForExport.length

  // --- RENDER ---

  if (!audioId) return <div className="page"><p>{t("editor.noAudio")}</p></div>

  return (
    <div className="page">
      <h2>{t("editor.title")}</h2>
      <div className="editor-source">
        <p>{audioFile?.name ?? t("common.unknownFile")}</p>
        {/* Absent until the sequence exists — a brand new one is only written
            once the first fragment is added. */}
        {currentSequence && (
          <p>{t("editor.sequenceLabel", { label: currentSequence.label })}</p>
        )}
        {/* Says why the waveform is not the one the file itself would draw. */}
        {currentSequence && isProcessed(currentSequence) && (
          <p className="editor-source__processed">
            {t("editor.playsProcessed", { name: sourceFile?.name ?? "" })}
          </p>
        )}
      </div>

      {/* Navigation and Export — at the top. Export is offered on phones too:
          bundling is cheap next to decoding, and it is how a drill cut on one
          device gets to another, whichever way round that is. */}
      <div className="toolbar">
        <button onClick={() => navigate(-1)}>
          {t("common.back")}
        </button>
        {isReady && (
          <ExportBundleButton
            audioId={audioSourceId}
            audioName={audioName}
            getBlob={getBlob}
            waveformData={waveformData}
            sequences={allSequencesForExport}
            subtitleFiles={subtitleFiles}
            omittedSequenceCount={sequencesNotExported}
            disabled={!isReady}
          />
        )}
      </div>

      {!isReady && (
        <div className="frag-editor__loading">
          <div className="spinner spinner--wf" /> {t("editor.loadingAudio")}
        </div>
      )}

      {isReady && (
        <>
          {/* Waveform */}
          {waveformError ? (
            <div style={{
              padding: "16px",
              backgroundColor: "#fff3e0",
              border: "1px solid #ffcc80",
              borderRadius: 8,
              marginBottom: 12,
            }}>
              <p style={{ color: "#e65100", fontWeight: 600, margin: "0 0 8px" }}>
                ⚠ {t("editor.decodeFailed")}
              </p>
              <p style={{ fontSize: "0.85rem", color: "#666", margin: "0 0 12px" }}>
                {waveformError.message}
              </p>
              <p style={{ fontSize: "0.85rem", color: "#555", margin: "0 0 12px" }}>
                {t("editor.decodeTooLarge")}
              </p>
              <button
                onClick={() => setDismissDecodeHelp(false)}
                className="btn-primary"
                style={{ backgroundColor: "#ff9800" }}
              >
                {t("editor.howToPrepare")}
              </button>
            </div>
          ) : waveformLoading ? (
            <div className="frag-editor__loading">
              <div className="spinner spinner--wf" /> {t("editor.buildingWaveform")}
            </div>
          ) : (
            <Waveform
              data={waveformData}
              duration={duration}
              fragments={waveformFragments}
              onSelect={addFragment}
              onFragmentClick={handleFragmentClick}
              onSelectedFragmentClick={handleFragmentClick}
              onClickOutside={() => { setEditingId(null); savedBoundsRef.current = null }}
              onEditDrag={(id, newStart, newEnd) => {
                stopPlaybackForEdit()
                const frag = fragments.find(f => f.id === id)
                if (frag) {
                  const updated = { ...frag, start: newStart, end: newEnd }
                  updateLocalFragment(updated)
                }
              }}
              onEditEnd={(id, newStart, newEnd) => {
                const updated = fragments.map(f => f.id === id ? { ...f, start: newStart, end: newEnd } : f)
                persistSequence(updated)
              }}
              editingId={editingId}
              currentTime={currentTime}
              playingFragment={playingFragment}
              showPlaybackCursor={isFilePlayback}
              isFilePlaying={isFilePlayback && isPlaying}
              onSeek={handleFileSeek}
              visibleStartRef={waveformVisibleStartRef}
              visibleEndRef={waveformVisibleEndRef}
            />
          )}

          {/* File player */}
          <div className="file-player">
            <button onClick={isFilePlayback && isPlaying ? handleFilePause : handleFilePlay}>
              {isFilePlayback && isPlaying ? "⏸ " + t("common.pause") : isFilePlayback && isPaused ? "▶ " + t("common.resume") : "▶ " + t("editor.playAll")}
            </button>
            <button onClick={handleFileStop} disabled={!isFilePlayback}>⏹ {t("common.stop")}</button>
            <VolumeControl volume={volume} onVolumeChange={setVolume} />
            {isFilePlayback && (
              <span className="file-player__time">{formatTime(currentTime)} / {formatTime(duration)}</span>
            )}
          </div>

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
                ⚠ {t("editor.opFailed", { op: heavyError.operationName })}
              </p>
              <p style={{ color: "#666", fontSize: "0.85rem", margin: "4px 0 8px" }}>
                {heavyError.error.message}
              </p>
              <button
                onClick={clearError}
                style={{ marginRight: 8, padding: "4px 12px" }}
              >
                {t("editor.dismiss")}
              </button>
              <button
                onClick={() => { /* openHelp is triggered automatically */ }}
                className="btn-primary"
                style={{ backgroundColor: "#ff9800", padding: "4px 12px" }}
              >
                {t("editor.howToPrepare")}
              </button>
            </div>
          )}

          {/* Action bar */}
          <div className="action-bar">
            <button className="action-bar__btn" onClick={handleAutoDetectClick}
              disabled={vadDetecting || trimming || volumeBusy || vadDone}>
              {vadDetecting && !trimming ? t("editor.detecting") : vadDone ? t("editor.autoDetectDone") : t("editor.autoDetect")}
            </button>
            <button className="action-bar__btn" onClick={handleTrimSilence}
              disabled={vadDetecting || trimming || volumeBusy || trimDone}>
              {trimming ? t("editor.trimming") : trimDone ? t("editor.trimDone") : t("editor.trim")}
            </button>
            <button className="action-bar__btn"
              onClick={volumeMode === "normalize" ? () => setVolumeMode(null) : () => openVolumeMode("normalize")}
              disabled={vadDetecting || trimming || volumeBusy || normalizeDone || fragments.length === 0}
              style={volumeMode === "normalize" ? { borderColor: "#0078ff", color: "#0078ff" } : undefined}>
              {normalizing ? t("editor.normalizing")
                : normalizeDone ? t("editor.normalizeDone")
                : volumeMode === "normalize" ? t("editor.cancelNormalize")
                : t("editor.normalize")}
            </button>
            <button className="action-bar__btn"
              onClick={volumeMode === "maximize" ? () => setVolumeMode(null) : () => openVolumeMode("maximize")}
              disabled={vadDetecting || trimming || volumeBusy || maximizeDone || fragments.length === 0}
              style={volumeMode === "maximize" ? { borderColor: "#0078ff", color: "#0078ff" } : undefined}>
              {maximizing ? t("editor.maximizing")
                : maximizeDone ? t("editor.maximizeDone")
                : volumeMode === "maximize" ? t("editor.cancelMaximize")
                : t("editor.maximize")}
            </button>
            <button className="action-bar__btn action-bar__btn--danger"
              onClick={() => fragments.length > 0 ? setShowDeleteAllConfirm(true) : undefined}
              disabled={vadDetecting || trimming || volumeBusy || fragments.length === 0}>
              {t("editor.deleteAll")}
            </button>
            {vadDetecting && (
              <div className="vad-indicator">
                <div className={`spinner spinner--vad ${trimming ? "spinner--vad-trim" : "spinner--vad-detect"}`} />
                <span>{trimming ? t("editor.detectingSpeech") : t("editor.detecting")}</span>
              </div>
            )}
            {volumeBusy && (
              <div className="vad-indicator">
                <div className="spinner spinner--vad spinner--vad-trim" />
                <span>{normalizing ? t("editor.normalizing") : t("editor.maximizing")}</span>
              </div>
            )}
          </div>


          {/* Normalize / Maximize fragment-picker banner */}
          {volumeMode && (
            <div style={{
              padding: "10px 14px",
              backgroundColor: "#e3f2fd",
              border: "1px solid #90caf9",
              borderRadius: 6,
              marginBottom: 12,
              display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
            }}>
              <span style={{ fontSize: "0.85rem", color: "#1565c0", flex: 1 }}>
                {volumeMode === "normalize" ? t("editor.normalizeHint") : t("editor.maximizeHint")}
              </span>
              <button className="btn-primary"
                onClick={() => runVolumeOp(volumeMode)}
                disabled={fragments.length - volumeExcluded.size === 0}>
                {t.n(
                  volumeMode === "normalize" ? "editor.normalizeRun" : "editor.maximizeRun",
                  fragments.length - volumeExcluded.size,
                )}
              </button>
              <button onClick={() => setVolumeMode(null)}>{t("common.cancel")}</button>
            </div>
          )}

          {/* Fragment list */}
          <div className="fragment-list">
            {displayFragments.map(f => {
              const isEditing = f.id === editingId
              const isThisFragPlaying = !isFilePlayback && isPlaying && playingFragment != null &&
                playingFragment.start === f.start && playingFragment.end === f.end
              const isThisFragPaused = !isFilePlayback && isPaused && playingFragment != null &&
                playingFragment.start === f.start && playingFragment.end === f.end
              // Show Sub button on a non-selected fragment whenever there are subtitle files
              // available (so the user can attach one without first re-selecting the fragment)
              // or when the fragment already has subtitles bound.
              const hasSubtitles = f.subtitles && f.subtitles.length > 0
              const showSubOnUnselected = hasSubtitles || subtitleFiles.length > 0
              const hasVocabularies = (f.vocabularies?.length ?? 0) > 0
              const showVocabBtn = vocabularyFiles.length > 0
              const showVocabOnUnselected = hasVocabularies || vocabularyFiles.length > 0

              // Block delete highlighting
              const isBlockStart = f.id === blockDeleteStartId
              const isInBlockRange = (() => {
                if (!blockDeleteStartId) return false
                if (isBlockStart) return true
                if (!blockDeleteEndId) return false
                const sorted = [...fragments].sort((a, b) => a.start - b.start)
                const startIdx = sorted.findIndex(fr => fr.id === blockDeleteStartId)
                const endIdx = sorted.findIndex(fr => fr.id === blockDeleteEndId)
                const curIdx = sorted.findIndex(fr => fr.id === f.id)
                const fromIdx = Math.min(startIdx, endIdx)
                const toIdx = Math.max(startIdx, endIdx)
                return curIdx >= fromIdx && curIdx <= toIdx
              })()

              return (
                <div key={f.id} ref={el => { if (el) fragmentRefsMap.current.set(f.id, el); else fragmentRefsMap.current.delete(f.id) }}
                  className="fragment-panel">
                  <div
                    onClick={() => {
                      // Suppress click if long press just fired
                      if (longPressFiredRef.current) {
                        longPressFiredRef.current = false
                        return
                      }
                      if (blockDeleteStartId && !blockDeleteEndId && f.id !== blockDeleteStartId) {
                        // In block select mode — select end fragment
                        handleBlockDeleteSelectEnd(f.id)
                        return
                      }
                      handleFragmentClick(f.id)
                    }}
                    onPointerDown={() => { if (!blockDeleteStartId) handleFragmentPointerDown(f.id) }}
                    onPointerUp={handleFragmentPointerUp}
                    onPointerLeave={handleFragmentPointerLeave}
                    className={`fragment-row${isEditing ? " fragment-row--editing" : ""}`}
                    style={{
                      backgroundColor: isInBlockRange ? "rgba(211, 47, 47, 0.1)" : undefined,
                      borderColor: isInBlockRange ? "#d32f2f" : undefined,
                    }}>
                    {volumeMode && (
                      <input
                        type="checkbox"
                        checked={!volumeExcluded.has(f.id)}
                        onChange={() => {
                          setVolumeExcluded(prev => {
                            const next = new Set(prev)
                            if (next.has(f.id)) next.delete(f.id)
                            else next.add(f.id)
                            return next
                          })
                        }}
                        onClick={e => e.stopPropagation()}
                        style={{ marginRight: 4, flexShrink: 0 }}
                      />
                    )}
                    <span className="fragment-row__time"
                      style={volumeMode && volumeExcluded.has(f.id) ? { opacity: 0.4 } : undefined}>
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
                          {/* CHANGE 3: Sub button always shown for selected (editing) fragment */}
                          <button className={`btn-sub${hasSubtitles ? " btn-sub--bound" : ""}`} onClick={e => {
                            e.stopPropagation()
                            openSubtitleModal(f.id)
                          }}>
                            {t("fragmentLibrary.sub")}
                          </button>
                          {showVocabBtn && (
                            <button className={`btn-sub${hasVocabularies ? " btn-sub--bound" : ""}`} onClick={e => {
                              e.stopPropagation()
                              openVocabularyModal(f.id)
                            }}>
                              {t("fragmentLibrary.vocab")}
                            </button>
                          )}
                        </>
                      )}
                      {/* Sub button on non-selected fragment: shown when subtitles are attached
                          or when subtitle files are available to attach */}
                      {!isEditing && showSubOnUnselected && (
                        <button className={`btn-sub${hasSubtitles ? " btn-sub--bound" : ""}`} onClick={e => {
                          e.stopPropagation()
                          startEditingWithAnim(f.id)
                          openSubtitleModal(f.id)
                        }}>
                          {t("fragmentLibrary.sub")}
                        </button>
                      )}
                      {!isEditing && showVocabOnUnselected && (
                        <button className={`btn-sub${hasVocabularies ? " btn-sub--bound" : ""}`} onClick={e => {
                          e.stopPropagation()
                          startEditingWithAnim(f.id)
                          openVocabularyModal(f.id)
                        }}>
                          {t("fragmentLibrary.vocab")}
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

                  {/* Block select info — shown inside the starting fragment box */}
                  {isBlockStart && !blockDeleteEndId && (
                    <div style={{
                      padding: "6px 8px",
                      backgroundColor: "#fff3e0", borderLeft: "1px solid #ffcc80", borderRight: "1px solid #ffcc80", borderBottom: "1px solid #ffcc80",
                      borderRadius: "0 0 4px 4px",
                      fontSize: "0.8rem", color: "#e65100",
                      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                    }}>
                      <span>{t("editor.blockHint")}</span>
                      <button className="btn-sub" onClick={e => { e.stopPropagation(); handleBlockDeleteCancel() }} style={{ flexShrink: 0, fontSize: "0.75rem" }}>{t("common.cancel")}</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

        </>
      )}


      {/* Confirm modals */}
      {showAutoDetectConfirm && (
        <div className="modal-overlay" onClick={() => setShowAutoDetectConfirm(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <p>{t("editor.confirmAutoDetect")}</p>
            <div className="modal-actions">
              <button onClick={handleAutoDetectRun} className="btn-danger">{t("editor.replaceAll")}</button>
              <button onClick={() => setShowAutoDetectConfirm(false)}>{t("common.cancel")}</button>
            </div>
          </div>
        </div>
      )}

      {autoDetectTooLong !== null && (
        <div className="modal-overlay" onClick={() => setAutoDetectTooLong(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3 className="modal-box__title">{t("editor.tooLongTitle")}</h3>
            <p>{t("editor.tooLongBody", {
              actual: formatHoursMinutes(autoDetectTooLong, t("common.hoursShort"), t("common.minutesShort")),
              max: formatHoursMinutes(MAX_AUTO_DETECT_SEC, t("common.hoursShort"), t("common.minutesShort")),
            })}</p>
            <p>{t("editor.tooLongHint")}</p>
            <div className="modal-actions">
              <button onClick={() => setAutoDetectTooLong(null)} className="btn-primary">
                {t("common.gotIt")}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteAllConfirm && (
        <div className="modal-overlay" onClick={() => setShowDeleteAllConfirm(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <p>{t("editor.confirmDeleteAll")}</p>
            <div className="modal-actions">
              <button onClick={handleDeleteAllFragments} className="btn-danger">{t("editor.deleteAllBtn")}</button>
              <button onClick={() => setShowDeleteAllConfirm(false)}>{t("common.cancel")}</button>
            </div>
          </div>
        </div>
      )}

      {/* Block delete confirmation modal */}
      {blockDeleteStartId && blockDeleteEndId && (
        <div className="modal-overlay" onClick={handleBlockDeleteCancel}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <p>{t.n("editor.confirmBlockDelete", blockDeleteCount)}</p>
            <div className="modal-actions">
              <button onClick={handleBlockDeleteConfirm} className="btn-danger">{t.n("editor.blockDeleteBtn", blockDeleteCount)}</button>
              <button onClick={handleBlockDeleteCancel}>{t("common.cancel")}</button>
            </div>
          </div>
        </div>
      )}

      {/* Subtitle modal */}
      {subModalFragId && (
        <div className="modal-overlay" onClick={() => { if (!subTextEditing) closeSubModal() }}>
          <div className="modal-box modal-box--wide" onClick={e => e.stopPropagation()}>
            {subModalStep === "choose-file" ? (
              <>
                <h3 style={{ marginTop: 0 }}>{t("editor.chooseSubFile")}</h3>
                {subtitleFiles.length === 0 ? (
                  <p>{t("editor.noSubFiles")}</p>
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
                  <button onClick={closeSubModal}>{t("common.cancel")}</button>
                </div>
              </>
            ) : subModalStep === "view-existing" ? (
              <>
                <h3 style={{ marginTop: 0 }}>{t("editor.attachedSub")}</h3>
                {(() => {
                  const frag = fragments.find(f => f.id === subModalFragId)
                  const existingSub = frag?.subtitles.find(s => s.subtitleFileId === subModalFile?.id)
                  const text = existingSub && subModalFile
                    ? subModalFile.content.slice(existingSub.charStart, existingSub.charEnd)
                    : t("editor.notFound")
                  return (
                    <>
                      <p style={{ fontSize: "0.85rem", color: "#666", marginBottom: 8 }}>
                        {t("editor.file", { name: subModalFile?.name ?? "" })}
                      </p>
                      <div className="subtitle-content" style={{ minHeight: 60, maxHeight: "40vh" }}>
                        {text}
                      </div>
                    </>
                  )
                })()}
                <div className="modal-actions">
                  <button onClick={() => { setSubModalStep("select-text"); setSubOverlap(null) }} className="btn-primary">{t("common.edit")}</button>
                  <button onClick={async () => {
                    if (subModalFile) {
                      await handleRemoveSubtitle(subModalFragId, subModalFile.id)
                    }
                    closeSubModal()
                  }} className="btn-danger">{t("editor.unbind")}</button>
                  {subtitleFiles.length > 1 && (
                    <button onClick={() => { setSubModalStep("choose-file"); setSubModalFile(null) }}>{t("common.backPlain")}</button>
                  )}
                  <button onClick={closeSubModal}>{t("common.cancel")}</button>
                </div>
              </>
            ) : (
              <>
                <h3 style={{ marginTop: 0 }}>{t("editor.selectTextSub")}</h3>
                <p style={{ fontSize: "0.85rem", color: "#666" }}>
                  {subTextEditing ? t("editor.editSnippetHint") : t("editor.selectHint")}
                </p>
                {/* The edit was refused: the snippet is not this fragment's alone. */}
                {subOverlap && !subTextEditing && (
                  <p className="modal-warning">
                    {t("editor.snippetOverlap", {
                      label: subOverlap.label,
                      text: subModalFile?.content.slice(subOverlap.charStart, subOverlap.charEnd) ?? "",
                    })}
                  </p>
                )}
                {subTextEditing ? (
                  <textarea
                    className="subtitle-content subtitle-content--edit"
                    value={subDraft}
                    onChange={e => setSubDraft(e.target.value)}
                    disabled={subSaving}
                  />
                ) : (
                  <div id="subtitle-text-container" className="subtitle-content">
                    {subModalFile?.content}
                  </div>
                )}
                <div className="modal-actions">
                  {subTextEditing ? (
                    <>
                      <button onClick={handleSubTextSave} className="btn-primary" disabled={subSaving || !subDraft.trim()}>{t("common.save")}</button>
                      <button onClick={() => setSubTextEditing(false)} disabled={subSaving}>{t("common.cancel")}</button>
                    </>
                  ) : (
                    <>
                      <button onClick={handleSubtitleSelect} className="btn-primary">{t("common.bind")}</button>
                      {/* Only a snippet already bound to this fragment can be edited. */}
                      {subBinding && <button onClick={startSubTextEdit}>{t("editor.editText")}</button>}
                      {subtitleFiles.length > 1 && (
                        <button onClick={() => { setSubModalStep("choose-file"); setSubModalFile(null); setSubOverlap(null) }}>{t("common.backPlain")}</button>
                      )}
                      <button onClick={closeSubModal}>{t("common.cancel")}</button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Vocabulary modal */}
      {vocabModalFragId && (
        <div className="modal-overlay" onClick={() => { if (!vocabTextEditing) closeVocabModal() }}>
          <div className="modal-box modal-box--wide" onClick={e => e.stopPropagation()}>
            {vocabModalStep === "choose-file" ? (
              <>
                <h3 style={{ marginTop: 0 }}>{t("editor.chooseVocabFile")}</h3>
                {vocabularyFiles.length === 0 ? (
                  <p>{t("editor.noVocabFiles")}</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {vocabularyFiles.map(vf => (
                      <button key={vf.id} onClick={() => goToVocabStepForFile(vocabModalFragId, vf)}
                        style={{ textAlign: "left", padding: "8px 12px" }}>
                        {vf.name}
                      </button>
                    ))}
                  </div>
                )}
                <div className="modal-actions">
                  <button onClick={closeVocabModal}>{t("common.cancel")}</button>
                </div>
              </>
            ) : vocabModalStep === "view-existing" ? (
              <>
                <h3 style={{ marginTop: 0 }}>{t("editor.attachedVocab")}</h3>
                {(() => {
                  const frag = fragments.find(f => f.id === vocabModalFragId)
                  const existing = (frag?.vocabularies ?? []).find(v => v.vocabularyFileId === vocabModalFile?.id)
                  const text = existing && vocabModalFile
                    ? vocabModalFile.content.slice(existing.charStart, existing.charEnd)
                    : "(not found)"
                  return (
                    <>
                      <p style={{ fontSize: "0.85rem", color: "#666", marginBottom: 8 }}>
                        File: {vocabModalFile?.name}
                      </p>
                      <div className="subtitle-content" style={{ minHeight: 60, maxHeight: "40vh" }}>
                        {text}
                      </div>
                    </>
                  )
                })()}
                <div className="modal-actions">
                  <button onClick={() => { setVocabModalStep("select-text"); setVocabOverlap(null) }} className="btn-primary">{t("common.edit")}</button>
                  <button onClick={async () => {
                    if (vocabModalFile) {
                      await handleRemoveVocabulary(vocabModalFragId, vocabModalFile.id)
                    }
                    closeVocabModal()
                  }} className="btn-danger">{t("editor.unbind")}</button>
                  {vocabularyFiles.length > 1 && (
                    <button onClick={() => { setVocabModalStep("choose-file"); setVocabModalFile(null) }}>{t("common.backPlain")}</button>
                  )}
                  <button onClick={closeVocabModal}>{t("common.cancel")}</button>
                </div>
              </>
            ) : (
              <>
                <h3 style={{ marginTop: 0 }}>{t("editor.selectTextVocab")}</h3>
                <p style={{ fontSize: "0.85rem", color: "#666" }}>
                  {vocabTextEditing ? t("editor.editSnippetHint") : t("editor.selectHint")}
                </p>
                {vocabOverlap && !vocabTextEditing && (
                  <p className="modal-warning">
                    {t("editor.snippetOverlap", {
                      label: vocabOverlap.label,
                      text: vocabModalFile?.content.slice(vocabOverlap.charStart, vocabOverlap.charEnd) ?? "",
                    })}
                  </p>
                )}
                {vocabTextEditing ? (
                  <textarea
                    className="subtitle-content subtitle-content--edit"
                    value={vocabDraft}
                    onChange={e => setVocabDraft(e.target.value)}
                    disabled={vocabSaving}
                  />
                ) : (
                  <div id="vocab-text-container" className="subtitle-content">
                    {vocabModalFile?.content}
                  </div>
                )}
                <div className="modal-actions">
                  {vocabTextEditing ? (
                    <>
                      <button onClick={handleVocabTextSave} className="btn-primary" disabled={vocabSaving || !vocabDraft.trim()}>{t("common.save")}</button>
                      <button onClick={() => setVocabTextEditing(false)} disabled={vocabSaving}>{t("common.cancel")}</button>
                    </>
                  ) : (
                    <>
                      <button onClick={handleVocabularySelect} className="btn-primary">{t("common.bind")}</button>
                      {vocabBinding && <button onClick={startVocabTextEdit}>{t("editor.editText")}</button>}
                      {vocabularyFiles.length > 1 && (
                        <button onClick={() => { setVocabModalStep("choose-file"); setVocabModalFile(null); setVocabOverlap(null) }}>{t("common.backPlain")}</button>
                      )}
                      <button onClick={closeVocabModal}>{t("common.cancel")}</button>
                    </>
                  )}
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

      {/* Mobile instruction modal (triggered by waveform build error) */}
      {showDecodeHelp && waveformError && (
        <MobileInstructionModal
          operationName={t("editor.op.decode")}
          errorMessage={waveformError.message}
          onClose={() => setDismissDecodeHelp(true)}
        />
      )}

      {/* Trim result modal */}
      {trimResultInfo && (
        <div className="modal-overlay" onClick={() => setTrimResultInfo(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ textAlign: "left", maxWidth: "min(420px, 90vw)", overflowWrap: "break-word", wordBreak: "break-word" }}>
            <h3 style={{ marginTop: 0 }}>{t("editor.trimComplete")}</h3>
            <p style={{ fontSize: "0.9rem", marginBottom: 8 }}>
              {t("editor.created", { name: trimResultInfo.trimmedName })}
            </p>
            <p style={{ fontSize: "0.85rem", color: "#555", margin: "4px 0" }}>
              {t("editor.trimDurations", { orig: trimResultInfo.originalDuration.toFixed(1), trimmed: trimResultInfo.newDuration.toFixed(1) })}
            </p>
            <p style={{ fontSize: "0.85rem", color: "#555", margin: "4px 0" }}>
              {t("editor.trimRemoved", { sec: trimResultInfo.removedDuration.toFixed(1), pct: trimResultInfo.pct })}
            </p>
            <p style={{ fontSize: "0.85rem", color: "#555", margin: "4px 0" }}>
              {t.n("editor.trimSegments", trimResultInfo.segmentCount)}
            </p>
            <p style={{ fontSize: "0.85rem", color: "#555", margin: "8px 0 0" }}>
              {t("editor.sequenceKeepsPlace", {
                label: trimResultInfo.sequenceLabel,
                file: audioFile?.name ?? t("common.unknownFile"),
              })}
            </p>
            <div className="modal-actions">
              <button className="btn-primary" onClick={() => setTrimResultInfo(null)}>{t("common.close")}</button>
            </div>
          </div>
        </div>
      )}

      {/* Normalize / Maximize result modal */}
      {volumeResultInfo && (
        <div className="modal-overlay" onClick={() => setVolumeResultInfo(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ textAlign: "left", maxWidth: "min(420px, 90vw)" }}>
            <h3 style={{ marginTop: 0 }}>
              {volumeResultInfo.op === "normalize"
                ? t("editor.normalizeComplete")
                : t("editor.maximizeComplete")}
            </h3>
            <p style={{ fontSize: "0.9rem", marginBottom: 8 }}>
              {t("editor.created", { name: volumeResultInfo.createdName })}
            </p>
            <p style={{ fontSize: "0.85rem", color: "#555", margin: "4px 0" }}>
              {t(
                volumeResultInfo.op === "normalize" ? "editor.normalizedCount" : "editor.maximizedCount",
                { n: volumeResultInfo.selectedCount, total: volumeResultInfo.totalCount },
              )}
            </p>
            {/* How much each fragment actually gained is the whole point of
                Maximize — a file already near full scale gains almost nothing,
                and saying so beats leaving the user to wonder. */}
            {volumeResultInfo.gainsDb && volumeResultInfo.gainsDb.length > 0 && (
              <p style={{ fontSize: "0.85rem", color: "#555", margin: "4px 0" }}>
                {t("editor.maximizedGain", {
                  avg: formatDb(
                    volumeResultInfo.gainsDb.reduce((a, b) => a + b, 0) / volumeResultInfo.gainsDb.length,
                  ),
                  min: formatDb(Math.min(...volumeResultInfo.gainsDb)),
                  max: formatDb(Math.max(...volumeResultInfo.gainsDb)),
                })}
              </p>
            )}
            {volumeResultInfo.cappedCount != null && volumeResultInfo.cappedCount > 0 && (
              <p style={{ fontSize: "0.85rem", color: "#8a6d00", margin: "4px 0" }}>
                {t.n("editor.maximizedCapped", volumeResultInfo.cappedCount, { cap: MAXIMIZE_GAIN_CAP })}
              </p>
            )}
            <p style={{ fontSize: "0.85rem", color: "#555", margin: "8px 0 0" }}>
              {t("editor.sequenceKeepsPlace", {
                label: volumeResultInfo.sequenceLabel,
                file: audioFile?.name ?? t("common.unknownFile"),
              })}
            </p>
            <div className="modal-actions">
              <button className="btn-primary" onClick={() => setVolumeResultInfo(null)}>{t("common.close")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}