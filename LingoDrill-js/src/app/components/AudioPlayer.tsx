// components/AudioPlayer.tsx

import { useNavigate } from "react-router-dom"
import { VolumeControl } from "./VolumeControl"

type Props = {
  fileId: string
  isReady: boolean
  isPlaying: boolean
  duration: number
  onPlay: () => void
  onPause: () => void
  onStop: () => void
  volume: number
  onVolumeChange: (v: number) => void
}

export function AudioPlayer({
  fileId,
  isReady,
  isPlaying,
  duration,
  onPlay,
  onPause,
  onStop,
  volume,
  onVolumeChange,
}: Props) {
  const navigate = useNavigate()

  return (
    <div>
      <h3>Player</h3>

      {!isReady && <p>Decoding audio...</p>}

      {isReady && (
        <>
          <p>Duration: {duration.toFixed(2)} sec</p>

          <button onClick={isPlaying ? onPause : onPlay}>
            {isPlaying ? "Pause" : "Play"}
          </button>

          <button onClick={onStop} style={{ marginLeft: 8 }}>
            Stop
          </button>

          <div style={{ marginTop: 12 }}>
            <VolumeControl volume={volume} onVolumeChange={onVolumeChange} />
          </div>

          <div style={{ marginTop: 16 }}>
            <button
              onClick={() =>
                navigate(`/file/${fileId}/sequences`)
              }
            >
              Fragments
            </button>
          </div>
        </>
      )}
    </div>
  )
}