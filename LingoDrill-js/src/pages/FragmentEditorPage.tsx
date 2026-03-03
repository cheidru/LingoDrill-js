// pages/FragmentEditorPage.tsx

import { useEffect, useState, useCallback } from "react"
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

  // Фрагменты теперь персистентны через IndexedDB
  const {
    fragments,
    addFragment,
    deleteFragment,
    updateFragment,
  } = useFragments(id ?? null)

  const [waveformData, setWaveformData] = useState<number[]>([])
  const [playingFragment, setPlayingFragment] =
    useState<{ start: number; end: number } | null>(null)

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

  // добавление нового фрагмента через waveform selection
  const handleSelect = useCallback((start: number, end: number) => {
    addFragment(start, end)
  }, [addFragment])

  // удаление фрагмента
  const handleDelete = useCallback((fragId: string) => {
    deleteFragment(fragId)
    stop()
    setPlayingFragment(null)
  }, [deleteFragment, stop])

  // изменение repeat
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

  // редактирование границ фрагмента (drag на waveform)
  const handleEdit = useCallback((fragId: string, newStart: number, newEnd: number) => {
    const f = fragments.find(fr => fr.id === fragId)
    if (!f) return
    updateFragment({ ...f, start: newStart, end: newEnd })
  }, [fragments, updateFragment])

  const handlePlayPause = useCallback((f: typeof fragments[number]) => {
    // Если этот фрагмент уже играет — ставим паузу
    if (
      isPlaying &&
      playingFragment?.start === f.start &&
      playingFragment.end === f.end
    ) {
      pause()
      return
    }

    // Если этот фрагмент на паузе — возобновляем (доигрывает текущий повтор + оставшиеся)
    if (
      isPaused &&
      playingFragment?.start === f.start &&
      playingFragment.end === f.end
    ) {
      play()
      return
    }

    // Иначе — запускаем фрагмент заново (новый фрагмент или все повторы завершились)
    const fragment: PlayableFragment = {
      start: f.start,
      end: f.end,
      repeat: f.repeat,
    }

    setPlayingFragment({ start: f.start, end: f.end })
    playFragment(fragment)
  }, [playFragment, pause, play, isPlaying, isPaused, playingFragment])

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
            onEdit={handleEdit}
            currentTime={currentTime}
            playingFragment={playingFragment}
          />

          <div style={{ marginTop: 20 }}>
            {fragments.map(f => (
              <div
                key={f.id}
                style={{
                  border: "1px solid #ccc",
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
            ))}
          </div>
        </>
      )}
    </div>
  )
}