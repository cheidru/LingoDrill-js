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

  const [volume, setVolumeState] = useState<number>(() => {
    const stored = localStorage.getItem("audio-volume")
    return stored ? Number(stored) : 0.8
  })

  useEffect(() => {
    const engine = new WebAudioEngine()
    engineRef.current = engine

    engine.setOnEnded(() => {
      setIsPlaying(false)
    })

    engine.setVolume(volume)

    return () => {
      engine.destroy()
      engineRef.current = null
    }
  }, [])

const loadById = useCallback(
  async (id: string | null) => {
    const engine = engineRef.current

    if (!engine) return

    // ВСЕГДА останавливаем текущее воспроизведение
    engine.stop()
    setIsPlaying(false)
    setIsReady(false)

    if (!id) {
      return
    }

    const blob = await getBlob(id)

    if (!blob) {
      return
    }

    await engine.load(blob)

    setDuration(engine.getDuration())
    setIsReady(true)
  },
  [getBlob]
)

  const play = useCallback(() => {
    engineRef.current?.play()
    setIsPlaying(true)
  }, [])

  const stop = useCallback(() => {
    engineRef.current?.stop()
    setIsPlaying(false)
  }, [])

  const playFragment = useCallback(
    (fragment: Fragment) => {
      engineRef.current?.playFragment(fragment)
      setIsPlaying(true)
    },
    []
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
    loadById,
    play,
    stop,
    playFragment,
    volume,
    setVolume,
  }
}