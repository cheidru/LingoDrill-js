import { useEffect, useRef, useState, useCallback } from "react"
import { WebAudioEngine } from "../../infrastructure/audio/webAudioEngine"
import type { Fragment } from "../../core/audio/audioEngine"

export function useAudioEngine(
  getBlob: (id: string) => Promise<Blob | null>
) {
  const engineRef = useRef<WebAudioEngine | null>(null)

  const [isReady, setIsReady] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)

  const [volume, setVolumeState] = useState<number>(() => {
    const stored = localStorage.getItem("audio-volume")
    return stored ? Number(stored) : 0.8
  })

  useEffect(() => {
    const engine = new WebAudioEngine()
    engineRef.current = engine

    engine.setOnEnded(() => {
      setIsPlaying(false)
      setCurrentTime(0)
    })

    engine.setVolume(volume)

    return () => {
      engine.destroy()
      engineRef.current = null
    }
  }, [volume])

  // playback clock
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
      setIsReady(false)
      setCurrentTime(0)

      if (!id) return

      const blob = await getBlob(id)
      if (!blob) return

      await engine.load(blob)
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
  }, [isReady])

  const stop = useCallback(() => {
    engineRef.current?.stop()
    setIsPlaying(false)
    setCurrentTime(0)
  }, [])

  const playFragment = useCallback(
    (fragment: Fragment) => {
      const engine = engineRef.current
      if (!engine || !isReady) return
      engine.playFragment(fragment)
      setIsPlaying(true)
    },
    [isReady]
  )

  const setVolume = useCallback((v: number) => {
    setVolumeState(v)
    localStorage.setItem("audio-volume", String(v))
    engineRef.current?.setVolume(v)
  }, [])

  return {
    isReady,
    isPlaying,
    duration,
    currentTime,
    loadById,
    play,
    stop,
    playFragment,
    volume,
    setVolume,
  }
}