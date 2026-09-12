// pages/BackgroundsPage.tsx
//
// Where backgrounds are made, chosen and thrown away. Settings → Appearance no
// longer lists motifs, because the list is no longer fixed: a background here is
// a set of the user's own SVG drawings plus a colour, and the page behind
// everything is built from it (see utils/backgroundPattern.ts).
//
// Selecting a background is the same act as opening it. There is no second
// "selected for editing" state: the card that is in use is the card that shows
// its controls, so every change to the drawings or the colour is visible on the
// page underneath while it is being made.

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import type { BackgroundDef, BackgroundShape } from "../core/domain/types"
import { IndexedDBBackgroundStorage } from "../infrastructure/indexeddb/IndexedDBBackgroundStorage"
import {
  buildPatternTile,
  parseSvgShape,
  BUILTIN_BACKGROUND_ID,
  DEFAULT_STROKE,
  type PatternTile,
} from "../utils/backgroundPattern"
import { applyBackground, clearBgPattern } from "../utils/backgroundRuntime"
import { getBgPattern, setBgPattern, BG_PATTERN_NONE } from "../utils/settings"
import { useT } from "../utils/i18n"

/* Where the picker opens on a background that has never been re-coloured. */
const STROKE_PICK_FALLBACK = "#4f8a63"

/* The preview shows the real tile, shrunk — the drawings are 40px tall in it,
   so at a third they read as the texture the page actually gets. */
const PREVIEW_SCALE = 0.34

const ResetIcon = () => (
  <svg
    width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
  >
    <path d="M3 12a9 9 0 1 0 3.2-6.9L3 8" />
    <path d="M3 3v5h5" />
  </svg>
)

const TrashIcon = () => (
  <svg
    width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
  >
    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
  </svg>
)

function newId(): string {
  return `bg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** Reads a file picker's SVGs, keeping the order they were chosen in. */
async function readShapes(files: FileList): Promise<{ shapes: BackgroundShape[]; skipped: number }> {
  const shapes: BackgroundShape[] = []
  let skipped = 0
  for (const file of Array.from(files)) {
    try {
      const shape = parseSvgShape(await file.text(), file.name)
      if (shape) shapes.push(shape)
      else skipped += 1
    } catch {
      skipped += 1
    }
  }
  return { shapes, skipped }
}

function PatternPreview({ tile, label }: { tile: PatternTile | null; label: string }) {
  if (!tile) return <div className="bg-card__preview bg-card__preview--empty" aria-label={label} />
  return (
    <div
      className="bg-card__preview"
      role="img"
      aria-label={label}
      style={{
        // The same mask the page wears, at the same proportions.
        WebkitMaskImage: `url("${tile.uri}")`,
        maskImage: `url("${tile.uri}")`,
        WebkitMaskSize: `${tile.width * PREVIEW_SCALE}px ${tile.height * PREVIEW_SCALE}px`,
        maskSize: `${tile.width * PREVIEW_SCALE}px ${tile.height * PREVIEW_SCALE}px`,
      }}
    />
  )
}

export function BackgroundsPage() {
  const t = useT()
  const navigate = useNavigate()
  const storageRef = useRef(new IndexedDBBackgroundStorage())

  const [backgrounds, setBackgrounds] = useState<BackgroundDef[]>([])
  const [selected, setSelected] = useState<string>(getBgPattern())
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  /* The name field is not written through on every keystroke: a background
     carries its drawings, so each save rewrites a record measured in kilobytes.
     It is committed when the field is left instead. */
  const [nameDraft, setNameDraft] = useState<string | null>(null)

  const createInputRef = useRef<HTMLInputElement | null>(null)
  const replaceInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    let cancelled = false
    void storageRef.current.getAll().then(all => {
      if (cancelled) return
      setBackgrounds(all)
      setIsLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  /* Every card draws the real tile, and building one measures six curves, so
     the whole list is built once and held until a background changes. Colour is
     not in a tile — it is a mask — so re-colouring one never lands here. */
  const tiles = useMemo(() => {
    const map = new Map<string, PatternTile | null>()
    for (const bg of backgrounds) map.set(bg.id, buildPatternTile(bg))
    return map
  }, [backgrounds])

  /** Writes a background to storage and to the list. `reapply` says whether the
      page behind this one has to be repainted, which only a change of drawings
      or of colour calls for — a rename changes nothing anyone can see. */
  const persist = useCallback(async (bg: BackgroundDef, reapply: boolean) => {
    await storageRef.current.save(bg)
    setBackgrounds(prev => prev.map(b => (b.id === bg.id ? bg : b)))
    if (reapply && bg.id === getBgPattern()) applyBackground(bg)
  }, [])

  const handleSelect = useCallback((id: string) => {
    setSelected(id)
    setNameDraft(null)
    setBgPattern(id)
    if (id === BG_PATTERN_NONE) {
      clearBgPattern()
      return
    }
    const bg = backgrounds.find(b => b.id === id)
    if (bg) applyBackground(bg)
  }, [backgrounds])

  const handleCreate = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setError(null)
    const { shapes, skipped } = await readShapes(files)
    if (shapes.length === 0) {
      setError(t("backgrounds.error.noSvg"))
      return
    }
    if (skipped > 0) setError(t("backgrounds.error.someSkipped", { n: skipped }))

    const made = backgrounds.filter(b => b.id !== BUILTIN_BACKGROUND_ID).length
    const bg: BackgroundDef = {
      id: newId(),
      name: t("backgrounds.newName", { n: made + 1 }),
      shapes,
      stroke: DEFAULT_STROKE,
      createdAt: Date.now(),
    }
    await storageRef.current.save(bg)
    setBackgrounds(prev => [...prev, bg])
    // A background nobody can see is not much of a result: wear it right away.
    setSelected(bg.id)
    setBgPattern(bg.id)
    applyBackground(bg)
  }, [backgrounds, t])

  const handleReplace = useCallback(async (bg: BackgroundDef, files: FileList | null) => {
    if (!files || files.length === 0) return
    setError(null)
    const { shapes, skipped } = await readShapes(files)
    if (shapes.length === 0) {
      setError(t("backgrounds.error.noSvg"))
      return
    }
    if (skipped > 0) setError(t("backgrounds.error.someSkipped", { n: skipped }))
    await persist({ ...bg, shapes }, true)
  }, [persist, t])

  const handleDelete = useCallback(async (bg: BackgroundDef) => {
    if (bg.id === BUILTIN_BACKGROUND_ID) return
    if (!window.confirm(t("backgrounds.delete.confirm", { name: bg.name }))) return
    await storageRef.current.delete(bg.id)
    setBackgrounds(prev => prev.filter(b => b.id !== bg.id))
    /* Deleting what the page is wearing leaves it with a mask pointing at
       nothing, so the page falls back to no pattern at the same moment. */
    if (getBgPattern() === bg.id) {
      setSelected(BG_PATTERN_NONE)
      setBgPattern(BG_PATTERN_NONE)
      clearBgPattern()
    }
  }, [t])

  const renderCard = (bg: BackgroundDef) => {
    const isSelected = selected === bg.id
    const isBuiltin = bg.id === BUILTIN_BACKGROUND_ID
    const strokeIsDefault = bg.stroke === DEFAULT_STROKE
    const tile = tiles.get(bg.id) ?? null

    return (
      <div key={bg.id} className={`bg-card${isSelected ? " bg-card--active" : ""}`}>
        <button
          type="button"
          className="bg-card__pick"
          onClick={() => handleSelect(bg.id)}
          aria-pressed={isSelected}
        >
          <PatternPreview tile={tile} label={t("backgrounds.preview")} />
          <span className="bg-card__head">
            <span className="bg-card__name">{bg.name}</span>
            <span className="bg-card__meta">
              {isBuiltin && <span className="bg-card__tag">{t("backgrounds.builtin")}</span>}
              {t.n("backgrounds.shapeCount", bg.shapes.length)}
            </span>
          </span>
          <span className="bg-card__state">
            {isSelected ? t("backgrounds.inUse") : t("backgrounds.use")}
          </span>
        </button>

        {isSelected && (
          <div className="bg-card__editor">
            <label className="bg-field">
              <span className="bg-field__label">{t("backgrounds.name")}</span>
              <input
                className="settings-select bg-field__input"
                type="text"
                value={nameDraft ?? bg.name}
                disabled={isBuiltin}
                onChange={e => setNameDraft(e.target.value)}
                onBlur={() => {
                  const next = (nameDraft ?? bg.name).trim()
                  setNameDraft(null)
                  if (next && next !== bg.name) void persist({ ...bg, name: next }, false)
                }}
              />
            </label>

            <div className="bg-field">
              <span className="bg-field__label">{t("backgrounds.stroke")}</span>
              <div className="bg-field__row">
                {/* The colour input is the chip, as in Settings; the reset beside
                    it hands the pattern back to the theme's own text colour, so
                    it follows light and dark again. */}
                <label className={`settings-swatch${strokeIsDefault ? "" : " settings-swatch--active"}`}>
                  <input
                    type="color"
                    value={strokeIsDefault ? STROKE_PICK_FALLBACK : bg.stroke}
                    onChange={e => void persist({ ...bg, stroke: e.target.value }, true)}
                  />
                  <span
                    className="settings-swatch__dot"
                    style={{ background: strokeIsDefault ? "var(--color-text)" : bg.stroke }}
                  />
                  {strokeIsDefault ? t("backgrounds.stroke.default") : t("backgrounds.stroke.pick")}
                </label>
                <button
                  type="button"
                  className="settings-reset"
                  onClick={() => void persist({ ...bg, stroke: DEFAULT_STROKE }, true)}
                  disabled={strokeIsDefault}
                  title={t("backgrounds.stroke.default")}
                  aria-label={t("backgrounds.stroke.default")}
                >
                  <ResetIcon />
                </button>
              </div>
              <span className="bg-field__hint">{t("backgrounds.stroke.hint")}</span>
            </div>

            <div className="bg-field">
              <span className="bg-field__label">{t("backgrounds.files")}</span>
              <ul className="bg-files">
                {bg.shapes.map(shape => (
                  <li key={shape.id} className="bg-files__item">{shape.name}</li>
                ))}
              </ul>
              <div className="bg-field__row">
                <button
                  type="button"
                  className="settings-seg__btn settings-seg__btn--standalone"
                  onClick={() => replaceInputRef.current?.click()}
                >
                  {t("backgrounds.replace")}
                </button>
                <button
                  type="button"
                  className="settings-reset bg-delete"
                  onClick={() => void handleDelete(bg)}
                  disabled={isBuiltin}
                  title={isBuiltin ? t("backgrounds.delete.builtin") : t("backgrounds.delete")}
                  aria-label={t("backgrounds.delete")}
                >
                  <TrashIcon />
                </button>
              </div>
              <span className="bg-field__hint">{t("backgrounds.replace.hint")}</span>
              <input
                ref={replaceInputRef}
                type="file"
                accept=".svg,image/svg+xml"
                multiple
                hidden
                onChange={e => {
                  void handleReplace(bg, e.target.files)
                  e.target.value = ""
                }}
              />
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="page settings-page">
      <h2 className="settings-page__title">{t("backgrounds.title")}</h2>
      <button
        type="button"
        className="bg-back"
        onClick={() => navigate("/settings/appearance")}
      >
        ← {t("backgrounds.back")}
      </button>

      <p className="settings-row__hint bg-intro">{t("backgrounds.intro")}</p>

      {error && <p className="bg-error" role="alert">{error}</p>}

      {isLoading && <p>{t("common.loading")}</p>}

      {!isLoading && (
        <div className="bg-list">
          <div className={`bg-card${selected === BG_PATTERN_NONE ? " bg-card--active" : ""}`}>
            <button
              type="button"
              className="bg-card__pick"
              onClick={() => handleSelect(BG_PATTERN_NONE)}
              aria-pressed={selected === BG_PATTERN_NONE}
            >
              <PatternPreview tile={null} label={t("backgrounds.none")} />
              <span className="bg-card__head">
                <span className="bg-card__name">{t("backgrounds.none")}</span>
                <span className="bg-card__meta">{t("backgrounds.none.hint")}</span>
              </span>
              <span className="bg-card__state">
                {selected === BG_PATTERN_NONE ? t("backgrounds.inUse") : t("backgrounds.use")}
              </span>
            </button>
          </div>

          {backgrounds.map(renderCard)}
        </div>
      )}

      <div className="bg-create">
        <button
          type="button"
          className="settings-seg__btn settings-seg__btn--standalone"
          onClick={() => createInputRef.current?.click()}
        >
          {t("backgrounds.create")}
        </button>
        <span className="settings-row__hint">{t("backgrounds.create.hint")}</span>
        <input
          ref={createInputRef}
          type="file"
          accept=".svg,image/svg+xml"
          multiple
          hidden
          onChange={e => {
            void handleCreate(e.target.files)
            e.target.value = ""
          }}
        />
      </div>
    </div>
  )
}
