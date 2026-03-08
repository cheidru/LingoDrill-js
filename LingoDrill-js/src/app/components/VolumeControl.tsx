// app/components/VolumeControl.tsx

type Props = {
  volume: number
  onVolumeChange: (v: number) => void
}

const SpeakerIcon = ({ volume }: { volume: number }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" />
    {volume > 0 && (
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    )}
    {volume > 0.5 && (
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    )}
    {volume === 0 && (
      <>
        <line x1="23" y1="9" x2="17" y2="15" />
        <line x1="17" y1="9" x2="23" y2="15" />
      </>
    )}
  </svg>
)

export function VolumeControl({ volume, onVolumeChange }: Props) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <SpeakerIcon volume={volume} />
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={volume}
        onChange={(e) => onVolumeChange(Number(e.target.value))}
        style={{ width: 120 }}
      />
    </div>
  )
}