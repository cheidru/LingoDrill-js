// components/Waveform.tsx

// рендерит waveform через <canvas>
// поддерживает drag-selection (мышь)
// отображает текущую выделенную область
// конвертирует пиксели → секунды
// позволяет прокинуть сохранённые фрагменты
// не содержит бизнес-логики (чистый UI) 
// ✔ Рисует waveform Используя RMS значения 0..1.
// ✔ Отображает сохранённые фрагменты - Передаются через fragments.
// ✔ Позволяет выделить новый фрагмент мышью

import { useRef, useEffect, useState, useCallback } from "react"
import type { MouseEvent } from "react"

export type WaveformFragment = {
  id: string
  start: number
  end: number
}

type Props = {
  data: number[]
  duration: number
  height?: number
  fragments?: WaveformFragment[]
  onSelect?: (start: number, end: number) => void
  currentTime?: number
  playingFragment?: { start: number; end: number } | null
}

export function Waveform({
  data,
  duration,
  height = 200,
  fragments = [],
  onSelect,
  currentTime,
  playingFragment,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const [selection, setSelection] = useState<{
    startX: number
    endX: number
    active: boolean
  } | null>(null)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const width = canvas.width
    const h = canvas.height

    ctx.clearRect(0, 0, width, h)

    if (!data.length || !duration) return

    const barWidth = width / data.length
    ctx.fillStyle = "#4a90e2"

    data.forEach((value, i) => {
      const barHeight = value * h
      ctx.fillRect(
        i * barWidth,
        (h - barHeight) / 2,
        barWidth,
        barHeight
      )
    })

    // Saved fragments
    ctx.fillStyle = "rgba(255,165,0,0.3)"
    fragments.forEach((f) => {
      const startX = (f.start / duration) * width
      const endX = (f.end / duration) * width
      ctx.fillRect(startX, 0, endX - startX, h)
    })

    // Playback progress
    if (playingFragment && currentTime !== undefined) {
      const { start, end } = playingFragment

      const clampedTime = Math.min(
        Math.max(currentTime, start),
        end
      )

      if (clampedTime > start) {
        const startX = (start / duration) * width
        const endX = (end / duration) * width

        const progress =
          (clampedTime - start) / (end - start)

        const progressX =
          startX + (endX - startX) * progress

        ctx.fillStyle = "rgba(0,200,0,0.5)"
        ctx.fillRect(startX, 0, progressX - startX, h)
      }
    }

    // Selection
    if (selection) {
      const { startX, endX } = selection
      const left = Math.min(startX, endX)
      const right = Math.max(startX, endX)

      ctx.fillStyle = "rgba(0,255,0,0.3)"
      ctx.fillRect(left, 0, right - left, h)
    }
  }, [data, fragments, selection, duration, currentTime, playingFragment])

  useEffect(() => {
    draw()
  }, [draw])

  const getSeconds = (x: number, width: number) =>
    (Math.max(0, Math.min(x, width)) / width) * duration

  const handleMouseDown = (e: MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    setSelection({ startX: x, endX: x, active: true })
  }

  const handleMouseMove = (e: MouseEvent<HTMLCanvasElement>) => {
    if (!selection?.active) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    setSelection((prev) =>
      prev ? { ...prev, endX: x } : null
    )
  }

  const handleMouseUp = () => {
    if (!selection) return
    const canvas = canvasRef.current
    if (!canvas) return

    const width = canvas.width
    const start = getSeconds(selection.startX, width)
    const end = getSeconds(selection.endX, width)

    setSelection(null)

    if (onSelect && Math.abs(end - start) > 0.05) {
      onSelect(Math.min(start, end), Math.max(start, end))
    }
  }

  return (
    <canvas
      ref={canvasRef}
      width={1000}
      height={height}
      style={{
        width: "100%",
        height,
        border: "1px solid #ccc",
        cursor: "crosshair",
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => setSelection(null)}
    />
  )
}