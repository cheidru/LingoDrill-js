// рендерит waveform через <canvas>
// поддерживает drag-selection (мышь)
// отображает текущую выделенную область
// конвертирует пиксели → секунды
// позволяет прокинуть сохранённые фрагменты
// не содержит бизнес-логики (чистый UI) 
// ✔ Рисует waveform Используя RMS значения 0..1.
// ✔ Отображает сохранённые фрагменты - Передаются через fragments.
// ✔ Позволяет выделить новый фрагмент мышью

// app/components/Waveform.tsx
import { useRef, useEffect, useState, useCallback } from "react"
import type { MouseEvent } from "react"

export type WaveformFragment = {
  id: string
  start: number
  end: number
  repeat?: number
}

type Props = {
  data: number[]
  duration: number
  height?: number
  fragments?: WaveformFragment[]
  onSelect?: (start: number, end: number) => void
  onEdit?: (id: string, newStart: number, newEnd: number) => void
  currentTime?: number
  playingFragment?: { start: number; end: number } | null
}

export function Waveform({
  data,
  duration,
  height = 200,
  fragments = [],
  onSelect,
  onEdit,
  currentTime,
  playingFragment,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [selection, setSelection] = useState<{ startX: number; endX: number; active: boolean } | null>(null)
  const [dragging, setDragging] = useState<{ id: string; side: "start" | "end" } | null>(null)

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
      ctx.fillRect(i * barWidth, (h - barHeight) / 2, barWidth, barHeight)
    })

    // Draw saved fragments
    fragments.forEach(f => {
      const startX = (f.start / duration) * width
      const endX = (f.end / duration) * width
      ctx.fillStyle = "rgba(255,165,0,0.3)"
      ctx.fillRect(startX, 0, endX - startX, h)

      // Draw handles
      ctx.fillStyle = "rgba(255,165,0,0.8)"
      ctx.fillRect(startX - 2, 0, 4, h)
      ctx.fillRect(endX - 2, 0, 4, h)

      // Draw repeat count
      if (f.repeat && f.repeat > 1) {
        ctx.fillStyle = "black"
        ctx.font = "12px sans-serif"
        ctx.fillText(`x${f.repeat}`, endX + 4, 12)
      }
    })

    // Playback progress
    if (playingFragment && currentTime !== undefined) {
      const { start, end } = playingFragment
      const clampedTime = Math.min(Math.max(currentTime, start), end)
      if (clampedTime > start) {
        const startX = (start / duration) * width
        const endX = (end / duration) * width
        const progress = (clampedTime - start) / (end - start)
        const progressX = startX + (endX - startX) * progress
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

  useEffect(() => { draw() }, [draw])

  const getSeconds = (x: number, width: number) => (Math.max(0, Math.min(x, width)) / width) * duration

  const getFragmentUnderPointer = (x: number, width: number) => {
    for (const f of fragments) {
      const startX = (f.start / duration) * width
      const endX = (f.end / duration) * width
      if (Math.abs(x - startX) < 5) return { id: f.id, side: "start" as const }
      if (Math.abs(x - endX) < 5) return { id: f.id, side: "end" as const }
    }
    return null
  }

  const handleMouseDown = (e: MouseEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left

    const width = canvas.width
    const fragDrag = getFragmentUnderPointer(x, width)
    if (fragDrag) {
      setDragging(fragDrag)
      return
    }

    setSelection({ startX: x, endX: x, active: true })
  }

  const handleMouseMove = (e: MouseEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left

    const width = canvas.width

    if (dragging) {
      const f = fragments.find(f => f.id === dragging.id)
      if (!f || !onEdit) return
      const newTime = getSeconds(x, width)
      if (dragging.side === "start" && newTime < f.end) onEdit(f.id, newTime, f.end)
      if (dragging.side === "end" && newTime > f.start) onEdit(f.id, f.start, newTime)
      return
    }

    if (!selection?.active) return
    setSelection(prev => prev ? { ...prev, endX: x } : null)
  }

  const handleMouseUp = () => {
    if (!selection) return
    const canvas = canvasRef.current
    if (!canvas) return
    const width = canvas.width
    const start = getSeconds(selection.startX, width)
    const end = getSeconds(selection.endX, width)
    setSelection(null)
    if (onSelect && Math.abs(end - start) > 0.05) onSelect(Math.min(start, end), Math.max(start, end))
    setDragging(null)
  }

  return (
    <canvas
      ref={canvasRef}
      width={1000}
      height={height}
      style={{ width: "100%", height, border: "1px solid #ccc", cursor: "crosshair" }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => { setSelection(null); setDragging(null) }}
    />
  )
}