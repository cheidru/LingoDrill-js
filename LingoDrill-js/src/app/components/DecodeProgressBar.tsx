// app/components/DecodeProgressBar.tsx
//
// Compact progress bar shown while audio is being decoded in chunks.
// Replaces the simple "Decoding audio for fragments..." text with a visual indicator.

interface Props {
  /** 0..1 */
  progress: number
  /** true when decode is complete */
  isReady: boolean
}

export function DecodeProgressBar({ progress, isReady }: Props) {
  if (isReady) return null

  const pct = Math.round(progress * 100)

  return (
    <div style={{
      padding: "6px 0",
      fontSize: "0.82rem",
      color: "#666",
    }}>
      <div style={{ marginBottom: 4 }}>
        Decoding audio for fragments… {pct}%
      </div>
      <div style={{
        height: 4,
        borderRadius: 2,
        backgroundColor: "#e0e0e0",
        overflow: "hidden",
      }}>
        <div style={{
          height: "100%",
          width: `${pct}%`,
          backgroundColor: "#4caf50",
          borderRadius: 2,
          transition: "width 0.3s ease",
        }} />
      </div>
    </div>
  )
}