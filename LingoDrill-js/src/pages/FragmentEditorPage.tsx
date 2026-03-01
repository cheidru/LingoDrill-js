import { useEffect, useState } from "react"
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

  const handleSelect = (start: number, end: number) => {
    setFragments((prev) => [
      ...prev,
      { id: nanoid(), start, end, repeat: 1 },
    ])
  }

  const handlePlay = (f: LocalFragment) => {
    const fragment: Fragment = {
      start: f.start,
      end: f.end,
      repeat: f.repeat,
    }

    setPlayingFragment({ start: f.start, end: f.end })
    playFragment(fragment)
  }

  const handleDelete = (id: string) => {
    setFragments((prev) => prev.filter((f) => f.id !== id))
    stop()
    setPlayingFragment(null)
  }

  const waveformFragments: WaveformFragment[] =
    fragments.map((f) => ({
      id: f.id,
      start: f.start,
      end: f.end,
    }))

  return (
    <div style={{ padding: 24 }}>
      <button onClick={() => navigate("/")}>
        ← Back
      </button>

      <h2>Fragment Editor</h2>

      {!isReady && <p>Loading...</p>}

      {isReady && (
        <>
          <Waveform
            data={waveformData}
            duration={duration}
            fragments={waveformFragments}
            onSelect={handleSelect}
            currentTime={currentTime}
            playingFragment={playingFragment}
          />

          <div style={{ marginTop: 20 }}>
            {fragments.map((f) => (
              <div
                key={f.id}
                style={{
                  border: "1px solid #ccc",
                  padding: 8,
                  marginBottom: 8,
                }}
              >
                {f.start.toFixed(2)} – {f.end.toFixed(2)}

                <button
                  style={{ marginLeft: 10 }}
                  onClick={() => handlePlay(f)}
                >
                  Play
                </button>

                <button
                  style={{ marginLeft: 6 }}
                  onClick={() => handleDelete(f.id)}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}