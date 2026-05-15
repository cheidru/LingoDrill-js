// hooks/useAudioEngine.ts
//
// ИЗМЕНЕНИЯ:
// 1. Фоновое декодирование теперь использует decodeAudioChunked() вместо
//    одноразового decodeAudioData() — на мобильных устройствах файл декодируется
//    чанками по ~30 секунд, между которыми отдаётся управление event loop.
// 2. Добавлен decodeProgress (0..1) для отображения прогресса декодирования.
// 3. Добавлен AbortController для отмены декодирования при смене файла.
// 4. decodeError теперь выставляется при ошибке chunked decode.
// 5. ИСПРАВЛЕНИЕ: loadById пропускает повторную загрузку и decode если тот же
//    файл уже загружен (или в процессе загрузки). Это предотвращает мгновенное
//    появление ошибок при навигации между страницами для одного audioId.
// 6. Декодирование фрагментов теперь ЛЕНИВОЕ: loadById больше не декодирует
//    файл сразу. Декодирование запускается по требованию через
//    ensureFragmentsDecoded() — при первом воспроизведении фрагмента.

import { useEffect, useRef, useState, useCallback } from "react"
import { HtmlAudioEngine } from "../../infrastructure/audio/htmlAudioEngine"
import { WebAudioEngine } from "../../infrastructure/audio/webAudioEngine"
import { decodeAudioChunked } from "../../infrastructure/audio/chunkedDecode"
import type { PlayableFragment } from "../../core/audio/audioEngine"

/**
 * Двухуровневый аудио-движок:
 * - HtmlAudioEngine — для воспроизведения целого файла (мгновенный старт)
 * - WebAudioEngine  — для воспроизведения фрагментов (нужен AudioBuffer)
 *
 * При loadById:
 * 1. HtmlAudioEngine загружает blob мгновенно (Object URL)
 * 2. В фоне запускается chunked decodeAudioData для WebAudioEngine
 * 3. По мере декодирования обновляется decodeProgress
 * 4. Когда AudioBuffer готов — фрагменты становятся доступны
 */
export function useAudioEngine(
  getBlob: (id: string) => Promise<Blob | null>
) {
  const htmlEngineRef = useRef<HtmlAudioEngine | null>(null)
  const webEngineRef = useRef<WebAudioEngine | null>(null)
  const onEndedCallbackRef = useRef<(() => void) | null>(null)
  const bufferCacheRef = useRef<Map<string, AudioBuffer>>(new Map())
  const loadedIdRef = useRef<string | null>(null)
  const activeEngineRef = useRef<"html" | "web">("html")

  // AbortController for cancelling in-flight decode when switching files
  const decodeAbortRef = useRef<AbortController | null>(null)

  // In-flight lazy decode — фрагменты декодируются по требованию
  // (ensureFragmentsDecoded), а не сразу при загрузке файла.
  const decodePromiseRef = useRef<Promise<void> | null>(null)

  const [isReady, setIsReady] = useState(false)
  const [isFragmentsReady, setIsFragmentsReady] = useState(false)
  // Зеркало isFragmentsReady в ref — чтобы playFragment/ensureFragmentsDecoded
  // видели актуальное значение без устаревших замыканий.
  const isFragmentsReadyRef = useRef(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)

  // NEW: decode progress 0..1 and error
  const [decodeProgress, setDecodeProgress] = useState(0)
  const [decodeError, setDecodeError] = useState<Error | null>(null)

  const [volume, setVolumeState] = useState<number>(() => {
    const stored = localStorage.getItem("audio-volume")
    return stored ? Number(stored) : 0.8
  })

  const volumeRef = useRef<number>(volume)

  // Создаём оба движка
  useEffect(() => {
    const htmlEngine = new HtmlAudioEngine()
    const webEngine = new WebAudioEngine()
    htmlEngineRef.current = htmlEngine
    webEngineRef.current = webEngine

    htmlEngine.setOnEnded(() => {
      setIsPlaying(false)
      setIsPaused(false)
      onEndedCallbackRef.current?.()
    })

    webEngine.setOnEnded(() => {
      setIsPlaying(false)
      setIsPaused(false)
      onEndedCallbackRef.current?.()
    })

    return () => {
      htmlEngine.destroy()
      webEngine.destroy()
    }
  }, [])

  // Sync volume ref
  useEffect(() => {
    volumeRef.current = volume
    htmlEngineRef.current?.setVolume(volume)
    webEngineRef.current?.setVolume(volume)
  }, [volume])

  // Update isFragmentsReady state + ref together — the ref must be current
  // synchronously so playFragment() (called right after an awaited decode)
  // sees the new value before React flushes the re-render.
  const setFragmentsReady = useCallback((ready: boolean) => {
    isFragmentsReadyRef.current = ready
    setIsFragmentsReady(ready)
  }, [])

  // Timer for currentTime
  useEffect(() => {
    if (!isPlaying) return
    const id = setInterval(() => {
      if (activeEngineRef.current === "web") {
        setCurrentTime(webEngineRef.current?.getCurrentTime() ?? 0)
      } else {
        setCurrentTime(htmlEngineRef.current?.getCurrentTime() ?? 0)
      }
    }, 100)
    return () => clearInterval(id)
  }, [isPlaying])

  const loadById = useCallback(
    async (id: string) => {
      // Пропускаем повторную загрузку для того же файла.
      // При навигации между страницами (Editor ↔ Library) useEffect
      // каждой страницы вызывает loadById(audioId). Если файл уже загружен
      // (или decode в процессе/упал), не перезапускаем весь цикл.
      if (loadedIdRef.current === id) {
        return
      }

      const blob = await getBlob(id)
      if (!blob) return

      // Cancel any in-flight decode
      decodeAbortRef.current?.abort()
      const abortController = new AbortController()
      decodeAbortRef.current = abortController
      decodePromiseRef.current = null

      loadedIdRef.current = id
      setIsReady(false)
      setFragmentsReady(false)
      setDecodeProgress(0)
      setDecodeError(null)

      const htmlEngine = htmlEngineRef.current!
      const webEngine = webEngineRef.current!

      // Шаг 1: HtmlAudioEngine — мгновенный старт
      htmlEngine.load(blob)

      // Ждём пока HTMLAudioElement определит duration
      await new Promise<void>((resolve) => {
        const checkDuration = () => {
          const d = htmlEngine.getDuration()
          if (d > 0 && isFinite(d)) {
            setDuration(d)
            setIsReady(true)
            resolve()
          } else {
            setTimeout(checkDuration, 50)
          }
        }
        checkDuration()
      })

      // Шаг 2: фрагменты декодируются ЛЕНИВО. Декодирование всего файла в
      // AudioBuffer запускается только по требованию (ensureFragmentsDecoded —
      // при первом воспроизведении фрагмента). Если файл уже декодировали в
      // этой сессии, буфер лежит в кеше — используем его сразу.
      const cached = bufferCacheRef.current.get(id)
      if (cached) {
        webEngine.loadFromBuffer(cached)
        webEngine.setVolume(volumeRef.current)
        setFragmentsReady(true)
        setDecodeProgress(1)
      }
    },
    [getBlob, setFragmentsReady]
  )

  /**
   * Декодирует весь файл в AudioBuffer для воспроизведения фрагментов.
   * Вызывается лениво — при первом воспроизведении фрагмента или когда
   * декодированный звук нужен для построения waveform. Повторные вызовы во
   * время декодирования возвращают тот же промис; после успеха резолвятся
   * мгновенно (буфер берётся из кеша).
   */
  const ensureFragmentsDecoded = useCallback(async (): Promise<void> => {
    const id = loadedIdRef.current
    if (!id) return

    // Уже декодировано
    const cached = bufferCacheRef.current.get(id)
    if (cached) {
      if (!isFragmentsReadyRef.current) {
        webEngineRef.current?.loadFromBuffer(cached)
        webEngineRef.current?.setVolume(volumeRef.current)
        setFragmentsReady(true)
        setDecodeProgress(1)
      }
      return
    }

    // Декодирование уже идёт — ждём его
    if (decodePromiseRef.current) {
      return decodePromiseRef.current
    }

    const blob = await getBlob(id)
    if (!blob || loadedIdRef.current !== id) return

    const abortController = decodeAbortRef.current
    setDecodeError(null)
    setDecodeProgress(0)

    const run = async (): Promise<void> => {
      try {
        const totalDuration = htmlEngineRef.current?.getDuration() ?? 0
        const audioBuffer = await decodeAudioChunked(blob, totalDuration, {
          chunkDurationSec: 30,
          onProgress: (p) => {
            if (loadedIdRef.current === id && !abortController?.signal.aborted) {
              setDecodeProgress(p)
            }
          },
          signal: abortController?.signal,
        })
        if (loadedIdRef.current === id && !abortController?.signal.aborted) {
          bufferCacheRef.current.set(id, audioBuffer)
          webEngineRef.current?.loadFromBuffer(audioBuffer)
          webEngineRef.current?.setVolume(volumeRef.current)
          setFragmentsReady(true)
          setDecodeProgress(1)
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return
        console.error("Fragment decode failed:", err)
        if (loadedIdRef.current === id) {
          setDecodeError(err instanceof Error ? err : new Error(String(err)))
        }
        throw err
      } finally {
        decodePromiseRef.current = null
      }
    }

    const p = run()
    decodePromiseRef.current = p
    return p
  }, [getBlob, setFragmentsReady])

  const play = useCallback(() => {
    if (!isReady) return
    if (activeEngineRef.current === "web") {
      webEngineRef.current?.play()
    } else {
      htmlEngineRef.current?.play()
    }
    setIsPlaying(true)
    setIsPaused(false)
  }, [isReady])

  const pause = useCallback(() => {
    if (activeEngineRef.current === "web") {
      webEngineRef.current?.pause()
    } else {
      htmlEngineRef.current?.pause()
    }
    setIsPlaying(false)
    setIsPaused(true)
  }, [])

  const stop = useCallback(() => {
    htmlEngineRef.current?.stop()
    webEngineRef.current?.stop()
    activeEngineRef.current = "html"
    setIsPlaying(false)
    setIsPaused(false)
    setCurrentTime(0)
  }, [])

  const seekTo = useCallback((time: number) => {
    if (!isReady) return
    if (activeEngineRef.current === "web") {
      webEngineRef.current?.seekTo(time)
    } else {
      htmlEngineRef.current?.seekTo(time)
    }
    setCurrentTime(time)
  }, [isReady])

  const playFragment = useCallback(
    (fragment: PlayableFragment) => {
      const webEngine = webEngineRef.current
      if (!webEngine || !isFragmentsReadyRef.current) return
      htmlEngineRef.current?.stop()
      activeEngineRef.current = "web"
      webEngine.playFragment(fragment)
      setIsPlaying(true)
      setIsPaused(false)
    },
    []
  )

  const setVolume = useCallback((v: number) => {
    setVolumeState(v)
    localStorage.setItem("audio-volume", String(v))
  }, [])

  const setOnEnded = useCallback((cb: (() => void) | null) => {
    onEndedCallbackRef.current = cb
  }, [])

  const getAudioBuffer = useCallback((id: string): AudioBuffer | null => {
    return bufferCacheRef.current.get(id) ?? null
  }, [])

  return {
    isReady,
    isFragmentsReady,
    isPlaying,
    isPaused,
    duration,
    currentTime,
    loadById,
    play,
    pause,
    stop,
    seekTo,
    playFragment,
    volume,
    setVolume,
    setOnEnded,
    getAudioBuffer,
    ensureFragmentsDecoded,
    // NEW
    decodeProgress,
    decodeError,
  }
}