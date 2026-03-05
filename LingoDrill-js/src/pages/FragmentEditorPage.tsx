// pages/FragmentEditorPage.tsx

import { useEffect, useState, useCallback, useRef } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useAudioLibrary } from "../app/hooks/useAudioLibrary"
import { useAudioEngine } from "../app/hooks/useAudioEngine"
import { useSequences } from "../app/hooks/useSequences"
import { useSubtitles } from "../app/hooks/useSubtitles"
import { Waveform } from "../app/components/Waveform"
import type { WaveformFragment } from "../app/components/Waveform"
import { buildWaveform } from "../utils/buildWaveform"
import type { PlayableFragment } from "../core/audio/audioEngine"
import type { SequenceFragment, FragmentSubtitle, SubtitleFile } from "../core/domain/types"
import { nanoid } from "nanoid"

export function FragmentEditorPage() {
  const { id: audioId, seqId } = useParams<{ id: string; seqId?: string }>()
  const navigate = useNavigate()

  const { getBlob } = useAudioLibrary()
  const {
    loadById, playFragment, pause, play, stop,
    isReady, isPlaying, isPaused, duration, currentTime,
  } = useAudioEngine(getBlob)

  const { sequences, addSequence, updateSequence } = useSequences(audioId ?? null)
  const { subtitleFiles } = useSubtitles(audioId ?? null)

  const [waveformData, setWaveformData] = useState<number[]>([])
  const [playingFragment, setPlayingFragment] =
    useState<{ start: number; end: number } | null>(null)

  const [fragments, setFragments] = useState<SequenceFragment[]>([])
  const [sequenceLoaded, setSequenceLoaded] = useState(false)
  const currentSeqIdRef = useRef<string | null>(seqId ?? null)

  // --- Editing state ---
  const [editingId, setEditingId] = useState<string | null>(null)
  const savedBoundsRef = useRef<{ start: number; end: number } | null>(null)

  // --- Subtitle selection modal ---
  const [subModalFragId, setSubModalFragId] = useState<string | null>(null)
  const [subModalStep, setSubModalStep] = useState<"choose-file" | "select-text">("choose-file")
  const [subModalFile, setSubModalFile] = useState<SubtitleFile | null>(null)
  // Prompt to choose fragment for subtitle binding
  const [subPromptMode, setSubPromptMode] = useState(false)
  const [pendingSubFile, setPendingSubFile] = useState<SubtitleFile | null>(null)

  // Load audio and waveform
  useEffect(() => {
    if (!audioId) return
    const load = async () => {
      await loadById(audioId)
      const blob = await getBlob(audioId)
      if (!blob) return
      const buffer = await blob.arrayBuffer()
      const ctx = new AudioContext()
      const audioBuffer = await ctx.decodeAudioData(buffer)
      setWaveformData(buildWaveform(audioBuffer, 1000))
      await ctx.close()
    }
    load()
  }, [audioId, getBlob, loadById])

  // Load sequence fragments
  useEffect(() => {
    if (sequenceLoaded) return
    if (!seqId) { setSequenceLoaded(true); return }
    const seq = sequences.find(s => s.id === seqId)
    if (seq) {
      setFragments(seq.fragments.map(f => ({ ...f, subtitles: f.subtitles ?? [] })))
      currentSeqIdRef.current = seq.id
      setSequenceLoaded(true)
    }
  }, [seqId, sequences, sequenceLoaded])

  // --- Persist ---

  const persistSequence = useCallback(async (updatedFragments: SequenceFragment[]) => {
    if (!audioId) return
    if (currentSeqIdRef.current) {
      const seq = sequences.find(s => s.id === currentSeqIdRef.current)
      if (seq) await updateSequence({ ...seq, fragments: updatedFragments })
    } else {
      const newSeq = await addSequence(updatedFragments)
      if (newSeq) {
        currentSeqIdRef.current = newSeq.id
        window.history.replaceState(null, "", `/file/${audioId}/editor/${newSeq.id}`)
      }
    }
  }, [audioId, sequences, addSequence, updateSequence])

  // --- Fragment operations ---

  const addFragment = useCallback(async (start: number, end: number) => {
    if (editingId) { setEditingId(null); savedBoundsRef.current = null }
    const frag: SequenceFragment = {
      id: nanoid(), start, end, repeat: 1, speed: 1, subtitles: [],
    }
    const updated = [...fragments, frag]
    setFragments(updated)
    await persistSequence(updated)
  }, [editingId, fragments, persistSequence])

  const deleteLocalFragment = useCallback(async (fragId: string) => {
    if (editingId === fragId) { setEditingId(null); savedBoundsRef.current = null }
    const updated = fragments.filter(f => f.id !== fragId)
    setFragments(updated)
    stop(); setPlayingFragment(null)
    await persistSequence(updated)
  }, [editingId, fragments, stop, persistSequence])

  const updateLocalFragment = useCallback((updated: SequenceFragment) => {
    setFragments(prev => prev.map(f => f.id === updated.id ? updated : f))
  }, [])

  // --- Editing handlers ---

  const startEditing = useCallback((fragId: string) => {
    if (editingId && editingId !== fragId && savedBoundsRef.current) {
      const prev = fragments.find(fr => fr.id === editingId)
      if (prev) updateLocalFragment({ ...prev, start: savedBoundsRef.current.start, end: savedBoundsRef.current.end })
    }
    const f = fragments.find(fr => fr.id === fragId)
    if (!f) return
    setEditingId(fragId)
    savedBoundsRef.current = { start: f.start, end: f.end }
  }, [editingId, fragments, updateLocalFragment])

  const handleFragmentClick = useCallback((fragId: string) => {
    // If in subtitle prompt mode, open subtitle selection for this fragment
    if (subPromptMode && pendingSubFile) {
      setSubModalFragId(fragId)
      setSubModalFile(pendingSubFile)
      setSubModalStep("select-text")
      setSubPromptMode(false)
      setPendingSubFile(null)
      return
    }
    startEditing(fragId)
  }, [startEditing, subPromptMode, pendingSubFile])

  const handleClickOutside = useCallback(() => {
    if (subPromptMode) {
      setSubPromptMode(false)
      setPendingSubFile(null)
      return
    }
    if (!editingId) return
    if (savedBoundsRef.current) {
      const f = fragments.find(fr => fr.id === editingId)
      if (f) updateLocalFragment({ ...f, start: savedBoundsRef.current.start, end: savedBoundsRef.current.end })
    }
    setEditingId(null)
    savedBoundsRef.current = null
  }, [editingId, fragments, updateLocalFragment, subPromptMode])

  const handleEditDrag = useCallback((fragId: string, newStart: number, newEnd: number) => {
    const f = fragments.find(fr => fr.id === fragId)
    if (!f) return
    updateLocalFragment({ ...f, start: newStart, end: newEnd })
  }, [fragments, updateLocalFragment])

  const handleSave = useCallback(async () => {
    if (!editingId) return
    await persistSequence(fragments)
    setEditingId(null)
    savedBoundsRef.current = null
  }, [editingId, fragments, persistSequence])

  // --- Repeat ---

  const incrementRepeat = useCallback(async (fragId: string) => {
    const f = fragments.find(fr => fr.id === fragId)
    if (!f) return
    const updatedAll = fragments.map(fr => fr.id === fragId ? { ...fr, repeat: fr.repeat + 1 } : fr)
    setFragments(updatedAll)
    await persistSequence(updatedAll)
  }, [fragments, persistSequence])

  const decrementRepeat = useCallback(async (fragId: string) => {
    const f = fragments.find(fr => fr.id === fragId)
    if (!f) return
    const updatedAll = fragments.map(fr => fr.id === fragId ? { ...fr, repeat: Math.max(1, fr.repeat - 1) } : fr)
    setFragments(updatedAll)
    await persistSequence(updatedAll)
  }, [fragments, persistSequence])

  // --- Play/Pause ---

  const handlePlayPause = useCallback((f: SequenceFragment) => {
    if (isPlaying && playingFragment?.start === f.start && playingFragment.end === f.end) { pause(); return }
    if (isPaused && playingFragment?.start === f.start && playingFragment.end === f.end) { play(); return }
    const fragment: PlayableFragment = { start: f.start, end: f.end, repeat: f.repeat }
    setPlayingFragment({ start: f.start, end: f.end })
    playFragment(fragment)
  }, [playFragment, pause, play, isPlaying, isPaused, playingFragment])

  // --- Subtitle: Sub button opens file chooser ---

  const handleSubClick = useCallback((fragId: string) => {
    if (subtitleFiles.length === 0) {
      alert("No subtitle files loaded. Upload subtitles on the Fragment Library page.")
      return
    }
    if (subtitleFiles.length === 1) {
      // Only one file — go directly to text selection
      setSubModalFragId(fragId)
      setSubModalFile(subtitleFiles[0])
      setSubModalStep("select-text")
    } else {
      // Multiple files — show chooser
      setSubModalFragId(fragId)
      setSubModalStep("choose-file")
    }
  }, [subtitleFiles])

  const handleSubFileChosen = useCallback((file: SubtitleFile) => {
    setSubModalFile(file)
    setSubModalStep("select-text")
  }, [])

  const handleSubTextSelected = useCallback(async () => {
    if (!subModalFragId || !subModalFile) return

    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      alert("Please select text in the subtitle content.")
      return
    }

    // Find char positions within the subtitle content
    const container = document.getElementById("subtitle-text-container")
    if (!container) return

    const range = sel.getRangeAt(0)
    const preRange = document.createRange()
    preRange.selectNodeContents(container)
    preRange.setEnd(range.startContainer, range.startOffset)
    const charStart = preRange.toString().length

    const charEnd = charStart + range.toString().length

    const newSub: FragmentSubtitle = {
      subtitleFileId: subModalFile.id,
      subtitleFileName: subModalFile.name,
      charStart,
      charEnd,
    }

    const updatedAll = fragments.map(f => {
      if (f.id !== subModalFragId) return f
      return { ...f, subtitles: [...f.subtitles, newSub] }
    })

    setFragments(updatedAll)
    await persistSequence(updatedAll)

    // Close modal
    setSubModalFragId(null)
    setSubModalFile(null)
    sel.removeAllRanges()
  }, [subModalFragId, subModalFile, fragments, persistSequence])

  const handleRemoveSubtitle = useCallback(async (fragId: string, subIdx: number) => {
    const updatedAll = fragments.map(f => {
      if (f.id !== fragId) return f
      const newSubs = f.subtitles.filter((_, i) => i !== subIdx)
      return { ...f, subtitles: newSubs }
    })
    setFragments(updatedAll)
    await persistSequence(updatedAll)
  }, [fragments, persistSequence])

  // --- Waveform fragments ---

  const waveformFragments: WaveformFragment[] =
    fragments.map(f => ({ id: f.id, start: f.start, end: f.end, repeat: f.repeat }))

  return (
    <div style={{ padding: 24 }}>
      <button onClick={() => navigate(`/file/${audioId}/sequences`)}>← Back</button>

      <h2>Fragment Editor {seqId ? "(Edit Sequence)" : "(New Sequence)"}</h2>

      {/* Subtitle prompt overlay */}
      {subPromptMode && (
        <div style={{
          padding: "10px 16px",
          backgroundColor: "#fff3cd",
          border: "1px solid #ffc107",
          borderRadius: 4,
          marginBottom: 12,
          fontSize: 14,
        }}>
          Click on a fragment to attach subtitles. <button onClick={() => { setSubPromptMode(false); setPendingSubFile(null) }}>Cancel</button>
        </div>
      )}

      {!isReady && <p>Loading...</p>}

      {isReady && (
        <>
          <Waveform
            data={waveformData}
            duration={duration}
            fragments={waveformFragments}
            onSelect={addFragment}
            onFragmentClick={handleFragmentClick}
            onClickOutside={handleClickOutside}
            onEditDrag={handleEditDrag}
            editingId={editingId}
            currentTime={currentTime}
            playingFragment={playingFragment}
          />

          <div style={{ marginTop: 20 }}>
            {fragments.map(f => {
              const isEditing = f.id === editingId

              return (
                <div key={f.id}>
                  <div
                    onClick={() => { if (!isEditing) startEditing(f.id) }}
                    style={{
                      border: isEditing ? "1px solid #0078ff" : "1px solid #ccc",
                      backgroundColor: isEditing ? "rgba(0, 120, 255, 0.05)" : "transparent",
                      padding: 8,
                      marginBottom: f.subtitles.length > 0 ? 0 : 8,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      justifyContent: "space-between",
                      cursor: isEditing ? "default" : "pointer",
                    }}
                  >
                    <div>{f.start.toFixed(2)} – {f.end.toFixed(2)}</div>

                    <div style={{ display: "flex", gap: 6, alignItems: "center" }} onClick={e => e.stopPropagation()}>
                      {isEditing && (
                        <button onClick={handleSave} style={{
                          backgroundColor: "#0078ff", color: "white", border: "none",
                          padding: "4px 12px", borderRadius: 4, cursor: "pointer", fontWeight: 500,
                        }}>Save</button>
                      )}

                      <button onClick={() => handleSubClick(f.id)} title="Attach subtitles"
                        style={{ padding: "4px 8px", fontSize: 12 }}>
                        Sub
                      </button>

                      <button onClick={() => handlePlayPause(f)}>
                        {isPlaying && playingFragment?.start === f.start && playingFragment.end === f.end ? "Pause" : "Play"}
                      </button>
                      <button onClick={() => deleteLocalFragment(f.id)}>Delete</button>
                      <button onClick={() => decrementRepeat(f.id)}>-</button>
                      <span>x{f.repeat}</span>
                      <button onClick={() => incrementRepeat(f.id)}>+</button>
                    </div>
                  </div>

                  {/* Show attached subtitles */}
                  {f.subtitles.length > 0 && (
                    <div style={{
                      borderLeft: "1px solid #ccc", borderRight: "1px solid #ccc", borderBottom: "1px solid #ccc",
                      padding: "4px 8px", marginBottom: 8, fontSize: 12, color: "#555",
                    }}>
                      {f.subtitles.map((sub, i) => {
                        const file = subtitleFiles.find(sf => sf.id === sub.subtitleFileId)
                        const text = file ? file.content.slice(sub.charStart, sub.charEnd) : "(file not found)"
                        return (
                          <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start", marginBottom: 2 }}>
                            <span style={{ color: "#888", flexShrink: 0 }}>{sub.subtitleFileName}:</span>
                            <span style={{ whiteSpace: "pre-wrap", flex: 1 }}>{text}</span>
                            <button onClick={() => handleRemoveSubtitle(f.id, i)}
                              style={{ fontSize: 10, padding: "1px 4px", color: "#d32f2f", cursor: "pointer", flexShrink: 0 }}>
                              ×
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Subtitle modal: choose file */}
      {subModalFragId && subModalStep === "choose-file" && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
        }}>
          <div style={{ background: "white", padding: 24, borderRadius: 8, minWidth: 320 }}>
            <h3 style={{ marginTop: 0 }}>Choose subtitle file</h3>
            {subtitleFiles.map(sf => (
              <div key={sf.id} style={{ marginBottom: 8 }}>
                <button onClick={() => handleSubFileChosen(sf)} style={{ cursor: "pointer" }}>
                  {sf.name}
                </button>
              </div>
            ))}
            <button onClick={() => { setSubModalFragId(null); setSubModalFile(null) }}
              style={{ marginTop: 12 }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Subtitle modal: select text */}
      {subModalFragId && subModalStep === "select-text" && subModalFile && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
        }}>
          <div style={{
            background: "white", padding: 24, borderRadius: 8,
            maxWidth: 600, maxHeight: "80vh", display: "flex", flexDirection: "column",
          }}>
            <h3 style={{ marginTop: 0 }}>
              Select subtitle text for fragment
            </h3>
            <p style={{ fontSize: 12, color: "#888", margin: "0 0 12px" }}>
              File: {subModalFile.name} — Highlight the relevant text, then click "Attach Selected"
            </p>
            <div
              id="subtitle-text-container"
              style={{
                flex: 1, overflow: "auto", border: "1px solid #ccc", padding: 12,
                fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap", userSelect: "text",
                cursor: "text",
              }}
            >
              {subModalFile.content}
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 16, justifyContent: "flex-end" }}>
              <button onClick={() => { setSubModalFragId(null); setSubModalFile(null) }}>
                Cancel
              </button>
              <button onClick={handleSubTextSelected} style={{
                backgroundColor: "#0078ff", color: "white", border: "none",
                padding: "6px 16px", borderRadius: 4, cursor: "pointer",
              }}>
                Attach Selected
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}