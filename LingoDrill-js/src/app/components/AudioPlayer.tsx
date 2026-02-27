import { useNavigate } from "react-router-dom"

type Props = {
  fileId: string
  isReady: boolean
  isPlaying: boolean
  duration: number
  onPlay: () => void
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

          <button onClick={onPlay} disabled={isPlaying}>
            Play
          </button>

          <button onClick={onStop}>
            Stop
          </button>

          <div style={{ marginTop: 12 }}>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={(e) =>
                onVolumeChange(Number(e.target.value))
              }
            />
          </div>

          <div style={{ marginTop: 16 }}>
            <button
              onClick={() =>
                navigate(`/file/${fileId}/fragments`)
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