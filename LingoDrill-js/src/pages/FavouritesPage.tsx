// pages/FavouritesPage.tsx
//
// Shows all sequences marked as favourite across all audio files.
// Each sequence box mirrors the Fragment Library layout.

import { useEffect, useState, useCallback, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { useSharedAudioEngine } from "../app/hooks/useSharedAudioEngine"
import { IndexedDBSequenceStorage } from "../infrastructure/indexeddb/IndexedDBSequenceStorage"
import type { Sequence } from "../core/domain/types"

// --- Icons ---
const PlayIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
)
const EditIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
)
const FavouriteIcon = ({ filled }: { filled: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill={filled ? "#1a56db" : "none"} stroke={filled ? "#1a56db" : "currentColor"} strokeWidth="2">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  </svg>
)

export function FavouritesPage() {
  const navigate = useNavigate()
  const { files } = useSharedAudioEngine()

  const storageRef = useRef<IndexedDBSequenceStorage | null>(null)
  const [sequences, setSequences] = useState<Sequence[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    storageRef.current = new IndexedDBSequenceStorage()
    let cancelled = false
    const load = async () => {
      const all = await storageRef.current!.getAll()
      if (!cancelled) {
        setSequences(all.filter(s => s.favourite))
        setIsLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
      storageRef.current = null
    }
  }, [])

  const handleToggleFavourite = useCallback(async (seq: Sequence) => {
    if (!storageRef.current) return
    const updated = { ...seq, favourite: !seq.favourite }
    await storageRef.current.update(updated)
    setSequences(prev =>
      updated.favourite
        ? prev.map(s => s.id === updated.id ? updated : s)
        : prev.filter(s => s.id !== updated.id)
    )
  }, [])

  const getAudioName = (audioId: string) =>
    files.find(f => f.id === audioId)?.name ?? "Unknown file"

  return (
    <div className="page">
      <h2>Favourites</h2>

      {isLoading && <p>Loading...</p>}

      {!isLoading && sequences.length === 0 && (
        <p className="empty-state">No favourite sequences yet. Star a sequence in the Fragment Library to see it here.</p>
      )}

      {sequences.map(seq => (
        <div key={seq.id} className="seq-card">
          <div className="seq-bar-wrap">
            {/* Label */}
            <span className="seq-label">
              #{seq.label}
            </span>

            <span style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
              {seq.fragments.length} fragment{seq.fragments.length !== 1 ? "s" : ""}
            </span>

            <span style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
              {getAudioName(seq.audioId)}
            </span>

            {/* Play → navigate to Sequence Player page */}
            <div className="seq-controls">
              <button
                className="seq-controls__btn"
                onClick={() => navigate(`/file/${seq.audioId}/player/${seq.id}`)}
                disabled={seq.fragments.length === 0}
                title={seq.fragments.length === 0 ? "No fragments to play" : "Open Sequence Player"}
              >
                <PlayIcon />
              </button>

              {/* Edit */}
              <button className="seq-controls__btn" onClick={() => navigate(`/file/${seq.audioId}/editor/${seq.id}`)} title="Edit">
                <EditIcon />
              </button>

              {/* Favourite toggle */}
              <button
                className="seq-controls__btn"
                onClick={() => handleToggleFavourite(seq)}
                title="Remove from favourites"
              >
                <FavouriteIcon filled={true} />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
