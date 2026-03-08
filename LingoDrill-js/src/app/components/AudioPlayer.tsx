// components/AudioPlayer.tsx

import { useState, useCallback } from "react"
import type { MouseEvent } from "react"
import { useNavigate } from "react-router-dom"
import { VolumeControl } from "./VolumeControl"

type Props = {
  fileId: string
  isReady: boolean
  isPlaying: boolean
  duration: number
  currentTime: number
  onPlay: () => void
  onPause: () => void
  onStop: () => void
  onSeek: (time: number) => void
  volume: number
  onVolumeChange: (v: number) => void
}

// Анимированный эквалайзер
function EqualizerLoader() {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 24, padding: "8px 0" }}>
      {[0, 1, 2, 3, 4].map(i => (
        <div
          key={i}
          style={{
            width: 4,
            backgroundColor: "#4a90e2",
            borderRadius: 2,
            animation: `eqBounce 0.8s ease-in-out ${i * 0.1}s infinite alternate`,
          }}
        />
      ))}
      <span style={{ marginLeft: 8, fontSize: 13, color: "#888" }}>Decoding audio...</span>
      <style>{`
        @keyframes eqBounce {
          0% { height: 4px; }
          100% { height: 22px; }
        }
      `}</style>
    </div>
  )
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

const HANDLE_SIZE = 14

export function AudioPlayer({
  fileId,
  isReady,
  isPlaying,
  duration,
  currentTime,
  onPlay,
  onPause,
  onStop,
  onSeek,
  volume,
  onVolumeChange,
}: Props) {
  const navigate = useNavigate()
  const [dragging, setDragging] = useState(false)
  const [hoverHandle, setHoverHandle] = useState(false)

  const progress = duration > 0 ? currentTime / duration : 0

  const getTimeFromEvent = useCallback((e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    return frac * duration
  }, [duration])

  const handleBarMouseDown = useCallback((e: MouseEvent<HTMLDivElement>) => {
    setDragging(true)
    onSeek(getTimeFromEvent(e))
  }, [getTimeFromEvent, onSeek])

  const handleBarMouseMove = useCallback((e: MouseEvent<HTMLDivElement>) => {
    // Check if hovering over handle
    const rect = e.currentTarget.getBoundingClientRect()
    const handleX = rect.left + progress * rect.width
    const isNearHandle = Math.abs(e.clientX - handleX) <= HANDLE_SIZE
    setHoverHandle(isNearHandle)

    if (dragging) {
      onSeek(getTimeFromEvent(e))
    }
  }, [dragging, getTimeFromEvent, onSeek, progress])

  const handleBarMouseUp = useCallback(() => {
    setDragging(false)
  }, [])

  const handleBarMouseLeave = useCallback(() => {
    setDragging(false)
    setHoverHandle(false)
  }, [])

  return (
    <div>
      <h3>Player</h3>

      {!isReady && <EqualizerLoader />}

      {isReady && (
        <>
          {/* Progress bar with handle */}
          <div style={{ marginBottom: 8 }}>
            <div
              style={{
                position: "relative",
                height: 20,
                cursor: hoverHandle || dragging ? "pointer" : "default",
                userSelect: "none",
              }}
              onMouseDown={handleBarMouseDown}
              onMouseMove={handleBarMouseMove}
              onMouseUp={handleBarMouseUp}
              onMouseLeave={handleBarMouseLeave}
            >
              {/* Track */}
              <div style={{
                position: "absolute",
                top: 8,
                left: 0,
                right: 0,
                height: 4,
                backgroundColor: "#e0e0e0",
                borderRadius: 2,
              }}>
                {/* Filled portion */}
                <div style={{
                  height: "100%",
                  width: `${progress * 100}%`,
                  backgroundColor: "#4a90e2",
                  borderRadius: 2,
                }} />
              </div>

              {/* Handle */}
              <div style={{
                position: "absolute",
                top: 10 - HANDLE_SIZE / 2,
                left: `calc(${progress * 100}% - ${HANDLE_SIZE / 2}px)`,
                width: HANDLE_SIZE,
                height: HANDLE_SIZE,
                borderRadius: "50%",
                backgroundColor: "#4a90e2",
                border: "2px solid #fff",
                boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
              }} />
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#888" }}>
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={isPlaying ? onPause : onPlay}>
              {isPlaying ? "Pause" : "Play"}
            </button>

            <button onClick={onStop}>
              Stop
            </button>

            <VolumeControl volume={volume} onVolumeChange={onVolumeChange} />
          </div>

          <div style={{ marginTop: 16 }}>
            <button onClick={() => navigate(`/file/${fileId}/sequences`)}>
              Fragments
            </button>
          </div>
        </>
      )}
    </div>
  )
}