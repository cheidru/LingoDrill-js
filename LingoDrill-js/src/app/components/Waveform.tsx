// app/components/Waveform.tsx
import { useRef, useEffect, useState, useCallback, type MutableRefObject } from "react"
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
  /** Вызывается когда перетаскивание границы завершено (mouse/touch up) */
  onEditEnd?: (id: string, newStart: number, newEnd: number) => void
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
  /** Ref that the parent can read to get the current visible start time (in seconds) */
  visibleStartRef?: MutableRefObject<number>
}

const HANDLE_RADIUS = 6
const HANDLE_HIT_AREA = 10
const HANDLE_RADIUS_MOBILE = 12
const HANDLE_HIT_AREA_MOBILE = 24
const CURSOR_HANDLE_RADIUS = 6
const CURSOR_HANDLE_RADIUS_MOBILE = 12
const CURSOR_HIT_AREA = 15
const CURSOR_HIT_AREA_MOBILE = 40
const MIN_ZOOM = 1
const MAX_ZOOM = 50

// Pinch zoom speed multiplier for touch devices (1 = default OS speed, 2.5 = 2.5× faster)
// TODO: make configurable via settings menu
const PINCH_ZOOM_SPEED = 2.5

// Touch gesture timing (ms)
const LONG_PRESS_MS = 500    // long press to drag/create fragment

export function Waveform({
  data,
  duration,
  height = 200,
  fragments = [],
  onSelect,
  onFragmentClick,
  onClickOutside,
  onEditDrag,
  onEditEnd,
  editingId = null,
  currentTime,
  playingFragment,
  showPlaybackCursor = false,
  isFilePlaying = false,
  onSeek,
  visibleStartRef,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  // Mobile detection — same heuristic as main.tsx
  const isMobile = typeof document !== "undefined" && document.documentElement.classList.contains("mobile")
  const handleRadius = isMobile ? HANDLE_RADIUS_MOBILE : HANDLE_RADIUS
  const handleHitArea = isMobile ? HANDLE_HIT_AREA_MOBILE : HANDLE_HIT_AREA
  const cursorHandleRadius = isMobile ? CURSOR_HANDLE_RADIUS_MOBILE : CURSOR_HANDLE_RADIUS
  const cursorHitArea = isMobile ? CURSOR_HIT_AREA_MOBILE : CURSOR_HIT_AREA

  // Zoom & scroll state
  const [zoom, setZoom] = useState(1)          // 1 = full view
  const [scrollOffset, setScrollOffset] = useState(0) // 0..1 — left edge in normalized coords

  // Refs для чтения актуальных zoom/scrollOffset из touch-обработчиков
  const zoomRef = useRef(zoom)
  const scrollOffsetRef = useRef(scrollOffset)
  useEffect(() => { zoomRef.current = zoom }, [zoom])
  useEffect(() => { scrollOffsetRef.current = scrollOffset }, [scrollOffset])

  // Selection (new fragment)
  const [selection, setSelection] = useState<{ startX: number; endX: number } | null>(null)
  const [isSelecting, setIsSelecting] = useState(false)

  // Dragging handle of editing fragment
  const [dragging, setDragging] = useState<{ id: string; side: "start" | "end" } | null>(null)

  // Dragging playback cursor
  const [draggingCursor, setDraggingCursor] = useState(false)

  // Cursor
  const [cursor, setCursor] = useState("crosshair")

  // Pinch zoom state managed via refs (must survive useEffect re-runs when zoom/scroll change)
  const pinchDistRef = useRef<number | null>(null)
  const pinchInitialDistRef = useRef<number | null>(null)
  const pinchInitialZoomRef = useRef<number | null>(null)
  const pinchInitialOffsetRef = useRef<number | null>(null)

  // Touch gesture state managed via refs (must survive useEffect re-runs)
  const touchActionRef = useRef<"none" | "select" | "drag-handle" | "drag-cursor" | "tap" | "swipe-scroll" | "wait-long">("none")
  const touchStartXRef = useRef(0)
  const touchStartYRef = useRef(0)
  const touchStartClientXRef = useRef(0)
  const touchMovedRef = useRef(false)
  const swipeDirectionRef = useRef<boolean | null>(null) // null = undecided, true = horizontal, false = vertical
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const touchStartTimeRef = useRef(0)
  const touchNearCursorRef = useRef(false)  // was the touch start near the playback cursor?
  const touchNearHandleRef = useRef<"start" | "end" | null>(null)  // was the touch start near an editing handle?

  // Visual feedback for long-press state
  const [longPressReady, setLongPressReady] = useState(false)

  // Refs for functions/values used inside touch useEffect
  // (so the useEffect doesn't re-run when these change during playback)
  const pxToSecondsRef = useRef<(x: number) => number>(() => 0)
  const secondsToPxRef = useRef<(sec: number) => number>(() => 0)
  const getEditingHandleRef = useRef<(x: number) => "start" | "end" | null>(() => null)
  const getFragmentUnderRef = useRef<(x: number) => string | null>(() => null)
  const cursorHitAreaRef = useRef(CURSOR_HIT_AREA)

  // --- Coordinate helpers ---

  /** Visible window: [visibleStart, visibleEnd] in seconds */
  const visibleStart = scrollOffset * duration
  const visibleEnd = Math.min((scrollOffset + 1 / zoom) * duration, duration)
  const visibleDuration = visibleEnd - visibleStart
  // Sync visibleStart to parent ref so editor can read it for play-all
  useEffect(() => {
    if (visibleStartRef) visibleStartRef.current = visibleStart
  }, [visibleStart, visibleStartRef])

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

    // Compute the ratio between canvas internal width and CSS display width
    // so we can draw visually round circles (canvas pixels are non-square on mobile)
    const cssWidth = canvas.getBoundingClientRect().width
    const scaleRatio = cssWidth > 0 ? width / cssWidth : 1
    const cssHeight = canvas.getBoundingClientRect().height
    const scaleRatioY = cssHeight > 0 ? h / cssHeight : 1
    // To draw a circle that looks round on screen, we need to stretch the Y radius
    // relative to the X radius by the ratio of horizontal-to-vertical scaling
    const circleYStretch = scaleRatio / scaleRatioY

    /** Draw a circle that appears round on screen despite non-square canvas pixels */
    const drawRoundCircle = (cx: number, cy: number, radius: number) => {
      ctx.beginPath()
      ctx.ellipse(cx, cy, radius, radius / circleYStretch, 0, 0, Math.PI * 2)
    }

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
          drawRoundCircle(hx, handleY, handleRadius)
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

      if (right - left < 2) {
        // Zero-width or near-zero: draw a prominent start marker line
        ctx.strokeStyle = "#4caf50"
        ctx.lineWidth = 3
        ctx.setLineDash([6, 4])
        ctx.beginPath()
        ctx.moveTo(left, 0)
        ctx.lineTo(left, h)
        ctx.stroke()
        ctx.setLineDash([])
      } else {
        ctx.fillStyle = "rgba(0, 255, 0, 0.25)"
        ctx.fillRect(left, 0, right - left, h)
        ctx.strokeStyle = "rgba(0, 200, 0, 0.7)"
        ctx.lineWidth = 1
        ctx.strokeRect(left, 0, right - left, h)
      }
    }

    // Playback cursor (red line with handle for full file playback)
    if (showPlaybackCursor && currentTime !== undefined && currentTime > 0 && (isFilePlaying || currentTime < duration)) {
      const cursorX = secondsToPx(currentTime)
      if (cursorX >= 0 && cursorX <= width) {
        ctx.strokeStyle = "#f44336"
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(cursorX, 0)
        ctx.lineTo(cursorX, h)
        ctx.stroke()

        // Handle (circle at middle)
        drawRoundCircle(cursorX, h / 2, cursorHandleRadius)
        ctx.fillStyle = "#f44336"
        ctx.fill()
        ctx.strokeStyle = "#fff"
        ctx.lineWidth = 2
        ctx.stroke()
      }
    }
  }, [data, fragments, selection, duration, currentTime, playingFragment, editingId, visibleStart, visibleEnd, secondsToPx, showPlaybackCursor, isFilePlaying, handleRadius, cursorHandleRadius])

  useEffect(() => { draw() }, [draw])

  // --- Hit detection ---

  /** Check if x is near a handle of the editing fragment */
  const getEditingHandleUnderPointer = useCallback((x: number): "start" | "end" | null => {
    if (!editingId) return null
    const f = fragments.find(fr => fr.id === editingId)
    if (!f) return null
    const startX = secondsToPx(f.start)
    const endX = secondsToPx(f.end)
    if (Math.abs(x - startX) <= handleHitArea) return "start"
    if (Math.abs(x - endX) <= handleHitArea) return "end"
    return null
  }, [editingId, fragments, secondsToPx, handleHitArea])

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

  // Keep touch-handler refs in sync (avoids useEffect re-runs during playback)
  useEffect(() => { pxToSecondsRef.current = pxToSeconds }, [pxToSeconds])
  useEffect(() => { secondsToPxRef.current = secondsToPx }, [secondsToPx])
  useEffect(() => { getEditingHandleRef.current = getEditingHandleUnderPointer }, [getEditingHandleUnderPointer])
  useEffect(() => { getFragmentUnderRef.current = getFragmentUnderPointer }, [getFragmentUnderPointer])
  useEffect(() => { cursorHitAreaRef.current = cursorHitArea }, [cursorHitArea])

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
      if (Math.abs(x - cursorX) <= cursorHitArea) {
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
      if (Math.abs(x - cursorX) <= cursorHitArea) {
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
      const f = fragments.find(fr => fr.id === dragging.id)
      if (f) onEditEnd?.(dragging.id, f.start, f.end)
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
      const f = fragments.find(fr => fr.id === dragging.id)
      if (f) onEditEnd?.(dragging.id, f.start, f.end)
      setDragging(null)
    }
  }

  // --- Zoom helpers ---

  const applyZoom = useCallback((zoomFactor: number, anchorFrac: number = 0.5) => {
    const currentZoom = zoomRef.current
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, currentZoom * zoomFactor))
    const currentOffset = scrollOffsetRef.current
    const visDur = duration / currentZoom
    const visStart = currentOffset * duration
    const secUnderAnchor = visStart + anchorFrac * visDur
    const newVisDur = duration / newZoom
    let newScrollOffset = (secUnderAnchor - anchorFrac * newVisDur) / duration
    newScrollOffset = Math.max(0, Math.min(newScrollOffset, 1 - 1 / newZoom))
    setZoom(newZoom)
    setScrollOffset(newScrollOffset)
  }, [duration])

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


  // --- Touch events (pinch zoom + long-press gesture logic) ---

  // Refs для доступа к актуальным значениям из touch handlers
  const stateRef = useRef({
    editingId, fragments, selection, isSelecting, dragging, draggingCursor,
    showPlaybackCursor, currentTime, onSeek, onEditDrag, onEditEnd, onFragmentClick, onClickOutside, onSelect,
  })
  useEffect(() => {
    stateRef.current = {
      editingId, fragments, selection, isSelecting, dragging, draggingCursor,
      showPlaybackCursor, currentTime, onSeek, onEditDrag, onEditEnd, onFragmentClick, onClickOutside, onSelect,
    }
  })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const clearTimers = () => {
      if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null }
    }

    const getTouchX = (touch: Touch) => {
      const rect = canvas.getBoundingClientRect()
      const scaleX = canvas.width / rect.width
      return (touch.clientX - rect.left) * scaleX
    }

    const handleTouchStart = (e: TouchEvent) => {

      // --- 2-finger: pinch zoom ---
      if (e.touches.length === 2) {
        e.preventDefault()
        clearTimers()
        setLongPressReady(false)
        const dx = e.touches[0].clientX - e.touches[1].clientX
        const dy = e.touches[0].clientY - e.touches[1].clientY
        const dist = Math.sqrt(dx * dx + dy * dy)
        pinchDistRef.current = dist
        pinchInitialDistRef.current = dist
        pinchInitialZoomRef.current = zoomRef.current
        pinchInitialOffsetRef.current = scrollOffsetRef.current
        touchActionRef.current = "none"
        return
      }

      if (e.touches.length !== 1) return

      const x = getTouchX(e.touches[0])
      touchStartXRef.current = x
      touchStartClientXRef.current = e.touches[0].clientX
      touchStartYRef.current = e.touches[0].clientY
      touchMovedRef.current = false
      swipeDirectionRef.current = null
      touchStartTimeRef.current = Date.now()

      // Check proximity to cursor and handles at touch-start time
      // (during playback the cursor moves, so we must check NOW, not after 0.5s)
      const s = stateRef.current
      touchNearCursorRef.current = false
      touchNearHandleRef.current = null

      if (s.showPlaybackCursor && s.currentTime !== undefined && s.onSeek) {
        const cursorX = secondsToPxRef.current(s.currentTime)
        if (Math.abs(x - cursorX) <= cursorHitAreaRef.current) {
          touchNearCursorRef.current = true
        }
      }
      if (s.editingId) {
        const side = getEditingHandleRef.current(x)
        if (side) {
          touchNearHandleRef.current = side
        }
      }


      // Start in "tap" state — will transition based on timing and movement
      touchActionRef.current = "tap"
      setLongPressReady(false)

      // Long press timer → enables drag or new fragment
      clearTimers()
      longPressTimerRef.current = setTimeout(() => {
        if (touchActionRef.current !== "tap") return // already transitioned to swipe
        touchActionRef.current = "wait-long"
        setLongPressReady(true)
        // Show selection preview line at touch position
        setSelection({ startX: touchStartXRef.current, endX: touchStartXRef.current })
      }, LONG_PRESS_MS)
    }

    const handleTouchMove = (e: TouchEvent) => {
      // --- Pinch zoom ---
      if (e.touches.length === 2 && pinchDistRef.current !== null && pinchInitialDistRef.current !== null && pinchInitialZoomRef.current !== null && pinchInitialOffsetRef.current !== null) {
        e.preventDefault()
        const dx = e.touches[0].clientX - e.touches[1].clientX
        const dy = e.touches[0].clientY - e.touches[1].clientY
        const dist = Math.sqrt(dx * dx + dy * dy)

        const ratio = dist / pinchInitialDistRef.current
        const amplifiedRatio = Math.pow(ratio, PINCH_ZOOM_SPEED)
        const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, pinchInitialZoomRef.current * amplifiedRatio))

        const rect = canvas.getBoundingClientRect()
        const midX = ((e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left) / rect.width

        const initVisDur = duration / pinchInitialZoomRef.current
        const initVisStart = pinchInitialOffsetRef.current * duration
        const secUnderAnchor = initVisStart + midX * initVisDur
        const newVisDur = duration / newZoom
        let newScrollOffset = (secUnderAnchor - midX * newVisDur) / duration
        newScrollOffset = Math.max(0, Math.min(newScrollOffset, 1 - 1 / newZoom))


        setZoom(newZoom)
        setScrollOffset(newScrollOffset)
        pinchDistRef.current = dist
        return
      }

      if (e.touches.length !== 1) return
      const x = getTouchX(e.touches[0])
      const currentClientX = e.touches[0].clientX
      const currentClientY = e.touches[0].clientY
      const s = stateRef.current

      // --- Already dragging cursor ---
      if (touchActionRef.current === "drag-cursor" && s.onSeek) {
        e.preventDefault()
        const time = pxToSecondsRef.current(x)
        s.onSeek(time)
        return
      }

      // --- Already dragging handle ---
      if (touchActionRef.current === "drag-handle" && s.dragging) {
        e.preventDefault()
        const f = s.fragments.find(fr => fr.id === s.dragging!.id)
        if (!f || !s.onEditDrag) return
        const newTime = pxToSecondsRef.current(x)
        if (s.dragging.side === "start" && newTime < f.end) {
          s.onEditDrag(f.id, newTime, f.end)
        }
        if (s.dragging.side === "end" && newTime > f.start) {
          s.onEditDrag(f.id, f.start, newTime)
        }
        return
      }

      // --- Already selecting (creating new fragment) ---
      if (touchActionRef.current === "select") {
        e.preventDefault()
        setSelection(prev => prev ? { ...prev, endX: x } : null)
        return
      }

      // --- Already scrolling ---
      if (touchActionRef.current === "swipe-scroll") {
        e.preventDefault()
        const deltaClientX = currentClientX - touchStartClientXRef.current
        touchStartClientXRef.current = currentClientX

        const rect = canvas.getBoundingClientRect()
        const currentZoom = zoomRef.current
        const currentOffset = scrollOffsetRef.current
        const newOffset = currentOffset - (deltaClientX / rect.width) * (1 / currentZoom)
        const clampedOffset = Math.max(0, Math.min(1 - 1 / currentZoom, newOffset))
        setScrollOffset(clampedOffset)
        return
      }

      // --- "tap" state: finger moved before long press → swipe-scroll ---
      // UNLESS the touch started near the cursor or a handle — then ignore
      // small movements and wait for the long press timer to fire
      if (touchActionRef.current === "tap") {
        const rawDx = Math.abs(currentClientX - touchStartClientXRef.current)
        const rawDy = Math.abs(currentClientY - touchStartYRef.current)

        // If near a draggable target, tolerate more movement to allow long press
        const nearDraggable = touchNearCursorRef.current || touchNearHandleRef.current !== null
        const threshold = nearDraggable ? 40 : 8

        if (rawDx > threshold || rawDy > threshold) {
          clearTimers()
          setLongPressReady(false)
          touchMovedRef.current = true

          if (rawDx >= rawDy) {
            touchActionRef.current = "swipe-scroll"
            touchStartClientXRef.current = currentClientX
            e.preventDefault()
          }
          return
        }
        return
      }

      // --- "wait-long" state: finger moved after long press ---
      // Priority: cursor > editing handle > new fragment
      // Proximity was checked at touch-start time (touchNearCursorRef, touchNearHandleRef)
      // so moving cursor during playback doesn't break the detection
      if (touchActionRef.current === "wait-long") {
        const rawDx = Math.abs(currentClientX - touchStartClientXRef.current)
        const rawDy = Math.abs(currentClientY - touchStartYRef.current)

        if (rawDx > 5 || rawDy > 5) {
          clearTimers()
          setLongPressReady(false)

          // 1) Grab playback cursor (proximity was checked at touch start)
          if (touchNearCursorRef.current && s.onSeek) {
            touchActionRef.current = "drag-cursor"
            setDraggingCursor(true)
            setSelection(null)
            // Immediately seek to touch position so cursor snaps to finger
            s.onSeek(pxToSecondsRef.current(x))
            e.preventDefault()
            return
          }

          // 2) Grab editing handle (proximity was checked at touch start)
          if (touchNearHandleRef.current && s.editingId) {
            touchActionRef.current = "drag-handle"
            setDragging({ id: s.editingId, side: touchNearHandleRef.current })
            setSelection(null)
            e.preventDefault()
            return
          }

          // 3) Not near cursor or handle → create new fragment
          touchActionRef.current = "select"
          touchMovedRef.current = true
          setIsSelecting(true)
          setSelection({ startX: touchStartXRef.current, endX: x })
          e.preventDefault()
        }
        return
      }
    }

    const handleTouchEnd = (e: TouchEvent) => {
      clearTimers()
      setLongPressReady(false)

      // Pinch end
      if (pinchDistRef.current !== null && e.touches.length < 2) {
        pinchDistRef.current = null
        pinchInitialDistRef.current = null
        pinchInitialZoomRef.current = null
        pinchInitialOffsetRef.current = null
      }

      const s = stateRef.current

      if (touchActionRef.current === "drag-cursor") {
        setDraggingCursor(false)
      }

      if (touchActionRef.current === "drag-handle") {
        if (s.dragging) {
          const f = s.fragments.find(fr => fr.id === s.dragging!.id)
          if (f) s.onEditEnd?.(s.dragging.id, f.start, f.end)
        }
        setDragging(null)
      }

      if (touchActionRef.current === "select" && s.selection) {
        const start = pxToSecondsRef.current(s.selection.startX)
        const end = pxToSecondsRef.current(s.selection.endX)
        setSelection(null)
        setIsSelecting(false)
        if (s.onSelect && Math.abs(end - start) > 0.05) {
          s.onSelect(Math.min(start, end), Math.max(start, end))
        }
      }

      // Tap or wait-long without drag — handle fragment click / click outside
      if ((touchActionRef.current === "tap" || touchActionRef.current === "wait-long") && !touchMovedRef.current) {
        // Clear selection preview from wait-long
        setSelection(null)
        setIsSelecting(false)

        const fragId = getFragmentUnderRef.current(touchStartXRef.current)
        if (fragId) {
          if (fragId !== s.editingId) {
            s.onFragmentClick?.(fragId)
          }
        } else if (s.editingId) {
          s.onClickOutside?.()
        }
      }

      touchActionRef.current = "none"
      swipeDirectionRef.current = null
    }

    canvas.addEventListener("touchstart", handleTouchStart, { passive: false })
    canvas.addEventListener("touchmove", handleTouchMove, { passive: false })
    canvas.addEventListener("touchend", handleTouchEnd)
    return () => {
      clearTimers()
      canvas.removeEventListener("touchstart", handleTouchStart)
      canvas.removeEventListener("touchmove", handleTouchMove)
      canvas.removeEventListener("touchend", handleTouchEnd)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      ref={containerRef}
      className="waveform-container"
    >
      {/* Zoom controls */}
      <div className="waveform-zoom">
        <span className="waveform-zoom__label">Zoom</span>
        <button onClick={() => applyZoom(1 / 1.3)} disabled={zoom <= MIN_ZOOM} className="waveform-zoom__btn">−</button>
        <span className="waveform-zoom__value">{zoom.toFixed(1)}×</span>
        <button onClick={() => applyZoom(1.3)} disabled={zoom >= MAX_ZOOM} className="waveform-zoom__btn">+</button>
        <span className="waveform-zoom__hint">(scroll to zoom, pinch on touch)</span>
      </div>

      <canvas
        ref={canvasRef}
        width={1000}
        height={height}
        className="waveform-canvas"
        style={{ height, cursor }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      />

      {/* Long-press visual feedback indicator */}
      {longPressReady && (
        <div style={{
          textAlign: "center",
          padding: "4px 0",
          fontSize: "12px",
          fontWeight: 600,
          color: "#4caf50",
        }}>
          🟢 Hold steady… now drag to act
        </div>
      )}

      {/* Scrollbar — only visible when zoomed */}
      {zoom > 1 && (
        <input
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={scrollOffset}
          onChange={handleScrollbarChange}
          className="waveform-scrollbar"
        />
      )}
    </div>
  )
}