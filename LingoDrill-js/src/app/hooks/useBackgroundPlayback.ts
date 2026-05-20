// app/hooks/useBackgroundPlayback.ts
//
// Background-listening mode for mobile.
//
// The live engine (HtmlAudioEngine) drives fragment timing with JS timers, so
// the sequence stops advancing when the screen is locked. This hook owns a
// separate HTMLAudioElement that plays a single pre-rendered MP3 (entire
// sequence + repeats + gaps baked in, see core/audio/renderSequence) with
// loop=true. Once a single <audio> element is playing, browsers keep it
// running through screen-off / app-backgrounded. No JS needs to run during
// playback, so timer throttling is a non-issue.
//
// Media Session API exposes play/pause and prev/next-track on the OS lock
// screen; prev/next seek currentTime to the adjacent entry in fragmentOffsets.
//
// iOS gesture unlock: a fresh HTMLAudioElement can only start playback inside
// the user-gesture handler that requested it. The render is async (1-30s for
// a fresh render, instant from cache) — so the click handler calls
// `armForGesture()` synchronously, which kicks off a silent play() on the
// element. The element is now "unlocked"; later .play() calls (after the MP3
// is ready) are allowed on iOS.

import { useCallback, useEffect, useRef, useState } from "react"
import type { Sequence, SequenceFragment } from "../../core/domain/types"
import { renderSequence, type FragmentOffset, type RenderFragment } from "../../core/audio/renderSequence"
import { RenderedSequenceStore, type RenderedSequenceEntry } from "../../infrastructure/indexeddb/renderedSequenceStore"
import { FRAGMENT_TRAILING_PAUSE } from "../../core/audio/constants"
import { getFragmentGap } from "../../utils/settings"
import {
  setMediaMetadata,
  setActionHandlers,
  setPlaybackState,
  setPositionState,
  clearMediaSession,
} from "../../infrastructure/audio/mediaSession"
import { looksLikeMp3 } from "../../utils/mp3Frames"

interface PreparedInputs {
  fragments: RenderFragment[]
  fragmentGap: number
  trailingPause: number
  audioId: string
}

/**
 * Stable hash of every input that affects the rendered MP3. Mismatch → re-render.
 * Order matters: changing fragment order should invalidate the cache, since the
 * baked output plays them in order.
 */
function computeHash(inputs: PreparedInputs): string {
  const parts = [
    `a:${inputs.audioId}`,
    `g:${inputs.fragmentGap}`,
    `p:${inputs.trailingPause}`,
    ...inputs.fragments.map(
      (f, i) =>
        `f${i}:${f.start.toFixed(6)},${f.end.toFixed(6)},${f.repeat},${f.speed.toFixed(4)}`,
    ),
  ]
  return parts.join("|")
}

function toRenderFragments(
  sequence: Sequence,
  disabled: Record<number, boolean>,
): { fragments: RenderFragment[]; originalIndices: number[] } {
  const fragments: RenderFragment[] = []
  const originalIndices: number[] = []
  sequence.fragments.forEach((f: SequenceFragment, i) => {
    if (disabled[i]) return
    fragments.push({ start: f.start, end: f.end, repeat: Math.max(1, f.repeat), speed: f.speed })
    originalIndices.push(i)
  })
  return { fragments, originalIndices }
}

export interface BackgroundPlaybackController {
  /** True while a render is in progress. */
  isRendering: boolean
  /** 0..1 — progress of the current render. Meaningless when isRendering is false. */
  renderProgress: number
  /** True while the background <audio> is actively playing. */
  isPlaying: boolean
  /** True once a sequence has been loaded into the background element. */
  isActive: boolean
  /**
   * Index into the original sequence.fragments array of the fragment currently
   * playing in background mode. Null when no mapping is known (between
   * fragments, or before the first timeupdate). Stops updating while the page
   * is hidden — that's intentional and fine.
   */
  currentFragmentIndex: number | null
  /** Error during prepare/render, if any. */
  error: string | null

  /**
   * Enter background mode for `sequence`. Must be invoked synchronously from a
   * user-gesture handler so iOS lets us start the <audio>. Triggers a render on
   * cache miss; uses the cached MP3 on hit. Returns once playback has begun.
   */
  start: (sequence: Sequence, disabled: Record<number, boolean>) => Promise<void>

  play: () => void
  pause: () => void
  next: () => void
  prev: () => void
  /** Stop and tear down. Releases the Object URL and clears the Media Session. */
  exit: () => void
}

export function useBackgroundPlayback(
  getBlob: (id: string) => Promise<Blob | null>,
  fileNameById: (id: string) => string | undefined,
): BackgroundPlaybackController {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const offsetsRef = useRef<FragmentOffset[]>([])
  const originalIndicesRef = useRef<number[]>([])
  const durationRef = useRef<number>(0)
  const storeRef = useRef<RenderedSequenceStore | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const [isRendering, setIsRendering] = useState(false)
  const [renderProgress, setRenderProgress] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isActive, setIsActive] = useState(false)
  const [currentFragmentIndex, setCurrentFragmentIndex] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Lazily build the <audio> element and the store on first use.
  const ensureAudio = useCallback((): HTMLAudioElement => {
    if (audioRef.current) return audioRef.current
    const a = new Audio()
    a.loop = true
    a.preload = "auto"
    audioRef.current = a
    a.addEventListener("play", () => {
      setIsPlaying(true)
      setPlaybackState("playing")
    })
    a.addEventListener("pause", () => {
      setIsPlaying(false)
      setPlaybackState("paused")
    })
    a.addEventListener("timeupdate", () => {
      // Only update while page is visible — saves work and avoids any cost on iOS
      // during screen-off (timeupdate still fires in the background otherwise).
      if (typeof document !== "undefined" && document.hidden) return
      const t = a.currentTime
      const offsets = offsetsRef.current
      const orig = originalIndicesRef.current
      if (offsets.length === 0) return
      // Binary search would be overkill — handful of fragments in practice.
      let idx = -1
      for (let i = 0; i < offsets.length; i++) {
        if (offsets[i].startSec <= t) idx = i
        else break
      }
      const mapped = idx >= 0 ? orig[idx] ?? null : null
      setCurrentFragmentIndex(prev => (prev === mapped ? prev : mapped))
      setPositionState(durationRef.current, t)
    })
    return a
  }, [])

  const ensureStore = useCallback((): RenderedSequenceStore => {
    if (!storeRef.current) storeRef.current = new RenderedSequenceStore()
    return storeRef.current
  }, [])

  const applyEntry = useCallback(
    (entry: RenderedSequenceEntry, originalIndices: number[], title: string) => {
      const audio = ensureAudio()
      // Replace any previous Object URL.
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }
      const url = URL.createObjectURL(entry.mp3Blob)
      objectUrlRef.current = url
      audio.src = url
      audio.loop = true
      offsetsRef.current = entry.fragmentOffsets
      originalIndicesRef.current = originalIndices
      durationRef.current = entry.durationSec

      setMediaMetadata(title)
    },
    [ensureAudio],
  )

  const seekToOffsetIndex = useCallback((i: number) => {
    const audio = audioRef.current
    if (!audio) return
    const offsets = offsetsRef.current
    if (i < 0 || i >= offsets.length) return
    audio.currentTime = offsets[i].startSec + 0.001
  }, [])

  const next = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    const offsets = offsetsRef.current
    if (offsets.length === 0) return
    const t = audio.currentTime
    let nextIdx = 0
    for (let i = 0; i < offsets.length; i++) {
      if (offsets[i].startSec > t + 0.01) {
        nextIdx = i
        break
      }
      // If we never break, wrap to start.
      nextIdx = i === offsets.length - 1 ? 0 : nextIdx
    }
    seekToOffsetIndex(nextIdx)
  }, [seekToOffsetIndex])

  const prev = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    const offsets = offsetsRef.current
    if (offsets.length === 0) return
    const t = audio.currentTime
    // If we're more than 1s into the current fragment, jump to its start;
    // otherwise jump to the previous fragment. Matches typical media-session UX.
    let curIdx = 0
    for (let i = 0; i < offsets.length; i++) {
      if (offsets[i].startSec <= t) curIdx = i
      else break
    }
    const intoCurrent = t - offsets[curIdx].startSec
    const target = intoCurrent > 1 ? curIdx : Math.max(0, curIdx - 1)
    seekToOffsetIndex(target)
  }, [seekToOffsetIndex])

  const play = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.play().catch(() => {})
  }, [])

  const pause = useCallback(() => {
    audioRef.current?.pause()
  }, [])

  const exit = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.removeAttribute("src")
      audio.load()
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
    clearMediaSession()
    offsetsRef.current = []
    originalIndicesRef.current = []
    durationRef.current = 0
    setIsActive(false)
    setIsPlaying(false)
    setCurrentFragmentIndex(null)
    setIsRendering(false)
    setRenderProgress(0)
    setError(null)
  }, [])

  // Wire Media Session action handlers once the audio element exists.
  useEffect(() => {
    if (!isActive) return
    setActionHandlers({ play, pause, previoustrack: prev, nexttrack: next })
    return () => {
      // We don't tear down the handlers here — exit() handles full teardown,
      // and we want the handlers to remain attached for the whole background
      // session. But if the effect re-runs due to deps changing, re-attach.
    }
  }, [isActive, play, pause, prev, next])

  // Tear down on unmount.
  useEffect(() => {
    return () => {
      exit()
    }
  }, [exit])

  const start = useCallback(
    async (sequence: Sequence, disabled: Record<number, boolean>) => {
      setError(null)
      const { fragments, originalIndices } = toRenderFragments(sequence, disabled)
      if (fragments.length === 0) {
        setError("No enabled fragments to play")
        return
      }

      const audioId = sequence.audioId
      const fragmentGap = getFragmentGap()
      const trailingPause = FRAGMENT_TRAILING_PAUSE
      const hash = computeHash({ audioId, fragmentGap, trailingPause, fragments })

      // iOS gesture unlock: kick off a play() on the element synchronously
      // (this call MUST be on the user-gesture call stack, so `start` itself
      // must be invoked synchronously from a click handler).
      const audio = ensureAudio()
      audio.src = ""
      audio.play().catch(() => {
        // Expected to reject because src is empty — we just need the element
        // to be marked as gesture-activated for iOS. Silence the warning.
      })

      setIsActive(true)
      setIsPlaying(false)
      setCurrentFragmentIndex(null)

      const store = ensureStore()
      const title = fileNameById(audioId) ?? sequence.label ?? "Sequence"

      const cached = await store.get(sequence.id, hash)
      if (cached) {
        applyEntry(cached, originalIndices, title)
        try {
          await audio.play()
        } catch (e) {
          setError((e as Error).message ?? "Could not start playback")
        }
        return
      }

      // Cache miss — render. Validate source format up front so we fail fast.
      const blob = await getBlob(audioId)
      if (!blob) {
        setError("Audio file not found")
        return
      }
      // Cheap pre-check before the full read inside renderSequence.
      const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer())
      if (!looksLikeMp3(head)) {
        setError("Background mode requires an MP3 source file")
        return
      }

      const abort = new AbortController()
      abortRef.current = abort
      setIsRendering(true)
      setRenderProgress(0)

      try {
        const result = await renderSequence(blob, fragments, {
          fragmentGapSec: fragmentGap,
          trailingPauseSec: trailingPause,
          onProgress: p => setRenderProgress(p),
          signal: abort.signal,
        })
        if (abort.signal.aborted) return

        const entry: RenderedSequenceEntry = {
          hash,
          mp3Blob: result.mp3Blob,
          fragmentOffsets: result.fragmentOffsets,
          durationSec: result.durationSec,
          createdAt: Date.now(),
        }
        await store.save(sequence.id, entry)
        applyEntry(entry, originalIndices, title)
        try {
          await audio.play()
        } catch (e) {
          setError((e as Error).message ?? "Could not start playback")
        }
      } catch (e) {
        if ((e as DOMException)?.name === "AbortError") return
        setError((e as Error).message ?? "Render failed")
      } finally {
        setIsRendering(false)
        abortRef.current = null
      }
    },
    [applyEntry, ensureAudio, ensureStore, fileNameById, getBlob],
  )

  return {
    isRendering,
    renderProgress,
    isPlaying,
    isActive,
    currentFragmentIndex,
    error,
    start,
    play,
    pause,
    next,
    prev,
    exit,
  }
}
