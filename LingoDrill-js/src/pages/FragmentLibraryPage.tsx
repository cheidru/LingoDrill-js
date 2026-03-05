// pages/FragmentLibraryPage.tsx

import { useEffect, useState, useCallback, useRef } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useSequences } from "../app/hooks/useSequences"
import { useSubtitles } from "../app/hooks/useSubtitles"
import { useAudioLibrary } from "../app/hooks/useAudioLibrary"
import { useAudioEngine } from "../app/hooks/useAudioEngine"
import type { Sequence, SequenceFragment } from "../core/domain/types"
import type { PlayableFragment } from "../core/audio/audioEngine"

// --- Icons ---
const PlayIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
)
const PauseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
)
const StopIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h12v12H6z" /></svg>
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

// --- Sequence bar ---
function SequenceBar({
  sequence, duration, playingFragIdx,
}: {
  sequence: Sequence; duration: number; playingFragIdx: number | null
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
        const isPlaying = playingFragIdx === i
        return (
          <rect key={i} x={startPx} y={2} width={widthPx} height={12} rx={1}
            fill={isPlaying ? "#f44336" : "#ffc107"} opacity={isPlaying ? 1 : 0.85} />
        )
      })}
    </svg>
  )
}

// --- Subtitle display for playing fragment ---
function SubtitleDisplay({
  fragment, subtitleFiles,
}: {
  fragment: SequenceFragment; subtitleFiles: { id: string; content: string; name: string }[]
}) {
  if (!fragment.subtitles || fragment.subtitles.length === 0) return null

  return (
    <div style={{
      padding: "8px 12px", backgroundColor: "rgba(0,0,0,0.03)",
      border: "1px solid #ddd", borderRadius: 4, marginTop: 4, marginBottom: 4,
    }}>
      {fragment.subtitles.map((sub, i) => {
        const file = subtitleFiles.find(sf => sf.id === sub.subtitleFileId)
        const text = file ? file.content.slice(sub.charStart, sub.charEnd) : "(file not found)"
        return (
          <div key={i} style={{ marginBottom: i < fragment.subtitles.length - 1 ? 6 : 0 }}>
            <div style={{ fontSize: 11, color: "#888" }}>{sub.subtitleFileName}</div>
            <div style={{ fontSize: 14, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{text}</div>
          </div>
        )
      })}
    </div>
  )
}

// --- Main page ---
export function FragmentLibraryPage() {
  const { id: audioId } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { getBlob } = useAudioLibrary()
  const {
    loadById, playFragment, pause, play, stop,
    isReady, isPlaying, isPaused, duration,
  } = useAudioEngine(getBlob)

  const { sequences, isLoading, deleteSequence, updateSequence } = useSequences(audioId ?? null)
  const { subtitleFiles, addSubtitleFile } = useSubtitles(audioId ?? null)

  const [playingSeqId, setPlayingSeqId] = useState<string | null>(null)
  const [playingFragIdx, setPlayingFragIdx] = useState(0)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null)
  const [editingLabelValue, setEditingLabelValue] = useState("")

  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (audioId) loadById(audioId)
  }, [audioId, loadById])

  // --- Sequence playback ---

  const playSequenceFragment = useCallback((seq: Sequence, fragIdx: number) => {
    if (fragIdx >= seq.fragments.length) {
      setPlayingSeqId(null); setPlayingFragIdx(0); stop(); return
    }
    const f = seq.fragments[fragIdx]
    const fragment: PlayableFragment = { start: f.start, end: f.end, repeat: f.repeat }
    setPlayingSeqId(seq.id)
    setPlayingFragIdx(fragIdx)
    playFragment(fragment)
  }, [playFragment, stop])

  useEffect(() => {
    if (!playingSeqId) return
    if (isPlaying || isPaused) return
    const seq = sequences.find(s => s.id === playingSeqId)
    if (!seq) return
    const nextIdx = playingFragIdx + 1
    if (nextIdx < seq.fragments.length) {
      playSequenceFragment(seq, nextIdx)
    } else {
      setPlayingSeqId(null); setPlayingFragIdx(0)
    }
  }, [isPlaying, isPaused, playingSeqId, playingFragIdx, sequences, playSequenceFragment])

  const handlePlay = useCallback((seq: Sequence) => {
    if (playingSeqId === seq.id && isPaused) { play(); return }
    playSequenceFragment(seq, 0)
  }, [playingSeqId, isPaused, play, playSequenceFragment])

  const handlePause = useCallback(() => { pause() }, [pause])

  const handleStop = useCallback(() => {
    stop(); setPlayingSeqId(null); setPlayingFragIdx(0)
  }, [stop])

  // --- Delete ---
  const handleDelete = useCallback(async (seqId: string) => {
    await deleteSequence(seqId); setConfirmDeleteId(null)
    if (playingSeqId === seqId) handleStop()
  }, [deleteSequence, playingSeqId, handleStop])

  // --- Label editing ---
  const startEditLabel = useCallback((seq: Sequence) => {
    setEditingLabelId(seq.id); setEditingLabelValue(seq.label)
  }, [])

  const saveLabel = useCallback(async (seq: Sequence) => {
    const trimmed = editingLabelValue.trim()
    if (trimmed && trimmed !== seq.label) await updateSequence({ ...seq, label: trimmed })
    setEditingLabelId(null)
  }, [editingLabelValue, updateSequence])

  // --- Subtitle upload ---
  const handleSubtitleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    await addSubtitleFile(file)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }, [addSubtitleFile])

  // --- Get currently playing fragment ---
  const playingSeq = playingSeqId ? sequences.find(s => s.id === playingSeqId) : null
  const currentPlayingFrag = playingSeq && playingFragIdx < playingSeq.fragments.length
    ? playingSeq.fragments[playingFragIdx] : null

  if (isLoading) return <div style={{ padding: 24 }}>Loading...</div>

  return (
    <div style={{ padding: 24 }}>
      <button onClick={() => navigate("/")}>← Back</button>
      <h2>Fragment Library</h2>

      {!isReady && <p>Loading audio...</p>}

      {isReady && (
        <>
          <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center" }}>
            <button onClick={() => navigate(`/file/${audioId}/editor`)}>+ New Sequence</button>

            <label style={{
              padding: "6px 12px", border: "1px solid #ccc", borderRadius: 4,
              cursor: "pointer", fontSize: 13,
            }}>
              + Add Subtitles
              <input ref={fileInputRef} type="file" accept=".txt,.sub,.srt"
                style={{ display: "none" }} onChange={handleSubtitleUpload} />
            </label>

            {subtitleFiles.length > 0 && (
              <span style={{ fontSize: 12, color: "#888" }}>
                {subtitleFiles.length} subtitle file(s): {subtitleFiles.map(f => f.name).join(", ")}
              </span>
            )}
          </div>

          {sequences.length === 0 && (
            <p style={{ color: "#888" }}>No sequences yet. Create one in the Fragment Editor.</p>
          )}

          {sequences.map(seq => {
            const isThisPlaying = playingSeqId === seq.id && isPlaying
            const isThisPaused = playingSeqId === seq.id && isPaused
            const isThisActive = isThisPlaying || isThisPaused

            return (
              <div key={seq.id} style={{ marginBottom: 4 }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 0", borderBottom: "1px solid #eee",
                }}>
                  <SequenceBar
                    sequence={seq} duration={duration}
                    playingFragIdx={isThisActive ? playingFragIdx : null}
                  />

                  <button onClick={() => isThisPlaying ? handlePause() : handlePlay(seq)}
                    title={isThisPlaying ? "Pause" : "Play"}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
                    {isThisPlaying ? <PauseIcon /> : <PlayIcon />}
                  </button>

                  <button onClick={handleStop} title="Stop"
                    disabled={!isThisActive}
                    style={{
                      background: "none", border: "none", padding: 4,
                      cursor: isThisActive ? "pointer" : "default",
                      opacity: isThisActive ? 1 : 0.3,
                    }}>
                    <StopIcon />
                  </button>

                  <button onClick={() => navigate(`/file/${audioId}/editor/${seq.id}`)}
                    title="Edit" style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
                    <EditIcon />
                  </button>

                  <button onClick={() => setConfirmDeleteId(seq.id)} title="Delete"
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "#d32f2f" }}>
                    <DeleteIcon />
                  </button>

                  {editingLabelId === seq.id ? (
                    <input autoFocus value={editingLabelValue}
                      onChange={e => setEditingLabelValue(e.target.value)}
                      onBlur={() => saveLabel(seq)}
                      onKeyDown={e => { if (e.key === "Enter") saveLabel(seq); if (e.key === "Escape") setEditingLabelId(null) }}
                      style={{ width: 100, fontSize: 13, padding: "2px 4px" }} />
                  ) : (
                    <span onDoubleClick={() => startEditLabel(seq)} title="Double-click to rename"
                      style={{ fontSize: 13, cursor: "text", minWidth: 30 }}>{seq.label}</span>
                  )}

                  <span style={{ fontSize: 11, color: "#888" }}>({seq.fragments.length} frag.)</span>
                </div>

                {/* Subtitle display under the playing sequence */}
                {isThisActive && currentPlayingFrag && playingSeqId === seq.id && (
                  <SubtitleDisplay fragment={currentPlayingFrag} subtitleFiles={subtitleFiles} />
                )}
              </div>
            )
          })}

          {/* Delete confirmation modal */}
          {confirmDeleteId && (
            <div style={{
              position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
              background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
            }}>
              <div style={{ background: "white", padding: 24, borderRadius: 8, minWidth: 300, textAlign: "center" }}>
                <p>Delete this sequence?</p>
                <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 16 }}>
                  <button onClick={() => handleDelete(confirmDeleteId)}
                    style={{ backgroundColor: "#d32f2f", color: "white", border: "none", padding: "6px 16px", borderRadius: 4, cursor: "pointer" }}>
                    Delete
                  </button>
                  <button onClick={() => setConfirmDeleteId(null)}
                    style={{ padding: "6px 16px", borderRadius: 4, cursor: "pointer" }}>Cancel</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}