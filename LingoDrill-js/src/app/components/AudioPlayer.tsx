// app/components/AudioPlayer.tsx
import { useState, useCallback, useRef, useEffect } from "react"
import type { MouseEvent } from "react"
import { useNavigate } from "react-router-dom"
import { VolumeControl } from "./VolumeControl"

type Props = {
  fileId: string; isReady: boolean; isPlaying: boolean; duration: number; currentTime: number
  onPlay: () => void; onPause: () => void; onStop: () => void; onSeek: (time: number) => void
  volume: number; onVolumeChange: (v: number) => void
}

// ToDo Убрать эквалайзер так-как загрузка аудиофайла происходит мгновенно
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

  // Ref for the progress bar element (needed for touch events)
  const progressBarRef = useRef<HTMLDivElement>(null)
  // Ref to track touch-dragging state (avoids stale closure issues in touch handlers)
  const touchDraggingRef = useRef(false)
  // Ref for duration to avoid stale closures in touch handlers
  const durationRef = useRef(duration)
  useEffect(() => { durationRef.current = duration }, [duration])
  // Ref for onSeek to avoid stale closures
  const onSeekRef = useRef(onSeek)
  useEffect(() => { onSeekRef.current = onSeek }, [onSeek])

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

  // --- Touch event handlers for progress bar sliding ---
  // Attached via useEffect with isReady dep so we re-attach when the bar appears in DOM.
  // The progress bar is conditionally rendered inside {isReady && (...)}, so the ref is
  // null until isReady becomes true. We must re-run this effect when isReady changes.

  useEffect(() => {
    const bar = progressBarRef.current
    if (!bar) return

    const getTimeFromTouch = (touch: Touch): number => {
      const rect = bar.getBoundingClientRect()
      const ratio = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width))
      return ratio * durationRef.current
    }

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      e.preventDefault()
      touchDraggingRef.current = true
      setDragging(true)
      onSeekRef.current(getTimeFromTouch(e.touches[0]))
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (!touchDraggingRef.current || e.touches.length !== 1) return
      e.preventDefault()
      onSeekRef.current(getTimeFromTouch(e.touches[0]))
    }

    const handleTouchEnd = (e: TouchEvent) => {
      if (!touchDraggingRef.current) return
      e.preventDefault()
      touchDraggingRef.current = false
      setDragging(false)
    }

    const handleTouchCancel = () => {
      touchDraggingRef.current = false
      setDragging(false)
    }

    bar.addEventListener("touchstart", handleTouchStart, { passive: false })
    bar.addEventListener("touchmove", handleTouchMove, { passive: false })
    bar.addEventListener("touchend", handleTouchEnd, { passive: false })
    bar.addEventListener("touchcancel", handleTouchCancel)

    return () => {
      bar.removeEventListener("touchstart", handleTouchStart)
      bar.removeEventListener("touchmove", handleTouchMove)
      bar.removeEventListener("touchend", handleTouchEnd)
      bar.removeEventListener("touchcancel", handleTouchCancel)
    }
  }, [isReady]) // Re-run when isReady changes so we attach after the bar renders

  return (
    <div>
      <h3>Player</h3>
      {!isReady && <EqualizerLoader />}
      {isReady && (
        <>
          <div className="progress-wrap">
            <div
              ref={progressBarRef}
              className="progress-bar"
              style={{ cursor: hoverHandle || dragging ? "pointer" : "default", touchAction: "none" }}
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