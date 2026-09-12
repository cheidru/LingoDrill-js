// utils/backgroundPattern.ts
//
// Turns a background — a handful of SVG drawings and a colour — into the one
// tile the page wears behind everything.
//
// The arrangement is not a grid. `PATTERN_LINES` holds six long curves that
// sweep across the tile; they are never drawn. Each drawing is stamped along
// one of them at a fixed spacing, rotated so its own axis stands perpendicular
// to the curve at that point — leaves along a stem rather than wallpaper. The
// sides alternate, so a line reads as a sprig instead of a comb.
//
// The tile leaves here as a `data:` URI. It is used as a CSS *mask*, never as
// an image: the shapes are black, and the colour on screen is whatever paints
// through the mask (see `html::before` in index.css). That is why a background
// can be re-coloured without rebuilding anything, and why one tile serves every
// theme and colour-theme combination.

import type { BackgroundDef, BackgroundShape } from "../core/domain/types"
import { DEFAULT_BACKGROUND_SHAPES } from "./defaultBackgroundShapes"

/* The invisible lines, taken from the source pattern drawing. They live in its
   own 210 x 297 page units; `PATTERN_SCALE` is the only thing that turns those
   into pixels, so the whole tile scales from one number. */
export const PATTERN_VIEWBOX = { width: 210, height: 297 }

const PATTERN_LINES = [
  "m -0.36486487,107.27027 c 0,0 16.62108687,-7.12463 24.80031787,-10.974575 15.930531,-7.498463 37.141221,-24.131849 62.730014,-25.050923 35.701793,-1.282303 70.669103,-6.331798 84.269573,-20.824983 14.5603,-15.516013 37.26766,-19.77114 37.26766,-19.77114",
  "m -0.31409145,166.28289 c 0,0 33.23839645,-4.69714 44.64034345,-11.09558 12.835119,-7.2027 30.081293,-19.71676 51.322057,-23.70517 47.597891,-8.93752 82.690351,-30.30597 102.626511,-35.899578 7.3951,-2.074884 11.93812,-1.907781 11.93812,-1.907781",
  "M 0.59570584,227.72421 C 18.230892,207.80086 54.653026,219.00524 102.41723,195.5344 c 11.66459,-5.73186 35.48386,-23.83378 60.80844,-27.31896 18.14197,-2.4967 33.80602,-13.47439 46.4376,-17.11285",
  "m 0.20082943,286.05535 c 0,0 41.48481557,-20.93549 79.42810057,-29.0524 22.3449,-4.78007 38.33337,-15.45051 45.28211,-19.90896 19.34149,-12.40989 47.59621,-10.99347 61.25626,-16.33902 7.98568,-3.12502 23.1011,-11.32124 23.1011,-11.32124",
  "m -34.13149,60.492062 c 0,0 44.348685,-7.593632 80.994839,-34.369335 C 67.359912,11.146806 100.24785,7.1841649 121.14756,3.583509 c 18.81845,-3.24209248 53.78851,-19.713068 53.78851,-19.713068",
  "m 45.830953,314.55958 c 0,0 56.772987,-27.41211 95.995997,-32.65447 11.04884,-1.47674 31.89171,-12.66475 40.07338,-16.25467 28.92395,-12.69113 89.41711,-31.36113 89.41711,-31.36113",
]

/** Pixels per pattern unit — the tile is 210 x 297 of these. */
const PATTERN_SCALE = 2

/** What every drawing is scaled to, measured on its own viewBox height. */
export const SHAPE_HEIGHT_PX = 40

/** Gap between consecutive stamps along a line, as a multiple of the height. */
const SPACING_RATIO = 1.45

/** A curve shorter than this in the tile has nothing stamped along it. */
const MIN_LINE_LENGTH = 1

export const BUILTIN_BACKGROUND_ID = "leaves"

/** `stroke` value meaning "whatever colour the theme writes text in". */
export const DEFAULT_STROKE = "default"

export const BUILTIN_BACKGROUND: BackgroundDef = {
  id: BUILTIN_BACKGROUND_ID,
  name: "Leaves",
  shapes: DEFAULT_BACKGROUND_SHAPES,
  stroke: DEFAULT_STROKE,
  createdAt: 0,
}

/* ── Reading an uploaded SVG ───────────────────────────────────────────── */

/* Only geometry survives the trip. Everything else an editor writes — scripts,
   styles, external references, foreign objects, metadata — is dropped rather
   than sanitised, because the result is inlined into a document the page then
   loads as a mask, and a whitelist is the only version of that which stays
   safe as the list of things SVG can do keeps growing. */
const ALLOWED_TAGS = new Set(["g", "path", "polygon", "polyline", "circle", "ellipse", "rect", "line"])

const GEOMETRY_ATTRS = [
  "d", "points", "cx", "cy", "r", "rx", "ry", "x", "y",
  "x1", "y1", "x2", "y2", "width", "height", "transform",
]

const PAINT_ATTRS = [
  "fill-rule", "clip-rule", "stroke-width",
  "stroke-linecap", "stroke-linejoin", "stroke-dasharray",
]

/** `style="fill-rule:evenodd"` carries meaning; the rest of a style does not. */
function styleValue(el: Element, prop: string): string | null {
  const style = el.getAttribute("style")
  if (!style) return null
  for (const decl of style.split(";")) {
    const sep = decl.indexOf(":")
    if (sep === -1) continue
    if (decl.slice(0, sep).trim().toLowerCase() === prop) return decl.slice(sep + 1).trim()
  }
  return null
}

function paintValue(el: Element, prop: string): string | null {
  return el.getAttribute(prop) ?? styleValue(el, prop)
}

function escapeAttr(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;")
}

/* A tile is a mask, so a shape is either opaque or absent — colours carry no
   information. What does carry information is whether the artwork was drawn as
   fills or as outlines: force a fill onto a stroke-only drawing and it turns
   into a blob, so the two are kept apart and both are pinned to black. */
function serializeElement(el: Element): string {
  const tag = el.tagName.toLowerCase()
  if (!ALLOWED_TAGS.has(tag)) return ""

  const parts: string[] = []
  for (const name of GEOMETRY_ATTRS) {
    const v = el.getAttribute(name)
    if (v !== null) parts.push(name + '="' + escapeAttr(v) + '"')
  }
  for (const name of PAINT_ATTRS) {
    const v = paintValue(el, name)
    if (v !== null) parts.push(name + '="' + escapeAttr(v) + '"')
  }

  const fill = paintValue(el, "fill")
  const stroke = paintValue(el, "stroke")
  const hasStroke = stroke !== null && stroke !== "none"
  const hasFill = fill === null ? !hasStroke : fill !== "none"
  if (tag !== "g") {
    parts.push('fill="' + (hasFill ? "#000" : "none") + '"')
    if (hasStroke) parts.push('stroke="#000"')
  }

  const children = Array.from(el.children).map(serializeElement).join("")
  const attrs = parts.length ? " " + parts.join(" ") : ""
  if (tag === "g") return children ? "<g" + attrs + ">" + children + "</g>" : ""
  return children
    ? "<" + tag + attrs + ">" + children + "</" + tag + ">"
    : "<" + tag + attrs + "/>"
}

let shapeSeq = 0
function newShapeId(): string {
  shapeSeq += 1
  return Date.now().toString(36) + "-" + shapeSeq.toString(36) + Math.random().toString(36).slice(2, 6)
}

/**
 * Reduces an uploaded SVG file to a `BackgroundShape`: the box it was drawn in
 * and the geometry inside it. Returns null for anything that is not an SVG, has
 * no usable box, or turns out to hold no drawable shape at all.
 */
export function parseSvgShape(text: string, name: string): BackgroundShape | null {
  let doc: Document
  try {
    doc = new DOMParser().parseFromString(text, "image/svg+xml")
  } catch {
    return null
  }
  const root = doc.documentElement
  if (!root || root.tagName.toLowerCase() !== "svg") return null
  if (doc.querySelector("parsererror")) return null

  let viewBox: [number, number, number, number] | null = null
  const vb = root.getAttribute("viewBox")
  if (vb) {
    const n = vb.trim().split(/[\s,]+/).map(Number)
    if (n.length === 4 && n.every(v => isFinite(v)) && n[2] > 0 && n[3] > 0) {
      viewBox = [n[0], n[1], n[2], n[3]]
    }
  }
  if (!viewBox) {
    /* No viewBox: fall back to the declared size, which is what a plain
       width/height export gives us. Units are ignored — the drawing is scaled
       to a fixed height anyway, so only its proportions ever mattered. */
    const w = parseFloat(root.getAttribute("width") ?? "")
    const h = parseFloat(root.getAttribute("height") ?? "")
    if (!isFinite(w) || !isFinite(h) || w <= 0 || h <= 0) return null
    viewBox = [0, 0, w, h]
  }

  const content = Array.from(root.children).map(serializeElement).join("")
  if (!content) return null

  return { id: newShapeId(), name, viewBox, content }
}

/* ── Building the tile ─────────────────────────────────────────────────── */

export interface PatternTile {
  /** `data:image/svg+xml;base64,…` — a mask source, not an image. */
  uri: string
  /** Tile size in CSS pixels. `mask-size` has to match it exactly, or the
      drawings stop being SHAPE_HEIGHT_PX tall. */
  width: number
  height: number
}

/* getTotalLength/getPointAtLength need a path the browser has actually laid
   out, so the curves are measured inside a real — but invisible and zero-sized
   — SVG that is torn down again before this returns. */
function withMeasuringSvg<T>(fn: (svg: SVGSVGElement) => T): T {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  svg.setAttribute("width", "0")
  svg.setAttribute("height", "0")
  svg.style.position = "absolute"
  svg.style.visibility = "hidden"
  svg.style.pointerEvents = "none"
  document.body.appendChild(svg)
  try {
    return fn(svg)
  } finally {
    svg.remove()
  }
}

/**
 * Lays a background's drawings out along the invisible lines and returns the
 * finished tile, or null if the background has nothing to draw. Each drawing is
 * emitted once into `<defs>` and stamped with `<use>`, so a tile carrying fifty
 * leaves is barely larger than one.
 */
export function buildPatternTile(bg: BackgroundDef): PatternTile | null {
  const shapes = bg.shapes
  if (shapes.length === 0) return null

  const width = PATTERN_VIEWBOX.width * PATTERN_SCALE
  const height = PATTERN_VIEWBOX.height * PATTERN_SCALE
  const defs = shapes.map((s, i) => '<g id="s' + i + '">' + s.content + "</g>").join("")

  const stamps: string[] = []
  let placed = 0

  withMeasuringSvg(svg => {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path")
    svg.appendChild(path)

    for (const d of PATTERN_LINES) {
      path.setAttribute("d", d)
      const lengthUnits = path.getTotalLength()
      const lengthPx = lengthUnits * PATTERN_SCALE
      if (!isFinite(lengthPx) || lengthPx < MIN_LINE_LENGTH) continue

      const stepPx = SHAPE_HEIGHT_PX * SPACING_RATIO
      const count = Math.floor(lengthPx / stepPx)
      if (count < 1) continue
      /* Centred on the line, so a curve never starts or ends with half a gap
         hanging off it. */
      const startPx = (lengthPx - (count - 1) * stepPx) / 2

      for (let i = 0; i < count; i++) {
        const at = (startPx + i * stepPx) / PATTERN_SCALE
        const p = path.getPointAtLength(at)
        const before = path.getPointAtLength(Math.max(0, at - 0.5))
        const after = path.getPointAtLength(Math.min(lengthUnits, at + 0.5))
        const tangent = (Math.atan2(after.y - before.y, after.x - before.x) * 180) / Math.PI

        const index = placed % shapes.length
        const [vx, vy, vw, vh] = shapes[index].viewBox
        placed += 1

        /* The drawing's own "up" is -y, and after `rotate(a)` that points along
           `a - 90°`. Rotating by the tangent therefore stands it perpendicular
           on one side of the curve, and by the tangent + 180° on the other. */
        const angle = tangent + (i % 2 === 0 ? 0 : 180)
        /* Its foot — bottom centre of its own box — is what lands on the line. */
        const rootX = vx + vw / 2
        const rootY = vy + vh
        const scale = SHAPE_HEIGHT_PX / vh

        stamps.push(
          '<use href="#s' + index + '" transform="' +
          "translate(" + (p.x * PATTERN_SCALE).toFixed(2) + " " + (p.y * PATTERN_SCALE).toFixed(2) + ") " +
          "rotate(" + angle.toFixed(2) + ") " +
          "scale(" + scale.toFixed(5) + ") " +
          "translate(" + (-rootX).toFixed(2) + " " + (-rootY).toFixed(2) + ')"/>'
        )
      }
    }
  })

  if (stamps.length === 0) return null

  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '" ' +
    'viewBox="0 0 ' + width + " " + height + '">' +
    "<defs>" + defs + "</defs>" + stamps.join("") + "</svg>"

  return { uri: "data:image/svg+xml;base64," + toBase64(svg), width, height }
}

function toBase64(s: string): string {
  // btoa is latin-1; an uploaded drawing may carry a non-ASCII attribute value.
  const bytes = new TextEncoder().encode(s)
  let binary = ""
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}
