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
  } = useAudioEngine(getBlob)

  const [waveformData, setWaveformData] = useState<number[]>([])
  const [fragments, setFragments] = useState<LocalFragment[]>([])
  const [selectedFragmentId, setSelectedFragmentId] = useState<string | null>(null)

  // ===== Load audio =====
  useEffect(() => {
    if (!id) return

    const load = async () => {
      await loadById(id)

      const blob = await getBlob(id)
      if (!blob) return

      const arrayBuffer = await blob.arrayBuffer()
      const audioContext = new AudioContext()
      const buffer = await audioContext.decodeAudioData(arrayBuffer)

      const wf = buildWaveform(buffer, 1000)
      setWaveformData(wf)

      await audioContext.close()
    }

    load()
  }, [id])

  // ===== Handle selection =====
  const handleSelect = useCallback(
    (start: number, end: number) => {
      const newFragment: LocalFragment = {
        id: nanoid(),
        start,
        end,
        repeat: 1,
      }

      setFragments((prev) => [...prev, newFragment])
    },
    []
  )

  // ===== Play selected fragment =====
  const handlePlayFragment = useCallback(() => {
    if (!selectedFragmentId) return

    const fragment = fragments.find(f => f.id === selectedFragmentId)
    if (!fragment) return

    const engineFragment: Fragment = {
      start: fragment.start,
      end: fragment.end,
      repeat: fragment.repeat,
    }

    playFragment(engineFragment)
  }, [selectedFragmentId, fragments, playFragment])

  // ===== Delete fragment =====
  const handleDeleteFragment = (id: string) => {
    setFragments(prev => prev.filter(f => f.id !== id))
    if (selectedFragmentId === id) {
      setSelectedFragmentId(null)
      stop()
    }
  }

  // ===== Convert for waveform overlay =====
  const waveformFragments: WaveformFragment[] = fragments.map(f => ({
    id: f.id,
    start: f.start,
    end: f.end,
  }))

  return (
    <div style={{ padding: 24 }}>
      <button onClick={() => navigate("/")}>
        ← Back to Library
      </button>

      <h2 style={{ marginTop: 16 }}>Fragment Editor</h2>

      {!isReady && <p>Loading audio...</p>}

      {isReady && (
        <>
          <p>Duration: {duration.toFixed(2)} sec</p>

          <Waveform
            data={waveformData}
            duration={duration}
            fragments={waveformFragments}
            onSelect={handleSelect}
          />

          <div style={{ marginTop: 24 }}>
            <h3>Fragments</h3>

            {fragments.length === 0 && (
              <p>No fragments yet. Drag on waveform to create one.</p>
            )}

            {fragments.map((f) => (
              <div
                key={f.id}
                style={{
                  padding: 8,
                  marginBottom: 8,
                  border: "1px solid #ccc",
                  background:
                    selectedFragmentId === f.id
                      ? "#eef"
                      : "#fff",
                  cursor: "pointer",
                }}
                onClick={() => setSelectedFragmentId(f.id)}
              >
                <div>
                  {f.start.toFixed(2)} — {f.end.toFixed(2)} sec
                </div>

                <div style={{ marginTop: 4 }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedFragmentId(f.id)
                      handlePlayFragment()
                    }}
                  >
                    Play
                  </button>

                  <button
                    style={{ marginLeft: 8 }}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDeleteFragment(f.id)
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}