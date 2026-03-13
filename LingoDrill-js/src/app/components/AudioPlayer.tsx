// app/components/AudioPlayer.tsx
import { useState, useCallback } from "react"
import type { MouseEvent } from "react"
import { useNavigate } from "react-router-dom"
import { VolumeControl } from "./VolumeControl"

type Props = {
  fileId: string; isReady: boolean; isPlaying: boolean; duration: number; currentTime: number
  onPlay: () => void; onPause: () => void; onStop: () => void; onSeek: (time: number) => void
  volume: number; onVolumeChange: (v: number) => void
}

function EqualizerLoader() {
  return (
    <div className="eq-loader">
      {[0, 1, 2, 3, 4].map(i => (
        <div key={i} className="eq-loader__bar" style={{ animation: `eqBounce 0.8s ease-in-out ${i * 0.1}s infinite alternate` }} />
      ))}
      <span className="eq-loader__text">Decoding audio...</span>
    </div>
  )
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60); const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

const HANDLE_SIZE = 14

export function AudioPlayer({ fileId, isReady, isPlaying, duration, currentTime, onPlay, onPause, onStop, onSeek, volume, onVolumeChange }: Props) {
  const navigate = useNavigate()
  const [dragging, setDragging] = useState(false)
  const [hoverHandle, setHoverHandle] = useState(false)
  const progress = duration > 0 ? currentTime / duration : 0

  const getTimeFromEvent = useCallback((e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * duration
  }, [duration])

  const handleBarMouseDown = useCallback((e: MouseEvent<HTMLDivElement>) => { setDragging(true); onSeek(getTimeFromEvent(e)) }, [getTimeFromEvent, onSeek])
  const handleBarMouseMove = useCallback((e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setHoverHandle(Math.abs(e.clientX - (rect.left + progress * rect.width)) <= HANDLE_SIZE)
    if (dragging) onSeek(getTimeFromEvent(e))
  }, [dragging, getTimeFromEvent, onSeek, progress])
  const handleBarMouseUp = useCallback(() => setDragging(false), [])
  const handleBarMouseLeave = useCallback(() => { setDragging(false); setHoverHandle(false) }, [])

  return (
    <div>
      <h3>Player</h3>
      {!isReady && <EqualizerLoader />}
      {isReady && (
        <>
          <div className="progress-wrap">
            <div className="progress-bar" style={{ cursor: hoverHandle || dragging ? "pointer" : "default" }}
              onMouseDown={handleBarMouseDown} onMouseMove={handleBarMouseMove} onMouseUp={handleBarMouseUp} onMouseLeave={handleBarMouseLeave}>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${progress * 100}%` }} />
              </div>
              <div className="progress-handle" style={{ left: `calc(${progress * 100}% - ${HANDLE_SIZE / 2}px)` }} />
            </div>
            <div className="progress-time">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>
          <div className="player-controls">
            <button onClick={isPlaying ? onPause : onPlay}>{isPlaying ? "Pause" : "Play"}</button>
            <button onClick={onStop}>Stop</button>
            <VolumeControl volume={volume} onVolumeChange={onVolumeChange} />
          </div>
          <div className="player-nav">
            <button onClick={() => navigate(`/file/${fileId}/sequences`)}>Fragments</button>
          </div>
        </>
      )}
    </div>
  )
}