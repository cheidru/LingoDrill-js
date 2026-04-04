// pages/FragmentLibraryPage.tsx
//
// CHANGES:
// 1. REMOVED: Inline sequence playback (VolumeControl, playFragment, play-all etc.)
// 2. Play button on each sequence box now navigates to SequencePlayerPage
// 3. Subtitle management modal remains unchanged
// 4. Copy, Edit, Delete remain unchanged

import { useEffect, useState, useCallback, useRef } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useSequences } from "../app/hooks/useSequences"
import { useSubtitles } from "../app/hooks/useSubtitles"
import { useSharedAudioEngine } from "../app/hooks/useSharedAudioEngine"
import type { Sequence, SequenceFragment } from "../core/domain/types"
import { nanoid } from "nanoid"

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
const DeleteIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
  </svg>
)
const CopyIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
  </svg>
)

// --- Sequence bar ---
function SequenceBar({
  sequence, duration,
}: {
  sequence: Sequence; duration: number
}) {
  const BAR_WIDTH = 200
  const MIN_FRAG_PX = 2

  return (
    <svg width={BAR_WIDTH} height={16} style={{ display: "block", flexShrink: 0 }}>
      <rect x={0} y={2} width={BAR_WIDTH} height={12} rx={2} fill="#4caf50" opacity={0.3} />
      {duration > 0 && sequence.fragments.map((f, i) => {
        const startPx = (f.start / duration) * BAR_WIDTH
        let widthPx = ((f.end - f.start) / duration) * BAR_WIDTH
        if (widthPx < MIN_FRAG_PX) widthPx = MIN_FRAG_PX
        return (
          <rect key={i} x={startPx} y={2} width={widthPx} height={12} rx={1}
            fill="#ffc107" opacity={0.85} />
        )
      })}
    </svg>
  )
}

// --- Main page ---
export function FragmentLibraryPage() {
  return <FragmentLibraryPageInner />
}

function FragmentLibraryPageInner() {
  const { id: audioId } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const {
    files,
    loadById, stop,
    duration,
  } = useSharedAudioEngine()

  const { sequences, isLoading, addSequence, deleteSequence, updateSequence } = useSequences(audioId ?? null)
  const { subtitleFiles, addSubtitleFile, deleteSubtitleFile } = useSubtitles(audioId ?? null)

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null)
  const [editingLabelValue, setEditingLabelValue] = useState("")

  // Subtitle management modal state
  const [subModalOpen, setSubModalOpen] = useState(false)
  const subFileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (audioId) loadById(audioId)
  }, [audioId, loadById])

  // Stop playback when leaving the page (unmount)
  const stopRef = useRef(stop)
  useEffect(() => { stopRef.current = stop }, [stop])
  useEffect(() => {
    return () => {
      console.log("[FragmentLibraryPage] unmounting, stopping playback")
      stopRef.current()
    }
  }, [])

  // --- Label editing ---
  const handleLabelSave = useCallback(async () => {
    if (!editingLabelId) return
    const seq = sequences.find(s => s.id === editingLabelId)
    if (seq) {
      await updateSequence({ ...seq, label: editingLabelValue.trim() || seq.label })
    }
    setEditingLabelId(null)
  }, [editingLabelId, editingLabelValue, sequences, updateSequence])

  // --- Copy sequence ---
  const handleCopySequence = useCallback(async (seq: Sequence) => {
    const copiedFragments: SequenceFragment[] = seq.fragments.map(f => ({
      ...f,
      id: nanoid(),
      subtitles: [...f.subtitles],
    }))
    const newSeq = await addSequence(copiedFragments)
    if (newSeq) {
      console.log("[FragmentLibrary] Copied sequence", seq.label, "→", newSeq.label)
    }
  }, [addSequence])

  // --- Subtitle file management ---
  const handleSubFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    await addSubtitleFile(file)
    if (subFileInputRef.current) subFileInputRef.current.value = ""
  }, [addSubtitleFile])

  const handleDeleteSubtitleFile = useCallback(async (subFileId: string) => {
    await deleteSubtitleFile(subFileId)

    for (const seq of sequences) {
      const hasAffectedFragments = seq.fragments.some(f =>
        f.subtitles.some(s => s.subtitleFileId === subFileId)
      )
      if (hasAffectedFragments) {
        const updatedFragments = seq.fragments.map(f => ({
          ...f,
          subtitles: f.subtitles.filter(s => s.subtitleFileId !== subFileId),
        }))
        await updateSequence({ ...seq, fragments: updatedFragments })
      }
    }
    console.log("[FragmentLibrary] Deleted subtitle file and cleaned up bindings:", subFileId)
  }, [deleteSubtitleFile, sequences, updateSequence])

  const fileName = files.find(f => f.id === audioId)?.name ?? "Unknown"

  return (
    <div className="page">
      <h2>Fragment Library</h2>
      <p style={{ fontSize: "0.9rem", color: "#666", marginTop: -8, marginBottom: 12 }}>
        {fileName}
      </p>

      <div className="toolbar">
        <button onClick={() => navigate(audioId ? `/file/${audioId}/editor` : "/")}>
          + New sequence
        </button>
        <button onClick={() => setSubModalOpen(true)}>
          Sub ({subtitleFiles.length})
        </button>
      </div>

      {isLoading && <p>Loading sequences...</p>}

      {!isLoading && sequences.length === 0 && (
        <p style={{ color: "#888" }}>No sequences yet. Create one in the editor.</p>
      )}

      {sequences.map(seq => {
        return (
          <div key={seq.id} style={{
            border: "1px solid #ddd",
            borderRadius: 4,
            padding: 12,
            marginBottom: 8,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {/* Label */}
              {editingLabelId === seq.id ? (
                <input
                  value={editingLabelValue}
                  onChange={e => setEditingLabelValue(e.target.value)}
                  onBlur={handleLabelSave}
                  onKeyDown={e => { if (e.key === "Enter") handleLabelSave() }}
                  autoFocus
                  style={{ width: 80, fontWeight: 600 }}
                />
              ) : (
                <span
                  style={{ fontWeight: 600, cursor: "pointer", minWidth: 30 }}
                  onClick={() => { setEditingLabelId(seq.id); setEditingLabelValue(seq.label) }}
                  title="Click to rename"
                >
                  #{seq.label}
                </span>
              )}

              <span style={{ fontSize: "0.85rem", color: "#888" }}>
                {seq.fragments.length} fragment{seq.fragments.length !== 1 ? "s" : ""}
              </span>

              <SequenceBar sequence={seq} duration={duration} />

              {/* Play → navigate to Sequence Player page */}
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <button
                  onClick={() => navigate(`/file/${audioId}/player/${seq.id}`)}
                  disabled={seq.fragments.length === 0}
                  title={seq.fragments.length === 0 ? "No fragments to play" : "Open Sequence Player"}
                >
                  <PlayIcon />
                </button>
              </div>

              {/* Edit / Copy / Delete */}
              <button onClick={() => navigate(`/file/${audioId}/editor/${seq.id}`)} title="Edit">
                <EditIcon />
              </button>
              <button onClick={() => handleCopySequence(seq)} title="Copy">
                <CopyIcon />
              </button>
              <button onClick={() => setConfirmDeleteId(seq.id)} title="Delete" style={{ color: "#d32f2f" }}>
                <DeleteIcon />
              </button>
            </div>
          </div>
        )
      })}

      {/* Back */}
      <div className="player-nav" style={{ marginTop: 16 }}>
        <button onClick={() => navigate("/")}>← Back to library</button>
      </div>

      {/* Delete confirmation modal */}
      {confirmDeleteId && (
        <div className="modal-overlay" onClick={() => setConfirmDeleteId(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <p>Delete this sequence?</p>
            <div className="modal-actions">
              <button onClick={async () => {
                await deleteSequence(confirmDeleteId)
                setConfirmDeleteId(null)
              }} className="btn-danger">Delete</button>
              <button onClick={() => setConfirmDeleteId(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Subtitle file management modal */}
      {subModalOpen && (
        <div className="modal-overlay" onClick={() => setSubModalOpen(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ textAlign: "left", maxWidth: 420 }}>
            <h3 style={{ marginTop: 0 }}>Subtitle files</h3>

            {subtitleFiles.length === 0 ? (
              <p style={{ color: "#888", fontSize: "0.9rem" }}>No subtitle files uploaded yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                {subtitleFiles.map(sf => (
                  <div key={sf.id} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "6px 10px", border: "1px solid #e0e0e0", borderRadius: 4,
                  }}>
                    <span style={{ fontSize: "0.9rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
                      {sf.name}
                    </span>
                    <button
                      className="btn-sub"
                      onClick={() => handleDeleteSubtitleFile(sf.id)}
                      style={{ color: "#d32f2f", flexShrink: 0, marginLeft: 8 }}
                      title="Delete subtitle file"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginBottom: 8 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <button className="btn-primary" onClick={() => subFileInputRef.current?.click()}>
                  + Add subtitle file
                </button>
                <input
                  ref={subFileInputRef}
                  type="file"
                  accept=".txt,.srt,.vtt"
                  onChange={handleSubFileUpload}
                  style={{ display: "none" }}
                />
              </label>
            </div>

            <div className="modal-actions">
              <button onClick={() => setSubModalOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}