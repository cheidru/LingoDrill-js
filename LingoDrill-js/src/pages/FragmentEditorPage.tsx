// pages/FragmentEditorPage.tsx

import { useEffect, useState, useCallback } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useAudioLibrary } from "../app/hooks/useAudioLibrary"
import { useAudioEngine } from "../app/hooks/useAudioEngine"
import { Waveform } from "../app/components/Waveform"
import type { WaveformFragment } from "../app/components/Waveform"
import { buildWaveform } from "../utils/buildWaveform"
import type { Fragment } from "../core/audio/audioEngine"
import { nanoid } from "nanoid"

type LocalFragment = {
  id: string
  start: number
  end: number
  repeat: number
}

export function FragmentEditorPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { getBlob } = useAudioLibrary()
  const {
    loadById,
    playFragment,
    stop,
    isReady,
    duration,
    currentTime,
  } = useAudioEngine(getBlob)

  const [waveformData, setWaveformData] = useState<number[]>([])
  const [fragments, setFragments] = useState<LocalFragment[]>([])
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

  // добавление нового фрагмента
  const addFragment = useCallback((start: number, end: number) => {
    setFragments(prev => [
      ...prev,
      { id: nanoid(), start, end, repeat: 1 },
    ])
  }, [])

  // редактирование существующего фрагмента (start/end)
  const updateFragment = useCallback((updated: LocalFragment) => {
    setFragments(prev =>
      prev.map(f => (f.id === updated.id ? updated : f))
    )
  }, [])

  // удаление фрагмента
  const deleteFragment = useCallback((id: string) => {
    setFragments(prev => prev.filter(f => f.id !== id))
    stop()
    setPlayingFragment(null)
  }, [stop])

  // изменение repeat (клик по счетчику)
  const incrementRepeat = useCallback((id: string) => {
    setFragments(prev =>
      prev.map(f =>
        f.id === id ? { ...f, repeat: f.repeat + 1 } : f
      )
    )
  }, [])

  const decrementRepeat = useCallback((id: string) => {
    setFragments(prev =>
      prev.map(f =>
        f.id === id
          ? { ...f, repeat: Math.max(1, f.repeat - 1) }
          : f
      )
    )
  }, [])

  const handlePlay = useCallback((f: LocalFragment) => {
    const fragment: Fragment = {
      start: f.start,
      end: f.end,
      repeat: f.repeat,
    }

    setPlayingFragment({ start: f.start, end: f.end })
    playFragment(fragment)
  }, [playFragment])

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
            onSelect={addFragment}
            onEdit={(id, newStart, newEnd) => {
              const f = fragments.find(f => f.id === id)
              if (!f) return
              updateFragment({ ...f, start: newStart, end: newEnd })
            }}
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
                  <button onClick={() => handlePlay(f)}>
                    {playingFragment?.start === f.start &&
                    playingFragment.end === f.end
                      ? "Pause"
                      : "Play"}
                  </button>

                  <button onClick={() => deleteFragment(f.id)}>
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