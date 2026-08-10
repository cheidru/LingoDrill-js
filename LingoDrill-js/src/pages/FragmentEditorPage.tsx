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
import { trimSilence } from "../utils/trimSilence"
import { useT } from "../utils/i18n"
import { normalizeFragments } from "../utils/normalizeFragments"
import { safeDecodeAudioBuffer } from "../infrastructure/audio/safeDecodeAudioBuffer"
import type { PlayableFragment } from "../core/audio/audioEngine"
import { getFragmentGap } from "../utils/settings"
import type { SequenceFragment, FragmentSubtitle, FragmentVocabulary, SubtitleFile, VocabularyFile, Sequence } from "../core/domain/types"
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
    getBlob, addFile, files,
    loadById, playFragment, pause, play, stop, seekTo, setOnEnded,
    isReady, isPlaying, isPaused, duration, currentTime,
    volume, setVolume,
  } = useSharedAudioEngine()

  const { sequences, addSequence, updateSequence } = useSequences(audioId ?? null)
  const { subtitleFiles } = useSubtitles(audioId ?? null)
  const { vocabularyFiles } = useVocabularies(audioId ?? null)

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

  // --- Vocabulary selection modal ---
  const [vocabModalFragId, setVocabModalFragId] = useState<string | null>(null)
  const [vocabModalStep, setVocabModalStep] = useState<"choose-file" | "view-existing" | "select-text">("choose-file")
  const [vocabModalFile, setVocabModalFile] = useState<VocabularyFile | null>(null)

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
    if (!audioId) return
    loadById(audioId)
  }, [audioId, loadById])

  // Build the waveform:
  //  1. a cached 4000-point envelope → use directly;
  //  2. otherwise stream-decode the file in frame-aligned chunks, folding RMS
  //     into the 4000-point envelope and rendering it progressively (fills in
  //     left-to-right), then store the finished envelope for future loads.
  // Streaming keeps memory constant, so multi-hour files no longer fail.
  useEffect(() => {
    if (!audioId) return
    let cancelled = false
    const abort = new AbortController()

    const load = async () => {
      const { WaveformCacheStorage } = await import("../infrastructure/indexeddb/waveformCacheStorage")
      const cache = new WaveformCacheStorage()
      const cached = await cache.get(audioId)

      if (cached && cached.length > 0 && !cancelled) {
        setWaveformData(cached)
        setWaveformLoading(false)
        return
      }

      const blob = await getBlob(audioId)
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
        cache.save(audioId, envelope)
      } catch (err) {
        if (cancelled) return
        if (err instanceof DOMException && err.name === "AbortError") return
        console.error("Waveform build failed:", err)
        setWaveformError(err instanceof Error ? err : new Error(String(err)))
      }
    }
    load()

    return () => { cancelled = true; abort.abort() }
  }, [audioId, getBlob])

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
    const segments = await wrapHeavyOp(t("editor.op.autoDetect"), async () => {
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
  }, [audioId, vadDetecting, getBlob, persistSequence, wrapHeavyOp, t])

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
  const [trimResultInfo, setTrimResultInfo] = useState<{
    trimmedName: string
    originalDuration: number
    newDuration: number
    removedDuration: number
    pct: number
    segmentCount: number
    newAudioId: string | null
  } | null>(null)

  // --- Normalize volume state ---
  const [normalizeMode, setNormalizeMode] = useState(false)
  const [normalizeExcluded, setNormalizeExcluded] = useState<Set<string>>(new Set())
  const [normalizing, setNormalizing] = useState(false)
  const [normalizeResultInfo, setNormalizeResultInfo] = useState<{
    normalizedName: string
    selectedCount: number
    totalCount: number
    newAudioId: string | null
  } | null>(null)

  const handleTrimSilence = useCallback(async () => {
    if (!audioId || trimming || vadDetecting) return

    const blob = await getBlob(audioId)
    if (!blob) return

    setTrimming(true)

    // ОБЁРНУТО в wrapHeavyOp
    const result = await wrapHeavyOp(t("editor.op.trim"), async () => {
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
          throw new Error(t("editor.noSpeechToTrim"))
        }
      }

      const { blob: trimmedBlob, segmentMap, newDuration, channelData } = trimSilence(audioBuffer, segments)

      const sourceFile = files.find(f => f.id === audioId)
      const baseName = sourceFile?.name?.replace(/\.[^.]+$/, "") ?? "audio"
      const trimmedName = `${baseName}_trimmed.wav`
      const trimmedFile = new File([trimmedBlob], trimmedName, { type: "audio/wav" })

      // Save the trimmed file via addFile (updates both IndexedDB and UI state)
      const newAudioId = crypto.randomUUID()
      await addFile(trimmedFile, newAudioId)

      // --- Build and cache waveform for the trimmed file ---
      const { buildWaveformFromRaw } = await import("../utils/buildWaveformProgressive")
      const trimmedWaveform = buildWaveformFromRaw(channelData, channelData.length, 4000)
      const { WaveformCacheStorage } = await import("../infrastructure/indexeddb/waveformCacheStorage")
      const waveformCache = new WaveformCacheStorage()
      await waveformCache.save(newAudioId, trimmedWaveform)
      console.log("[FragmentEditor] Built and cached waveform for trimmed file")

      // --- Copy subtitle files for the new audio ID and build ID mapping ---
      const subIdMap = new Map<string, string>() // old subtitle file ID → new subtitle file ID
      if (subtitleFiles.length > 0) {
        const { IndexedDBSubtitleStorage } = await import("../infrastructure/indexeddb/IndexedDBSubtitleStorage")
        const subStorage = new IndexedDBSubtitleStorage()
        for (const sf of subtitleFiles) {
          const newSubId = nanoid()
          subIdMap.set(sf.id, newSubId)
          const newSub: SubtitleFile = {
            id: newSubId,
            audioId: newAudioId,
            name: sf.name,
            content: sf.content,
            createdAt: Date.now(),
          }
          await subStorage.save(newSub)
        }
        console.log("[FragmentEditor] Copied", subtitleFiles.length, "subtitle files for trimmed audio")
      }

      // --- Remap fragments with subtitles to the new trimmed timeline ---
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

      const remappedFragments: SequenceFragment[] = []
      for (const frag of fragments) {
        const newStart = remapTime(frag.start)
        const newEnd = remapTime(frag.end)
        if (newStart !== null && newEnd !== null && newEnd > newStart) {
          // Remap subtitle file IDs to the new copies
          const remappedSubs: FragmentSubtitle[] = frag.subtitles.map(sub => ({
            ...sub,
            subtitleFileId: subIdMap.get(sub.subtitleFileId) ?? sub.subtitleFileId,
            subtitleFileName: sub.subtitleFileName,
          }))
          remappedFragments.push({
            id: nanoid(),
            start: newStart,
            end: newEnd,
            repeat: frag.repeat,
            speed: frag.speed,
            subtitles: remappedSubs,
          })
        }
      }

      // --- Create a sequence for the new trimmed file ---
      if (remappedFragments.length > 0) {
        const { IndexedDBSequenceStorage } = await import("../infrastructure/indexeddb/IndexedDBSequenceStorage")
        const seqStorage = new IndexedDBSequenceStorage()
        const newSeq: Sequence = {
          id: nanoid(),
          audioId: newAudioId,
          label: "1",
          fragments: remappedFragments.sort((a, b) => a.start - b.start),
          createdAt: Date.now(),
        }
        await seqStorage.save(newSeq)
        console.log("[FragmentEditor] Created sequence for trimmed file with", remappedFragments.length, "fragments")
      }

      return { audioBuffer, segmentMap, newDuration, trimmedName, newAudioId }
    })

    if (result) {
      const { audioBuffer, segmentMap, newDuration, trimmedName, newAudioId } = result
      const removedDuration = audioBuffer.duration - newDuration
      const pct = Math.round((removedDuration / audioBuffer.duration) * 100)
      setTrimResultInfo({
        trimmedName,
        originalDuration: audioBuffer.duration,
        newDuration,
        removedDuration,
        pct,
        segmentCount: segmentMap.length,
        newAudioId,
      })
    }

    setTrimming(false)
    setVadDetecting(false)
    setVadProgress(0)
  }, [audioId, trimming, vadDetecting, getBlob, addFile, fragments, subtitleFiles, files, wrapHeavyOp, t])

  // --- Normalize volume ---

  const handleNormalizeOpen = useCallback(() => {
    setNormalizeExcluded(new Set())
    setNormalizeMode(true)
  }, [])

  const handleNormalizeRun = useCallback(async () => {
    if (!audioId || normalizing || vadDetecting || trimming) return

    setNormalizing(true)
    setNormalizeMode(false)

    const result = await wrapHeavyOp(t("editor.op.normalize"), async () => {
      const srcBlob = await getBlob(audioId)
      if (!srcBlob) {
        throw new Error(t("editor.audioNotFound"))
      }
      const audioBuffer = await safeDecodeAudioBuffer(srcBlob)

      const selectedFragments = fragments.filter(f => !normalizeExcluded.has(f.id))
      if (selectedFragments.length === 0) {
        throw new Error(t("editor.noFragmentsNormalize"))
      }

      const { blob, channelData } = normalizeFragments(audioBuffer, selectedFragments)

      const sourceFile = files.find(f => f.id === audioId)
      const baseName = sourceFile?.name?.replace(/\.[^.]+$/, "") ?? "audio"
      const normalizedName = `${baseName}_normalized.wav`
      const normalizedFile = new File([blob], normalizedName, { type: "audio/wav" })

      const newAudioId = crypto.randomUUID()
      await addFile(normalizedFile, newAudioId)

      // Build and cache waveform
      const { buildWaveformFromRaw } = await import("../utils/buildWaveformProgressive")
      const waveform = buildWaveformFromRaw(channelData, channelData.length, 4000)
      const { WaveformCacheStorage } = await import("../infrastructure/indexeddb/waveformCacheStorage")
      const waveformCache = new WaveformCacheStorage()
      await waveformCache.save(newAudioId, waveform)

      // Copy subtitle files
      const subIdMap = new Map<string, string>()
      if (subtitleFiles.length > 0) {
        const { IndexedDBSubtitleStorage } = await import("../infrastructure/indexeddb/IndexedDBSubtitleStorage")
        const subStorage = new IndexedDBSubtitleStorage()
        for (const sf of subtitleFiles) {
          const newSubId = nanoid()
          subIdMap.set(sf.id, newSubId)
          await subStorage.save({
            id: newSubId,
            audioId: newAudioId,
            name: sf.name,
            content: sf.content,
            createdAt: Date.now(),
          })
        }
      }

      // Create sequence with same fragments (audio duration unchanged)
      const newFragments: SequenceFragment[] = fragments.map(f => ({
        id: nanoid(),
        start: f.start,
        end: f.end,
        repeat: f.repeat,
        speed: f.speed,
        subtitles: f.subtitles.map(sub => ({
          ...sub,
          subtitleFileId: subIdMap.get(sub.subtitleFileId) ?? sub.subtitleFileId,
        })),
      }))

      if (newFragments.length > 0) {
        const { IndexedDBSequenceStorage } = await import("../infrastructure/indexeddb/IndexedDBSequenceStorage")
        const seqStorage = new IndexedDBSequenceStorage()
        await seqStorage.save({
          id: nanoid(),
          audioId: newAudioId,
          label: "1",
          fragments: newFragments.sort((a, b) => a.start - b.start),
          createdAt: Date.now(),
        })
      }

      return {
        normalizedName,
        selectedCount: selectedFragments.length,
        totalCount: fragments.length,
        newAudioId,
      }
    })

    if (result) {
      setNormalizeResultInfo(result)
    }

    setNormalizing(false)
  }, [audioId, normalizing, vadDetecting, trimming, getBlob, fragments, normalizeExcluded, files, addFile, subtitleFiles, wrapHeavyOp, t])

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
    setVocabModalFragId(null)
    setVocabModalFile(null)
    sel.removeAllRanges()
  }, [vocabModalFragId, vocabModalFile, fragments, persistSequence])

  const goToVocabStepForFile = useCallback((fragId: string, vf: VocabularyFile) => {
    setVocabModalFile(vf)
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

  // --- Auto-scroll to previous fragment's subtitle position when "select-text" step opens ---
  // When a fragment has no subtitle from the selected file, scroll to where the
  // previous fragment (by time order) has its subtitle, so the user can find the right area.
  useEffect(() => {
    if (subModalStep !== "select-text" || !subModalFragId || !subModalFile) return

    // Only do this if the current fragment does NOT have a subtitle from this file
    const currentFrag = fragments.find(f => f.id === subModalFragId)
    if (!currentFrag) return
    const existingSub = currentFrag.subtitles.find(s => s.subtitleFileId === subModalFile.id)
    if (existingSub) return // fragment already has subtitle from this file — don't interfere

    // Find the previous fragment by time order that has a subtitle from this file
    const sorted = [...fragments].sort((a, b) => a.start - b.start)
    const currentIdx = sorted.findIndex(f => f.id === subModalFragId)
    let targetSub: { charStart: number; charEnd: number } | null = null

    // Search backwards from the current fragment
    for (let i = currentIdx - 1; i >= 0; i--) {
      const prevSub = sorted[i].subtitles.find(s => s.subtitleFileId === subModalFile.id)
      if (prevSub) {
        targetSub = prevSub
        break
      }
    }

    if (!targetSub) return // no previous fragment has a subtitle from this file

    // Wait for the DOM to render the subtitle-text-container
    requestAnimationFrame(() => {
      const container = document.getElementById("subtitle-text-container")
      if (!container) return

      const content = subModalFile.content
      const textNode = container.firstChild
      if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return

      try {
        const clampedEnd = Math.min(targetSub!.charEnd, content.length)
        const range = document.createRange()
        range.setStart(textNode, clampedEnd)
        range.setEnd(textNode, clampedEnd)

        // Scroll so the end of the previous subtitle is visible near the top
        const rect = range.getBoundingClientRect()
        const containerRect = container.getBoundingClientRect()
        const scrollTarget = container.scrollTop + (rect.top - containerRect.top) - containerRect.height / 4
        container.scrollTo({ top: Math.max(0, scrollTarget), behavior: "smooth" })

        console.log("[FragmentEditor] Scrolled to previous fragment's subtitle end position:", clampedEnd)
      } catch (err) {
        console.warn("[FragmentEditor] Failed to scroll to previous subtitle position:", err)
      }
    })
  }, [subModalStep, subModalFragId, subModalFile, fragments])

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

  if (!audioId) return <div className="page"><p>{t("editor.noAudio")}</p></div>

  return (
    <div className="page">
      <h2>{t("editor.title")}</h2>
      <p style={{ fontSize: "0.9rem", color: "#666", marginTop: -8, marginBottom: 12 }}>
        {audioFile?.name ?? t("common.unknownFile")}
      </p>

      {/* Navigation and Export — at the top. Export is offered on phones too:
          bundling is cheap next to decoding, and it is how a drill cut on one
          device gets to another, whichever way round that is. */}
      <div className="toolbar">
        <button onClick={() => navigate(-1)}>
          {t("common.back")}
        </button>
        {isReady && (
          <ExportBundleButton
            audioId={audioId}
            audioName={audioName}
            getBlob={getBlob}
            waveformData={waveformData}
            sequences={allSequencesForExport}
            subtitleFiles={subtitleFiles}
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
              disabled={vadDetecting || trimming || normalizing || vadDone}>
              {vadDetecting && !trimming ? t("editor.detecting") : vadDone ? t("editor.autoDetectDone") : t("editor.autoDetect")}
            </button>
            <button className="action-bar__btn" onClick={handleTrimSilence} disabled={vadDetecting || trimming || normalizing}>
              {trimming ? t("editor.trimming") : t("editor.trim")}
            </button>
            <button className="action-bar__btn" onClick={normalizeMode ? () => setNormalizeMode(false) : handleNormalizeOpen}
              disabled={vadDetecting || trimming || normalizing || fragments.length === 0}
              style={normalizeMode ? { borderColor: "#0078ff", color: "#0078ff" } : undefined}>
              {normalizing ? t("editor.normalizing") : normalizeMode ? t("editor.cancelNormalize") : t("editor.normalize")}
            </button>
            <button className="action-bar__btn action-bar__btn--danger"
              onClick={() => fragments.length > 0 ? setShowDeleteAllConfirm(true) : undefined}
              disabled={vadDetecting || trimming || normalizing || fragments.length === 0}>
              {t("editor.deleteAll")}
            </button>
            {vadDetecting && (
              <div className="vad-indicator">
                <div className={`spinner spinner--vad ${trimming ? "spinner--vad-trim" : "spinner--vad-detect"}`} />
                <span>{trimming ? t("editor.detectingSpeech") : t("editor.detecting")}</span>
              </div>
            )}
            {normalizing && (
              <div className="vad-indicator">
                <div className="spinner spinner--vad spinner--vad-trim" />
                <span>{t("editor.normalizing")}</span>
              </div>
            )}
          </div>


          {/* Normalize mode banner */}
          {normalizeMode && (
            <div style={{
              padding: "10px 14px",
              backgroundColor: "#e3f2fd",
              border: "1px solid #90caf9",
              borderRadius: 6,
              marginBottom: 12,
              display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
            }}>
              <span style={{ fontSize: "0.85rem", color: "#1565c0", flex: 1 }}>
                {t("editor.normalizeHint")}
              </span>
              <button className="btn-primary"
                onClick={handleNormalizeRun}
                disabled={fragments.length - normalizeExcluded.size === 0}>
                {t.n("editor.normalizeRun", fragments.length - normalizeExcluded.size)}
              </button>
              <button onClick={() => setNormalizeMode(false)}>{t("common.cancel")}</button>
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
                    {normalizeMode && (
                      <input
                        type="checkbox"
                        checked={!normalizeExcluded.has(f.id)}
                        onChange={() => {
                          setNormalizeExcluded(prev => {
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
                      style={normalizeMode && normalizeExcluded.has(f.id) ? { opacity: 0.4 } : undefined}>
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
        <div className="modal-overlay" onClick={() => { setSubModalFragId(null); setSubModalFile(null) }}>
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
                  <button onClick={() => { setSubModalFragId(null); setSubModalFile(null) }}>{t("common.cancel")}</button>
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
                  <button onClick={() => setSubModalStep("select-text")} className="btn-primary">{t("common.edit")}</button>
                  <button onClick={async () => {
                    if (subModalFile) {
                      await handleRemoveSubtitle(subModalFragId, subModalFile.id)
                    }
                    setSubModalFragId(null)
                    setSubModalFile(null)
                  }} className="btn-danger">{t("editor.unbind")}</button>
                  {subtitleFiles.length > 1 && (
                    <button onClick={() => { setSubModalStep("choose-file"); setSubModalFile(null) }}>{t("common.backPlain")}</button>
                  )}
                  <button onClick={() => { setSubModalFragId(null); setSubModalFile(null) }}>{t("common.cancel")}</button>
                </div>
              </>
            ) : (
              <>
                <h3 style={{ marginTop: 0 }}>{t("editor.selectTextSub")}</h3>
                <p style={{ fontSize: "0.85rem", color: "#666" }}>
                  {t("editor.selectHint")}
                </p>
                <div id="subtitle-text-container" className="subtitle-content">
                  {subModalFile?.content}
                </div>
                <div className="modal-actions">
                  <button onClick={handleSubtitleSelect} className="btn-primary">{t("common.bind")}</button>
                  {subtitleFiles.length > 1 && (
                    <button onClick={() => { setSubModalStep("choose-file"); setSubModalFile(null) }}>{t("common.backPlain")}</button>
                  )}
                  <button onClick={() => { setSubModalFragId(null); setSubModalFile(null) }}>{t("common.cancel")}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Vocabulary modal */}
      {vocabModalFragId && (
        <div className="modal-overlay" onClick={() => { setVocabModalFragId(null); setVocabModalFile(null) }}>
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
                  <button onClick={() => { setVocabModalFragId(null); setVocabModalFile(null) }}>{t("common.cancel")}</button>
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
                  <button onClick={() => setVocabModalStep("select-text")} className="btn-primary">{t("common.edit")}</button>
                  <button onClick={async () => {
                    if (vocabModalFile) {
                      await handleRemoveVocabulary(vocabModalFragId, vocabModalFile.id)
                    }
                    setVocabModalFragId(null)
                    setVocabModalFile(null)
                  }} className="btn-danger">{t("editor.unbind")}</button>
                  {vocabularyFiles.length > 1 && (
                    <button onClick={() => { setVocabModalStep("choose-file"); setVocabModalFile(null) }}>{t("common.backPlain")}</button>
                  )}
                  <button onClick={() => { setVocabModalFragId(null); setVocabModalFile(null) }}>{t("common.cancel")}</button>
                </div>
              </>
            ) : (
              <>
                <h3 style={{ marginTop: 0 }}>{t("editor.selectTextVocab")}</h3>
                <p style={{ fontSize: "0.85rem", color: "#666" }}>
                  {t("editor.selectHint")}
                </p>
                <div id="vocab-text-container" className="subtitle-content">
                  {vocabModalFile?.content}
                </div>
                <div className="modal-actions">
                  <button onClick={handleVocabularySelect} className="btn-primary">{t("common.bind")}</button>
                  {vocabularyFiles.length > 1 && (
                    <button onClick={() => { setVocabModalStep("choose-file"); setVocabModalFile(null) }}>{t("common.backPlain")}</button>
                  )}
                  <button onClick={() => { setVocabModalFragId(null); setVocabModalFile(null) }}>{t("common.cancel")}</button>
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
              {t("editor.newFileAvailable")}
            </p>
            <div className="modal-actions">
              {trimResultInfo.newAudioId && (
                <button className="btn-primary" onClick={() => {
                  const newId = trimResultInfo.newAudioId
                  setTrimResultInfo(null)
                  if (newId) {
                    navigate(`/file/${newId}/sequences`)
                  }
                }}>
                  {t("editor.openTrimmed")}
                </button>
              )}
              <button onClick={() => setTrimResultInfo(null)}>{t("common.close")}</button>
            </div>
          </div>
        </div>
      )}

      {/* Normalize result modal */}
      {normalizeResultInfo && (
        <div className="modal-overlay" onClick={() => setNormalizeResultInfo(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ textAlign: "left", maxWidth: "min(420px, 90vw)" }}>
            <h3 style={{ marginTop: 0 }}>{t("editor.normalizeComplete")}</h3>
            <p style={{ fontSize: "0.9rem", marginBottom: 8 }}>
              {t("editor.created", { name: normalizeResultInfo.normalizedName })}
            </p>
            <p style={{ fontSize: "0.85rem", color: "#555", margin: "4px 0" }}>
              {t("editor.normalizedCount", { n: normalizeResultInfo.selectedCount, total: normalizeResultInfo.totalCount })}
            </p>
            <p style={{ fontSize: "0.85rem", color: "#555", margin: "8px 0 0" }}>
              {t("editor.newFileAvailable")}
            </p>
            <div className="modal-actions">
              {normalizeResultInfo.newAudioId && (
                <button className="btn-primary" onClick={() => {
                  const newId = normalizeResultInfo.newAudioId
                  setNormalizeResultInfo(null)
                  if (newId) navigate(`/file/${newId}/sequences`)
                }}>
                  {t("editor.openNormalized")}
                </button>
              )}
              <button onClick={() => setNormalizeResultInfo(null)}>{t("common.close")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}