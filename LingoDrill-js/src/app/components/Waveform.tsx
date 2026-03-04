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
import type { MouseEvent, WheelEvent, TouchEvent } from "react"

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
  /** Вызывается при выделении нового фрагмента (drag на пустом месте) */
  onSelect?: (start: number, end: number) => void
  /** Вызывается при клике на фрагмент — переводит его в режим редактирования */
  onFragmentClick?: (id: string) => void
  /** Вызывается при клике вне фрагментов — снимает выделение */
  onClickOutside?: () => void
  /** Вызывается при перетаскивании границ выделенного фрагмента (только для editingId) */
  onEditDrag?: (id: string, newStart: number, newEnd: number) => void
  /** id фрагмента в режиме редактирования (или null) */
  editingId?: string | null
  currentTime?: number
  playingFragment?: { start: number; end: number } | null
}

const HANDLE_RADIUS = 6
const HANDLE_HIT_AREA = 10
const MIN_ZOOM = 1
const MAX_ZOOM = 50

export function Waveform({
  data,
  duration,
  height = 200,
  fragments = [],
  onSelect,
  onFragmentClick,
  onClickOutside,
  onEditDrag,
  editingId = null,
  currentTime,
  playingFragment,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  // Zoom & scroll state
  const [zoom, setZoom] = useState(1)          // 1 = full view
  const [scrollOffset, setScrollOffset] = useState(0) // 0..1 — left edge in normalized coords

  // Selection (new fragment)
  const [selection, setSelection] = useState<{ startX: number; endX: number } | null>(null)
  const [isSelecting, setIsSelecting] = useState(false)

  // Dragging handle of editing fragment
  const [dragging, setDragging] = useState<{ id: string; side: "start" | "end" } | null>(null)

  // Cursor
  const [cursor, setCursor] = useState("crosshair")

  // Pinch zoom state
  const lastPinchDist = useRef<number | null>(null)

  // --- Coordinate helpers ---

  /** Visible window: [visibleStart, visibleEnd] in seconds */
  const visibleStart = scrollOffset * duration
  const visibleEnd = Math.min((scrollOffset + 1 / zoom) * duration, duration)
  const visibleDuration = visibleEnd - visibleStart

  const getCanvasWidth = () => canvasRef.current?.width ?? 1000

  /** Convert canvas-pixel x to seconds (accounting for zoom/scroll) */
  const pxToSeconds = useCallback((x: number) => {
    const w = getCanvasWidth()
    const frac = Math.max(0, Math.min(x, w)) / w
    return visibleStart + frac * visibleDuration
  }, [visibleStart, visibleDuration])

  /** Convert seconds to canvas-pixel x */
  const secondsToPx = useCallback((sec: number) => {
    const w = getCanvasWidth()
    return ((sec - visibleStart) / visibleDuration) * w
  }, [visibleStart, visibleDuration])

  // --- Drawing ---

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const width = canvas.width
    const h = canvas.height
    ctx.clearRect(0, 0, width, h)

    if (!data.length || !duration) return

    // Draw waveform bars (only visible portion)
    const totalBars = data.length
    const firstBar = Math.floor((visibleStart / duration) * totalBars)
    const lastBar = Math.ceil((visibleEnd / duration) * totalBars)
    const barsInView = lastBar - firstBar

    if (barsInView <= 0) return

    const barWidth = width / barsInView
    ctx.fillStyle = "#4a90e2"
    for (let i = firstBar; i < lastBar && i < totalBars; i++) {
      const value = data[i]
      const barHeight = value * h
      const x = (i - firstBar) * barWidth
      ctx.fillRect(x, (h - barHeight) / 2, Math.max(barWidth - 0.5, 0.5), barHeight)
    }

    // Draw fragments
    fragments.forEach(f => {
      const startX = secondsToPx(f.start)
      const endX = secondsToPx(f.end)

      // Skip if fully outside visible area
      if (endX < 0 || startX > width) return

      const isEditing = f.id === editingId

      // Fill
      ctx.fillStyle = isEditing
        ? "rgba(0, 150, 255, 0.3)"
        : "rgba(255, 165, 0, 0.2)"
      ctx.fillRect(startX, 0, endX - startX, h)

      // Border lines (1px)
      ctx.strokeStyle = isEditing
        ? "rgba(0, 150, 255, 0.8)"
        : "rgba(255, 165, 0, 0.6)"
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(startX, 0); ctx.lineTo(startX, h)
      ctx.moveTo(endX, 0); ctx.lineTo(endX, h)
      ctx.stroke()

      // Draw handles for editing fragment
      if (isEditing) {
        const handleY = h / 2
        ;[startX, endX].forEach(hx => {
          ctx.beginPath()
          ctx.arc(hx, handleY, HANDLE_RADIUS, 0, Math.PI * 2)
          ctx.fillStyle = "rgba(0, 120, 255, 0.9)"
          ctx.fill()
          ctx.strokeStyle = "#fff"
          ctx.lineWidth = 2
          ctx.stroke()
        })
      }

      // Draw repeat count
      if (f.repeat && f.repeat > 1) {
        ctx.fillStyle = isEditing ? "#0078ff" : "#333"
        ctx.font = "11px sans-serif"
        ctx.fillText(`×${f.repeat}`, endX + 4, 14)
      }
    })

    // Playback progress
    if (playingFragment && currentTime !== undefined) {
      const { start, end } = playingFragment
      const clampedTime = Math.min(Math.max(currentTime, start), end)
      if (clampedTime > start) {
        const sX = secondsToPx(start)
        const eX = secondsToPx(end)
        const progress = (clampedTime - start) / (end - start)
        const progressX = sX + (eX - sX) * progress
        ctx.fillStyle = "rgba(0, 200, 0, 0.4)"
        ctx.fillRect(sX, 0, progressX - sX, h)
      }
    }

    // Selection (new fragment being drawn)
    if (selection) {
      const left = Math.min(selection.startX, selection.endX)
      const right = Math.max(selection.startX, selection.endX)
      ctx.fillStyle = "rgba(0, 255, 0, 0.25)"
      ctx.fillRect(left, 0, right - left, h)
      ctx.strokeStyle = "rgba(0, 200, 0, 0.7)"
      ctx.lineWidth = 1
      ctx.strokeRect(left, 0, right - left, h)
    }
  }, [data, fragments, selection, duration, currentTime, playingFragment, editingId, visibleStart, visibleEnd, secondsToPx])

  useEffect(() => { draw() }, [draw])

  // --- Hit detection ---

  /** Check if x is near a handle of the editing fragment */
  const getEditingHandleUnderPointer = useCallback((x: number): "start" | "end" | null => {
    if (!editingId) return null
    const f = fragments.find(fr => fr.id === editingId)
    if (!f) return null
    const startX = secondsToPx(f.start)
    const endX = secondsToPx(f.end)
    if (Math.abs(x - startX) <= HANDLE_HIT_AREA) return "start"
    if (Math.abs(x - endX) <= HANDLE_HIT_AREA) return "end"
    return null
  }, [editingId, fragments, secondsToPx])

  /** Check if x falls inside any fragment */
  const getFragmentUnderPointer = useCallback((x: number): string | null => {
    // Check in reverse order so topmost drawn fragment wins
    for (let i = fragments.length - 1; i >= 0; i--) {
      const f = fragments[i]
      const startX = secondsToPx(f.start)
      const endX = secondsToPx(f.end)
      if (x >= startX && x <= endX) return f.id
    }
    return null
  }, [fragments, secondsToPx])

  // --- Mouse event helpers ---

  const getCanvasX = (e: MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const scaleX = e.currentTarget.width / rect.width
    return (e.clientX - rect.left) * scaleX
  }

  // --- Mouse events ---

  const handleMouseDown = (e: MouseEvent<HTMLCanvasElement>) => {
    const x = getCanvasX(e)

    // 1) If editing — check handles first
    if (editingId) {
      const side = getEditingHandleUnderPointer(x)
      if (side) {
        setDragging({ id: editingId, side })
        return
      }
    }

    // 2) Check if clicked inside a fragment
    const fragId = getFragmentUnderPointer(x)
    if (fragId) {
      if (fragId !== editingId) {
        onFragmentClick?.(fragId)
      }
      return
    }

    // 3) Clicked on empty space
    if (editingId) {
      onClickOutside?.()
      return
    }

    // 4) Start new selection
    setIsSelecting(true)
    setSelection({ startX: x, endX: x })
  }

  const handleMouseMove = (e: MouseEvent<HTMLCanvasElement>) => {
    const x = getCanvasX(e)

    // Update cursor
    if (editingId) {
      const side = getEditingHandleUnderPointer(x)
      if (side) {
        setCursor("ew-resize")
      } else {
        const fragId = getFragmentUnderPointer(x)
        setCursor(fragId ? "pointer" : "crosshair")
      }
    } else {
      const fragId = getFragmentUnderPointer(x)
      setCursor(fragId ? "pointer" : "crosshair")
    }

    // Dragging handle
    if (dragging) {
      const f = fragments.find(fr => fr.id === dragging.id)
      if (!f || !onEditDrag) return
      const newTime = pxToSeconds(x)
      if (dragging.side === "start" && newTime < f.end) {
        onEditDrag(f.id, newTime, f.end)
      }
      if (dragging.side === "end" && newTime > f.start) {
        onEditDrag(f.id, f.start, newTime)
      }
      return
    }

    // Drawing selection
    if (isSelecting && selection) {
      setSelection(prev => prev ? { ...prev, endX: x } : null)
    }
  }

  const handleMouseUp = () => {
    if (dragging) {
      setDragging(null)
      return
    }

    if (isSelecting && selection) {
      const start = pxToSeconds(selection.startX)
      const end = pxToSeconds(selection.endX)
      setSelection(null)
      setIsSelecting(false)
      if (onSelect && Math.abs(end - start) > 0.05) {
        onSelect(Math.min(start, end), Math.max(start, end))
      }
      return
    }

    setIsSelecting(false)
  }

  const handleMouseLeave = () => {
    if (isSelecting) {
      setSelection(null)
      setIsSelecting(false)
    }
    if (dragging) {
      setDragging(null)
    }
  }

  // --- Zoom (wheel) ---

  const handleWheel = (e: WheelEvent<HTMLDivElement>) => {
    e.preventDefault()

    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mouseXFrac = (e.clientX - rect.left) / rect.width // 0..1 on canvas

    // Seconds under cursor before zoom
    const secUnderCursor = visibleStart + mouseXFrac * visibleDuration

    const zoomDelta = e.deltaY < 0 ? 1.15 : 1 / 1.15
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * zoomDelta))

    // New visible duration
    const newVisDur = duration / newZoom

    // Adjust scroll so secUnderCursor stays at same mouseXFrac
    let newScrollOffset = (secUnderCursor - mouseXFrac * newVisDur) / duration
    newScrollOffset = Math.max(0, Math.min(newScrollOffset, 1 - 1 / newZoom))

    setZoom(newZoom)
    setScrollOffset(newScrollOffset)
  }

  // --- Pinch zoom (touch) ---

  const handleTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      lastPinchDist.current = Math.sqrt(dx * dx + dy * dy)
    }
  }

  const handleTouchMove = (e: TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && lastPinchDist.current !== null) {
      e.preventDefault()
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      const dist = Math.sqrt(dx * dx + dy * dy)
      const scale = dist / lastPinchDist.current

      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const midX = ((e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left) / rect.width

      const secUnderMid = visibleStart + midX * visibleDuration
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * scale))
      const newVisDur = duration / newZoom

      let newScrollOffset = (secUnderMid - midX * newVisDur) / duration
      newScrollOffset = Math.max(0, Math.min(newScrollOffset, 1 - 1 / newZoom))

      setZoom(newZoom)
      setScrollOffset(newScrollOffset)
      lastPinchDist.current = dist
    }
  }

  const handleTouchEnd = () => {
    lastPinchDist.current = null
  }

  // --- Scrollbar for panning when zoomed ---

  const handleScrollbarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value)
    setScrollOffset(Math.max(0, Math.min(val, 1 - 1 / zoom)))
  }

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ position: "relative" }}
    >
      <canvas
        ref={canvasRef}
        width={1000}
        height={height}
        style={{
          width: "100%",
          height,
          border: "1px solid #ccc",
          cursor,
          display: "block",
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      />
      {/* Scrollbar — only visible when zoomed */}
      {zoom > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
          <span style={{ fontSize: 11, color: "#888", whiteSpace: "nowrap" }}>
            {zoom.toFixed(1)}×
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={scrollOffset}
            onChange={handleScrollbarChange}
            style={{ flex: 1 }}
          />
        </div>
      )}
    </div>
  )
}