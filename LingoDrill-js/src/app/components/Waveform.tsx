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
  /** Показывать красную линию прогресса воспроизведения всего файла */
  showPlaybackCursor?: boolean
  /** Текущее состояние воспроизведения (для отображения курсора) */
  isFilePlaying?: boolean
  /** Callback при перетаскивании курсора воспроизведения */
  onSeek?: (time: number) => void
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
  showPlaybackCursor = false,
  isFilePlaying = false,
  onSeek,
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

  // Dragging playback cursor
  const [draggingCursor, setDraggingCursor] = useState(false)

  // Cursor
  const [cursor, setCursor] = useState("crosshair")

  // Pinch zoom state managed inside useEffect

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

    // Playback cursor (red line with handle for full file playback)
    if (showPlaybackCursor && currentTime !== undefined && currentTime > 0 && (isFilePlaying || currentTime < duration)) {
      const cursorX = secondsToPx(currentTime)
      if (cursorX >= 0 && cursorX <= width) {
        ctx.strokeStyle = "#f44336"
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(cursorX, 0)
        ctx.lineTo(cursorX, h)
        ctx.stroke()

        // Handle (circle at middle)
        ctx.beginPath()
        ctx.arc(cursorX, h / 2, 6, 0, Math.PI * 2)
        ctx.fillStyle = "#f44336"
        ctx.fill()
        ctx.strokeStyle = "#fff"
        ctx.lineWidth = 2
        ctx.stroke()
      }
    }
  }, [data, fragments, selection, duration, currentTime, playingFragment, editingId, visibleStart, visibleEnd, secondsToPx, showPlaybackCursor, isFilePlaying])

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

    // 0) Check if clicking on playback cursor handle
    if (showPlaybackCursor && currentTime !== undefined && onSeek) {
      const cursorX = secondsToPx(currentTime)
      if (Math.abs(x - cursorX) <= HANDLE_HIT_AREA) {
        setDraggingCursor(true)
        return
      }
    }

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

    // Dragging playback cursor
    if (draggingCursor && onSeek) {
      const time = pxToSeconds(x)
      onSeek(time)
      setCursor("ew-resize")
      return
    }

    // Update cursor
    if (showPlaybackCursor && currentTime !== undefined && onSeek) {
      const cursorX = secondsToPx(currentTime)
      if (Math.abs(x - cursorX) <= HANDLE_HIT_AREA) {
        setCursor("pointer")
        // Skip other cursor checks
        if (!dragging && !isSelecting) return
      }
    }

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
    if (draggingCursor) {
      setDraggingCursor(false)
      return
    }

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
    if (draggingCursor) setDraggingCursor(false)
    if (isSelecting) {
      setSelection(null)
      setIsSelecting(false)
    }
    if (dragging) {
      setDragging(null)
    }
  }

  // --- Zoom helpers ---

  const applyZoom = useCallback((zoomFactor: number, anchorFrac: number = 0.5) => {
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * zoomFactor))
    const visDur = visibleEnd - visibleStart
    const secUnderAnchor = visibleStart + anchorFrac * visDur
    const newVisDur = duration / newZoom
    let newScrollOffset = (secUnderAnchor - anchorFrac * newVisDur) / duration
    newScrollOffset = Math.max(0, Math.min(newScrollOffset, 1 - 1 / newZoom))
    setZoom(newZoom)
    setScrollOffset(newScrollOffset)
  }, [zoom, visibleStart, visibleEnd, duration])

  const handleScrollbarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value)
    setScrollOffset(Math.max(0, Math.min(val, 1 - 1 / zoom)))
  }

  // --- Zoom (wheel) — native listener for { passive: false } ---

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const mouseXFrac = (e.clientX - rect.left) / rect.width
      const zoomFactor = e.deltaY < 0 ? 1.15 : 1 / 1.15
      applyZoom(zoomFactor, mouseXFrac)
    }

    container.addEventListener("wheel", handleWheel, { passive: false })
    return () => container.removeEventListener("wheel", handleWheel)
  }, [applyZoom])

  // --- Touch events (pinch zoom + single-finger selection/drag/tap) ---

  // Refs для доступа к актуальным значениям из touch handlers
  const stateRef = useRef({
    editingId, fragments, selection, isSelecting, dragging, draggingCursor,
    showPlaybackCursor, currentTime, onSeek, onEditDrag, onFragmentClick, onClickOutside, onSelect,
  })
  useEffect(() => {
    stateRef.current = {
      editingId, fragments, selection, isSelecting, dragging, draggingCursor,
      showPlaybackCursor, currentTime, onSeek, onEditDrag, onFragmentClick, onClickOutside, onSelect,
    }
  })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let pinchDist: number | null = null
    let touchAction: "none" | "select" | "drag-handle" | "drag-cursor" | "tap" = "none"
    let touchStartX = 0
    let touchMoved = false

    const getTouchX = (touch: Touch) => {
      const rect = canvas.getBoundingClientRect()
      const scaleX = canvas.width / rect.width
      return (touch.clientX - rect.left) * scaleX
    }

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        // Pinch zoom
        const dx = e.touches[0].clientX - e.touches[1].clientX
        const dy = e.touches[0].clientY - e.touches[1].clientY
        pinchDist = Math.sqrt(dx * dx + dy * dy)
        touchAction = "none"
        return
      }

      if (e.touches.length !== 1) return

      const x = getTouchX(e.touches[0])
      touchStartX = x
      touchMoved = false
      const s = stateRef.current

      // Check playback cursor
      if (s.showPlaybackCursor && s.currentTime !== undefined && s.onSeek) {
        const cursorX = secondsToPx(s.currentTime)
        if (Math.abs(x - cursorX) <= HANDLE_HIT_AREA * 2) {
          touchAction = "drag-cursor"
          setDraggingCursor(true)
          e.preventDefault()
          return
        }
      }

      // Check editing handles
      if (s.editingId) {
        const side = getEditingHandleUnderPointer(x)
        if (side) {
          touchAction = "drag-handle"
          setDragging({ id: s.editingId, side })
          e.preventDefault()
          return
        }
      }

      // Tentatively a tap or selection start
      touchAction = "tap"
    }

    const handleTouchMove = (e: TouchEvent) => {
      // Pinch zoom
      if (e.touches.length === 2 && pinchDist !== null) {
        e.preventDefault()
        const dx = e.touches[0].clientX - e.touches[1].clientX
        const dy = e.touches[0].clientY - e.touches[1].clientY
        const dist = Math.sqrt(dx * dx + dy * dy)
        const scale = dist / pinchDist

        const rect = canvas.getBoundingClientRect()
        const midX = ((e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left) / rect.width

        applyZoom(scale, midX)
        pinchDist = dist
        return
      }

      if (e.touches.length !== 1) return
      const x = getTouchX(e.touches[0])
      const s = stateRef.current

      // Drag playback cursor
      if (touchAction === "drag-cursor" && s.onSeek) {
        e.preventDefault()
        s.onSeek(pxToSeconds(x))
        return
      }

      // Drag editing handle
      if (touchAction === "drag-handle" && s.dragging) {
        e.preventDefault()
        const f = s.fragments.find(fr => fr.id === s.dragging!.id)
        if (!f || !s.onEditDrag) return
        const newTime = pxToSeconds(x)
        if (s.dragging.side === "start" && newTime < f.end) {
          s.onEditDrag(f.id, newTime, f.end)
        }
        if (s.dragging.side === "end" && newTime > f.start) {
          s.onEditDrag(f.id, f.start, newTime)
        }
        return
      }

      // If was tap but moved enough — start selection
      if (touchAction === "tap" && Math.abs(x - touchStartX) > 5) {
        touchAction = "select"
        touchMoved = true
        setIsSelecting(true)
        setSelection({ startX: touchStartX, endX: x })
        e.preventDefault()
        return
      }

      // Continue selection
      if (touchAction === "select") {
        e.preventDefault()
        setSelection(prev => prev ? { ...prev, endX: x } : null)
      }
    }

    const handleTouchEnd = (e: TouchEvent) => {
      // Pinch end
      if (pinchDist !== null && e.touches.length < 2) {
        pinchDist = null
      }

      const s = stateRef.current

      if (touchAction === "drag-cursor") {
        setDraggingCursor(false)
      }

      if (touchAction === "drag-handle") {
        setDragging(null)
      }

      if (touchAction === "select" && s.selection) {
        const start = pxToSeconds(s.selection.startX)
        const end = pxToSeconds(s.selection.endX)
        setSelection(null)
        setIsSelecting(false)
        if (s.onSelect && Math.abs(end - start) > 0.05) {
          s.onSelect(Math.min(start, end), Math.max(start, end))
        }
      }

      // Tap (no movement) — handle fragment click / click outside
      if (touchAction === "tap" && !touchMoved) {
        const fragId = getFragmentUnderPointer(touchStartX)
        if (fragId) {
          if (fragId !== s.editingId) {
            s.onFragmentClick?.(fragId)
          }
        } else if (s.editingId) {
          s.onClickOutside?.()
        }
      }

      touchAction = "none"
    }

    canvas.addEventListener("touchstart", handleTouchStart, { passive: false })
    canvas.addEventListener("touchmove", handleTouchMove, { passive: false })
    canvas.addEventListener("touchend", handleTouchEnd)
    return () => {
      canvas.removeEventListener("touchstart", handleTouchStart)
      canvas.removeEventListener("touchmove", handleTouchMove)
      canvas.removeEventListener("touchend", handleTouchEnd)
    }
  }, [applyZoom, pxToSeconds, secondsToPx, getEditingHandleUnderPointer, getFragmentUnderPointer])

  return (
    <div
      ref={containerRef}
      style={{ position: "relative" }}
    >
      {/* Zoom controls */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginBottom: 6,
      }}>
        <span style={{ fontWeight: 500, fontSize: 13 }}>Zoom</span>
        <button
          onClick={() => applyZoom(1 / 1.3)}
          disabled={zoom <= MIN_ZOOM}
          style={{ width: 28, height: 28, fontSize: 16, lineHeight: "1", padding: 0, cursor: "pointer" }}
        >
          −
        </button>
        <span style={{ fontSize: 12, color: "#888", minWidth: 36, textAlign: "center" }}>
          {zoom.toFixed(1)}×
        </span>
        <button
          onClick={() => applyZoom(1.3)}
          disabled={zoom >= MAX_ZOOM}
          style={{ width: 28, height: 28, fontSize: 16, lineHeight: "1", padding: 0, cursor: "pointer" }}
        >
          +
        </button>
        <span style={{ fontSize: 11, color: "#aaa", marginLeft: 4 }}>
          (scroll to zoom, pinch on touch)
        </span>
      </div>

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
        <input
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={scrollOffset}
          onChange={handleScrollbarChange}
          style={{ width: "100%", marginTop: 4 }}
        />
      )}
    </div>
  )
}