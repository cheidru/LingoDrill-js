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

  const [isReady, setIsReady] = useState(false)
  const [isFragmentsReady, setIsFragmentsReady] = useState(false)
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

      loadedIdRef.current = id
      setIsReady(false)
      setIsFragmentsReady(false)
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

      // Шаг 2: Фоновое декодирование (chunked) для WebAudioEngine
      const cached = bufferCacheRef.current.get(id)
      if (cached) {
        webEngine.loadFromBuffer(cached)
        webEngine.setVolume(volumeRef.current)
        setIsFragmentsReady(true)
        setDecodeProgress(1)
      } else {
        try {
          const totalDuration = htmlEngine.getDuration()

          const audioBuffer = await decodeAudioChunked(blob, totalDuration, {
            chunkDurationSec: 30,
            onProgress: (p) => {
              // Only update state if this decode is still current
              if (loadedIdRef.current === id && !abortController.signal.aborted) {
                setDecodeProgress(p)
              }
            },
            signal: abortController.signal,
          })

          // Проверяем что не переключились на другой файл
          if (loadedIdRef.current === id && !abortController.signal.aborted) {
            bufferCacheRef.current.set(id, audioBuffer)
            webEngine.loadFromBuffer(audioBuffer)
            webEngine.setVolume(volumeRef.current)
            setIsFragmentsReady(true)
            setDecodeProgress(1)
          }
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") {
            // User switched files — silently ignore
            return
          }
          console.error("Background decode failed:", err)
          if (loadedIdRef.current === id) {
            setDecodeError(err instanceof Error ? err : new Error(String(err)))
          }
        }
      }
    },
    [getBlob]
  )

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
      if (!webEngine || !isFragmentsReady) return
      htmlEngineRef.current?.stop()
      activeEngineRef.current = "web"
      webEngine.playFragment(fragment)
      setIsPlaying(true)
      setIsPaused(false)
    },
    [isFragmentsReady]
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
    // NEW
    decodeProgress,
    decodeError,
  }
}