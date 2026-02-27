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
  data: number[]            // RMS массив 0..1
  duration: number          // длительность аудио в секундах
  height?: number
  fragments?: WaveformFragment[]  // уже сохранённые фрагменты
  onSelect?: (start: number, end: number) => void
}

export function Waveform({
  data,
  duration,
  height = 200,
  fragments = [],
  onSelect,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const [selection, setSelection] = useState<{
    startX: number
    endX: number
    active: boolean
  } | null>(null)

  const getSecondsFromX = useCallback(
    (x: number, width: number) => {
      const clamped = Math.max(0, Math.min(x, width))
      return (clamped / width) * duration
    },
    [duration]
  )

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const width = canvas.width
    const h = canvas.height

    ctx.clearRect(0, 0, width, h)

    // ===== Waveform =====
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

    // ===== Saved fragments overlay =====
    ctx.fillStyle = "rgba(255, 165, 0, 0.3)"

    fragments.forEach((f) => {
      const startX = (f.start / duration) * width
      const endX = (f.end / duration) * width
      ctx.fillRect(startX, 0, endX - startX, h)
    })

    // ===== Active selection =====
    if (selection) {
      const { startX, endX } = selection
      const left = Math.min(startX, endX)
      const right = Math.max(startX, endX)

      ctx.fillStyle = "rgba(0, 255, 0, 0.3)"
      ctx.fillRect(left, 0, right - left, h)
    }
  }, [data, fragments, selection, duration])

  useEffect(() => {
    draw()
  }, [draw])

  // ===== Mouse Handlers =====

  const handleMouseDown = (e: MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left

    setSelection({
      startX: x,
      endX: x,
      active: true,
    })
  }

  const handleMouseMove = (e: MouseEvent<HTMLCanvasElement>) => {
    if (!selection?.active) return

    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left

    setSelection((prev) =>
      prev
        ? { ...prev, endX: x }
        : null
    )
  }

  const handleMouseUp = () => {
    if (!selection) return

    const canvas = canvasRef.current
    if (!canvas) return

    const width = canvas.width

    const startSec = getSecondsFromX(selection.startX, width)
    const endSec = getSecondsFromX(selection.endX, width)

    const start = Math.min(startSec, endSec)
    const end = Math.max(startSec, endSec)

    setSelection(null)

    if (onSelect && Math.abs(end - start) > 0.05) {
      onSelect(start, end)
    }
  }

  return (
    <div style={{ width: "100%" }}>
      <canvas
        ref={canvasRef}
        width={1000}
        height={height}
        style={{
          width: "100%",
          height,
          cursor: "crosshair",
          border: "1px solid #ccc",
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() =>
          setSelection(null)
        }
      />
    </div>
  )
}