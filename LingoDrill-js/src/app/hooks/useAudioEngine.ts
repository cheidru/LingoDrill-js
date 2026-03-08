// hooks/useAudioEngine.ts

import { useEffect, useRef, useState, useCallback } from "react"
import { WebAudioEngine } from "../../infrastructure/audio/webAudioEngine"
import type { PlayableFragment } from "../../core/audio/audioEngine"

export function useAudioEngine(
  getBlob: (id: string) => Promise<Blob | null>
) {
  const engineRef = useRef<WebAudioEngine | null>(null)
  const onEndedCallbackRef = useRef<(() => void) | null>(null)
  const bufferCacheRef = useRef<Map<string, AudioBuffer>>(new Map())
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

  // Engine создаётся один раз
  useEffect(() => {
    const engine = new WebAudioEngine()
    engineRef.current = engine

    engine.setOnEnded(() => {
      setIsPlaying(false)
      setIsPaused(false)
      // Вызываем внешний callback если установлен
      onEndedCallbackRef.current?.()
    })

    return () => {
      engine.destroy()
      engineRef.current = null
    }
  }, [])

  // Volume обновляется отдельно
  useEffect(() => {
    engineRef.current?.setVolume(volume)
  }, [volume])

  // Playback clock
  useEffect(() => {
    let raf: number

    const tick = () => {
      const time = engineRef.current?.getCurrentTime() ?? 0
      setCurrentTime(time)
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const loadById = useCallback(
    async (id: string | null) => {
      const engine = engineRef.current
      if (!engine) return

      engine.stop()
      setIsPlaying(false)
      setIsPaused(false)
      setCurrentTime(0)

      if (!id) {
        setIsReady(false)
        loadedIdRef.current = null
        return
      }

      // Если тот же файл уже загружен — ничего не делаем
      if (loadedIdRef.current === id && engine.getDuration() > 0) {
        setDuration(engine.getDuration())
        setIsReady(true)
        return
      }

      setIsReady(false)

      // Проверяем кеш декодированных буферов
      const cached = bufferCacheRef.current.get(id)
      if (cached) {
        engine.loadFromBuffer(cached)
        loadedIdRef.current = id
        setDuration(engine.getDuration())
        setIsReady(true)
        return
      }

      // Загружаем blob и декодируем один раз
      const blob = await getBlob(id)
      if (!blob) return

      const arrayBuffer = await blob.arrayBuffer()
      const ctx = new AudioContext()
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
      await ctx.close()

      // Кешируем и загружаем в engine
      bufferCacheRef.current.set(id, audioBuffer)
      engine.loadFromBuffer(audioBuffer)
      loadedIdRef.current = id

      setDuration(engine.getDuration())
      setIsReady(true)
    },
    [getBlob]
  )

  const play = useCallback(() => {
    const engine = engineRef.current
    if (!engine || !isReady) return
    engine.play()
    setIsPlaying(true)
    setIsPaused(false)
  }, [isReady])

  const pause = useCallback(() => {
    engineRef.current?.pause()
    setIsPlaying(false)
    setIsPaused(true)
  }, [])

  const stop = useCallback(() => {
    engineRef.current?.stop()
    setIsPlaying(false)
    setIsPaused(false)
    setCurrentTime(0)
  }, [])

  const playFragment = useCallback(
    (fragment: PlayableFragment) => {
      const engine = engineRef.current
      if (!engine || !isReady) return
      engine.playFragment(fragment)
      setIsPlaying(true)
      setIsPaused(false)
    },
    [isReady]
  )

  const setVolume = useCallback((v: number) => {
    setVolumeState(v)
    localStorage.setItem("audio-volume", String(v))
  }, [])

  const seekTo = useCallback((time: number) => {
    const engine = engineRef.current
    if (!engine || !isReady) return
    engine.seekTo(time)
    setCurrentTime(time)
  }, [isReady])

  /** Register a callback that fires when playback ends naturally */
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