// hooks/useAudioEngine.ts
//
// Аудио-движок на основе одного HtmlAudioEngine.
//
// Воспроизведение (и целого файла, и фрагментов) идёт через HTMLAudioElement —
// без декодирования файла в AudioBuffer. Фрагмент проигрывается по start/end
// времени, поэтому воспроизведение доступно мгновенно после загрузки.
//
// Waveform строится отдельно — потоково, чанками (см. streamWaveform.ts), —
// и этот хук в построении waveform не участвует.

import { useEffect, useRef, useState, useCallback } from "react"
import { HtmlAudioEngine } from "../../infrastructure/audio/htmlAudioEngine"
import type { PlayableFragment } from "../../core/audio/audioEngine"

export function useAudioEngine(
  getBlob: (id: string) => Promise<Blob | null>
) {
  const htmlEngineRef = useRef<HtmlAudioEngine | null>(null)
  const onEndedCallbackRef = useRef<(() => void) | null>(null)
  const loadedIdRef = useRef<string | null>(null)

  const [isReady, setIsReady] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)

  const [volume, setVolumeState] = useState<number>(() => {
    const stored = localStorage.getItem("audio-volume")
    return stored ? Number(stored) : 0.8
  })

  // Создаём движок
  useEffect(() => {
    const htmlEngine = new HtmlAudioEngine()
    htmlEngineRef.current = htmlEngine

    htmlEngine.setOnEnded(() => {
      setIsPlaying(false)
      setIsPaused(false)
      onEndedCallbackRef.current?.()
    })

    return () => {
      htmlEngine.destroy()
    }
  }, [])

  // Sync volume
  useEffect(() => {
    htmlEngineRef.current?.setVolume(volume)
  }, [volume])

  // Timer for currentTime
  useEffect(() => {
    if (!isPlaying) return
    const id = setInterval(() => {
      setCurrentTime(htmlEngineRef.current?.getCurrentTime() ?? 0)
    }, 100)
    return () => clearInterval(id)
  }, [isPlaying])

  const loadById = useCallback(
    async (id: string) => {
      // Пропускаем повторную загрузку для того же файла.
      if (loadedIdRef.current === id) return

      const blob = await getBlob(id)
      if (!blob) return

      loadedIdRef.current = id
      setIsReady(false)

      const htmlEngine = htmlEngineRef.current!
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
    },
    [getBlob]
  )

  const play = useCallback(() => {
    if (!isReady) return
    htmlEngineRef.current?.play()
    setIsPlaying(true)
    setIsPaused(false)
  }, [isReady])

  const pause = useCallback(() => {
    htmlEngineRef.current?.pause()
    setIsPlaying(false)
    setIsPaused(true)
  }, [])

  const stop = useCallback(() => {
    htmlEngineRef.current?.stop()
    setIsPlaying(false)
    setIsPaused(false)
    setCurrentTime(0)
  }, [])

  const seekTo = useCallback((time: number) => {
    if (!isReady) return
    htmlEngineRef.current?.seekTo(time)
    setCurrentTime(time)
  }, [isReady])

  const playFragment = useCallback((fragment: PlayableFragment) => {
    const htmlEngine = htmlEngineRef.current
    if (!htmlEngine) return
    htmlEngine.playFragment(fragment)
    setIsPlaying(true)
    setIsPaused(false)
  }, [])

  const setVolume = useCallback((v: number) => {
    setVolumeState(v)
    localStorage.setItem("audio-volume", String(v))
  }, [])

  const setOnEnded = useCallback((cb: (() => void) | null) => {
    onEndedCallbackRef.current = cb
  }, [])

  return {
    isReady,
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
  }
}
