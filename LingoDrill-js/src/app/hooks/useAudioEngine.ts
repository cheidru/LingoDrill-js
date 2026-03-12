// hooks/useAudioEngine.ts

import { useEffect, useRef, useState, useCallback } from "react"
import { HtmlAudioEngine } from "../../infrastructure/audio/htmlAudioEngine"
import { WebAudioEngine } from "../../infrastructure/audio/webAudioEngine"
import type { PlayableFragment } from "../../core/audio/audioEngine"

/**
 * Двухуровневый аудио-движок:
 * - HtmlAudioEngine — для воспроизведения целого файла (мгновенный старт)
 * - WebAudioEngine  — для воспроизведения фрагментов (нужен AudioBuffer)
 *
 * При loadById:
 * 1. HtmlAudioEngine загружает blob мгновенно (Object URL)
 * 2. В фоне запускается decodeAudioData для WebAudioEngine
 * 3. Когда AudioBuffer готов — фрагменты становятся доступны
 */
export function useAudioEngine(
  getBlob: (id: string) => Promise<Blob | null>
) {
  const htmlEngineRef = useRef<HtmlAudioEngine | null>(null)
  const webEngineRef = useRef<WebAudioEngine | null>(null)
  const onEndedCallbackRef = useRef<(() => void) | null>(null)
  const bufferCacheRef = useRef<Map<string, AudioBuffer>>(new Map())
  const loadedIdRef = useRef<string | null>(null)
  // Какой движок сейчас активен: "html" для целого файла, "web" для фрагментов
  const activeEngineRef = useRef<"html" | "web">("html")

  const [isReady, setIsReady] = useState(false)
  const [isFragmentsReady, setIsFragmentsReady] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)

  const [volume, setVolumeState] = useState<number>(() => {
    const stored = localStorage.getItem("audio-volume")
    return stored ? Number(stored) : 0.8
  })

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
      htmlEngineRef.current = null
      webEngineRef.current = null
    }
  }, [])

  // Volume
  useEffect(() => {
    htmlEngineRef.current?.setVolume(volume)
    webEngineRef.current?.setVolume(volume)
  }, [volume])

  // Playback clock
  useEffect(() => {
    let raf: number
    const tick = () => {
      const engine = activeEngineRef.current === "web"
        ? webEngineRef.current
        : htmlEngineRef.current
      const time = engine?.getCurrentTime() ?? 0
      setCurrentTime(time)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const loadById = useCallback(
    async (id: string | null) => {
      const htmlEngine = htmlEngineRef.current
      const webEngine = webEngineRef.current
      if (!htmlEngine || !webEngine) return

      // Stop both engines
      htmlEngine.stop()
      webEngine.stop()
      activeEngineRef.current = "html"
      setIsPlaying(false)
      setIsPaused(false)
      setCurrentTime(0)

      if (!id) {
        setIsReady(false)
        setIsFragmentsReady(false)
        loadedIdRef.current = null
        return
      }

      // Если тот же файл — проверяем что уже загружен
      if (loadedIdRef.current === id && htmlEngine.getDuration() > 0) {
        setDuration(htmlEngine.getDuration())
        setIsReady(true)
        setIsFragmentsReady(bufferCacheRef.current.has(id))
        return
      }

      setIsReady(false)
      setIsFragmentsReady(false)

      // Загружаем blob
      const blob = await getBlob(id)
      if (!blob) return

      // Шаг 1: HtmlAudioEngine — мгновенная загрузка
      htmlEngine.load(blob)
      htmlEngine.setVolume(volume)
      loadedIdRef.current = id

      // Ждём пока <audio> определит duration
      await new Promise<void>(resolve => {
        const checkDuration = () => {
          const d = htmlEngine.getDuration()
          if (d > 0) {
            setDuration(d)
            setIsReady(true)
            resolve()
          } else {
            setTimeout(checkDuration, 50)
          }
        }
        checkDuration()
      })

      // Шаг 2: Фоновое декодирование для WebAudioEngine (фрагменты)
      const cached = bufferCacheRef.current.get(id)
      if (cached) {
        webEngine.loadFromBuffer(cached)
        webEngine.setVolume(volume)
        setIsFragmentsReady(true)
      } else {
        // Декодируем в фоне — не блокирует UI
        try {
          const arrayBuffer = await blob.arrayBuffer()
          const ctx = new AudioContext()
          const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
          await ctx.close()

          // Проверяем что не переключились на другой файл
          if (loadedIdRef.current === id) {
            bufferCacheRef.current.set(id, audioBuffer)
            webEngine.loadFromBuffer(audioBuffer)
            webEngine.setVolume(volume)
            setIsFragmentsReady(true)
          }
        } catch (err) {
          console.error("Background decode failed:", err)
        }
      }
    },
    [getBlob, volume]
  )

  const play = useCallback(() => {
    if (!isReady) return
    // Используем html engine для целого файла
    activeEngineRef.current = "html"
    htmlEngineRef.current?.play()
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
      // Останавливаем html engine, переключаемся на web
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

  /** Получить декодированный AudioBuffer из кеша (для построения waveform) */
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
  }
}