// pages/FragmentEditorPage.tsx

import { useEffect, useState, useCallback, useRef } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useAudioLibrary } from "../app/hooks/useAudioLibrary"
import { useAudioEngine } from "../app/hooks/useAudioEngine"
import { useFragments } from "../app/hooks/useFragments"
import { Waveform } from "../app/components/Waveform"
import type { WaveformFragment } from "../app/components/Waveform"
import { buildWaveform } from "../utils/buildWaveform"
import type { PlayableFragment } from "../core/audio/audioEngine"

export function FragmentEditorPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { getBlob } = useAudioLibrary()
  const {
    loadById,
    playFragment,
    pause,
    play,
    stop,
    isReady,
    isPlaying,
    isPaused,
    duration,
    currentTime,
  } = useAudioEngine(getBlob)

  // Фрагменты — персистентны через IndexedDB
  const {
    fragments,
    addFragment,
    deleteFragment,
    updateFragment,
  } = useFragments(id ?? null)

  const [waveformData, setWaveformData] = useState<number[]>([])
  const [playingFragment, setPlayingFragment] =
    useState<{ start: number; end: number } | null>(null)

  // --- Editing state ---
  const [editingId, setEditingId] = useState<string | null>(null)
  // Сохранённые границы (до начала редактирования) для отмены
  const savedBoundsRef = useRef<{ start: number; end: number } | null>(null)

  // загрузка аудио и построение waveform
  useEffect(() => {
    if (!id) return

    const load = async () => {
      await loadById(id)
      const blob = await getBlob(id)
      if (!blob) return

      const buffer = await blob.arrayBuffer()
      const ctx = new AudioContext()
      const audioBuffer = await ctx.decodeAudioData(buffer)
      setWaveformData(buildWaveform(audioBuffer, 1000))
      await ctx.close()
    }

    load()
  }, [id, getBlob, loadById])

  // --- Editing handlers ---

  const handleFragmentClick = useCallback((fragId: string) => {
    // Если уже редактируем другой — отменяем его (возвращаем к сохранённым границам)
    if (editingId && editingId !== fragId) {
      savedBoundsRef.current = null
    }

    const f = fragments.find(fr => fr.id === fragId)
    if (!f) return

    setEditingId(fragId)
    savedBoundsRef.current = { start: f.start, end: f.end }
  }, [editingId, fragments])

  const handleClickOutside = useCallback(() => {
    if (!editingId) return
    // Revert to saved bounds
    if (savedBoundsRef.current) {
      const f = fragments.find(fr => fr.id === editingId)
      if (f) {
        updateFragment({ ...f, start: savedBoundsRef.current.start, end: savedBoundsRef.current.end })
      }
    }
    setEditingId(null)
    savedBoundsRef.current = null
  }, [editingId, fragments, updateFragment])

  const handleEditDrag = useCallback((fragId: string, newStart: number, newEnd: number) => {
    const f = fragments.find(fr => fr.id === fragId)
    if (!f) return
    updateFragment({ ...f, start: newStart, end: newEnd })
  }, [fragments, updateFragment])

  const handleSave = useCallback(() => {
    setEditingId(null)
    savedBoundsRef.current = null
  }, [])

  // --- Fragment list handlers ---

  const handleSelect = useCallback((start: number, end: number) => {
    // При создании нового фрагмента — снимаем редактирование
    if (editingId) {
      handleClickOutside()
    }
    addFragment(start, end)
  }, [addFragment, editingId, handleClickOutside])

  const handleDelete = useCallback((fragId: string) => {
    if (editingId === fragId) {
      setEditingId(null)
      savedBoundsRef.current = null
    }
    deleteFragment(fragId)
    stop()
    setPlayingFragment(null)
  }, [deleteFragment, stop, editingId])

  const incrementRepeat = useCallback((fragId: string) => {
    const f = fragments.find(fr => fr.id === fragId)
    if (!f) return
    updateFragment({ ...f, repeat: f.repeat + 1 })
  }, [fragments, updateFragment])

  const decrementRepeat = useCallback((fragId: string) => {
    const f = fragments.find(fr => fr.id === fragId)
    if (!f) return
    updateFragment({ ...f, repeat: Math.max(1, f.repeat - 1) })
  }, [fragments, updateFragment])

  const handlePlayPause = useCallback((f: typeof fragments[number]) => {
    if (
      isPlaying &&
      playingFragment?.start === f.start &&
      playingFragment.end === f.end
    ) {
      pause()
      return
    }

    if (
      isPaused &&
      playingFragment?.start === f.start &&
      playingFragment.end === f.end
    ) {
      play()
      return
    }

    const fragment: PlayableFragment = {
      start: f.start,
      end: f.end,
      repeat: f.repeat,
    }

    setPlayingFragment({ start: f.start, end: f.end })
    playFragment(fragment)
  }, [playFragment, pause, play, isPlaying, isPaused, playingFragment])

  // --- Build waveform fragments ---

  const waveformFragments: WaveformFragment[] =
    fragments.map(f => ({
      id: f.id,
      start: f.start,
      end: f.end,
      repeat: f.repeat,
    }))

  return (
    <div style={{ padding: 24 }}>
      <button onClick={() => navigate("/")}>← Back</button>

      <h2>Fragment Editor</h2>

      {!isReady && <p>Loading...</p>}

      {isReady && (
        <>
          <Waveform
            data={waveformData}
            duration={duration}
            fragments={waveformFragments}
            onSelect={handleSelect}
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
                <div
                  key={f.id}
                  style={{
                    border: isEditing ? "1px solid #0078ff" : "1px solid #ccc",
                    backgroundColor: isEditing ? "rgba(0, 120, 255, 0.05)" : "transparent",
                    padding: 8,
                    marginBottom: 8,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    {f.start.toFixed(2)} – {f.end.toFixed(2)}
                  </div>

                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {isEditing && (
                      <button
                        onClick={() => handleSave()}
                        style={{
                          backgroundColor: "#0078ff",
                          color: "white",
                          border: "none",
                          padding: "4px 12px",
                          borderRadius: 4,
                          cursor: "pointer",
                          fontWeight: 500,
                        }}
                      >
                        Save
                      </button>
                    )}

                    <button onClick={() => handlePlayPause(f)}>
                      {isPlaying &&
                      playingFragment?.start === f.start &&
                      playingFragment.end === f.end
                        ? "Pause"
                        : "Play"}
                    </button>

                    <button onClick={() => handleDelete(f.id)}>
                      Delete
                    </button>

                    <button onClick={() => decrementRepeat(f.id)}>
                      -
                    </button>
                    <span>x{f.repeat}</span>
                    <button onClick={() => incrementRepeat(f.id)}>+</button>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}