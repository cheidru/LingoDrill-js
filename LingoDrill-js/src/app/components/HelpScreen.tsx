// app/components/HelpScreen.tsx
//
// Help, in the onboarding's format: a full-bleed window with nothing but a
// close button — no header, no nav. It opens on an index of every screen in the
// app; picking one shows that screen with its significant controls numbered and
// a matching numbered list underneath.
//
// It is opened from the About menu as component state rather than as a route,
// for the same reason the Demo is: a route would bring the header back with it.

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import type { CSSProperties, KeyboardEvent } from "react"
import { useT } from "../../utils/i18n"
import { APP_VERSION } from "../../utils/version"
import { HelpMock } from "./HelpMocks"
import { HELP_TOPICS, type HelpTopic } from "./helpTopics"

type Props = {
  onClose: () => void
}

const FOCUSABLE = 'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

type Badge = { n: number; x: number; y: number }

/* The mock is laid out at its natural width and scaled to whatever width the
   window gives it, so the whole screen is visible rather than cropped. Both the
   scale and the frame's height have to be measured — a scaled element keeps its
   pre-transform size in layout, so the container would otherwise reserve the
   unscaled height. Badges are positioned in unscaled space so they stay legible
   however far down the mock is scaled. */
function useShotLayout(topic: HelpTopic) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [height, setHeight] = useState(0)
  const [badges, setBadges] = useState<Badge[]>([])

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    const frame = frameRef.current
    if (!viewport || !frame) return

    const measure = () => {
      const natural = HELP_TOPICS.find(t => t.key === topic)?.width ?? 600
      const available = viewport.clientWidth
      // Never blown up past 1:1 — an upscaled mock just looks soft.
      const s = Math.min(1, available / natural)
      setScale(s)
      setHeight(frame.offsetHeight * s)

      const v = viewport.getBoundingClientRect()
      const marked = frame.querySelectorAll<HTMLElement>("[data-help]")
      setBadges(
        [...marked].map(el => {
          const r = el.getBoundingClientRect()
          return {
            n: Number(el.dataset.help),
            x: r.left - v.left,
            y: r.top - v.top,
          }
        }).sort((a, b) => a.n - b.n)
      )
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(viewport)
    ro.observe(frame)

    /* The app loads its faces from Google Fonts. If the window opens before
       they arrive, everything inside the mock is measured with fallback metrics
       and then shifts under the badges — the frame's own box need not change,
       so the observer above would never hear about it. */
    let stale = false
    document.fonts?.ready.then(() => {
      if (!stale) measure()
    })

    return () => {
      stale = true
      ro.disconnect()
    }
  }, [topic])

  return { viewportRef, frameRef, scale, height, badges }
}

function HelpShot({ topic }: { topic: HelpTopic }) {
  const { viewportRef, frameRef, scale, height, badges } = useShotLayout(topic)

  return (
    <div className="hl-shot" ref={viewportRef} style={{ height: height || undefined }}>
      {/* inert keeps the mock's controls out of the tab order and the
          accessibility tree — they are a picture, not controls. */}
      <div
        className="hl-shot__frame"
        ref={frameRef}
        inert
        style={{ "--shot-w": `${HELP_TOPICS.find(t => t.key === topic)?.width}px`, "--shot-scale": scale } as CSSProperties}
      >
        <HelpMock topic={topic} />
      </div>

      {badges.map(b => (
        <span
          key={b.n}
          className="hl-shot__badge"
          aria-hidden="true"
          style={{ "--bx": `${b.x}px`, "--by": `${b.y}px` } as CSSProperties}
        >
          {b.n}
        </span>
      ))}
    </div>
  )
}

export function HelpScreen({ onClose }: Props) {
  const t = useT()
  const [topic, setTopic] = useState<HelpTopic | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    document.body.classList.add("ob-scroll-lock")
    panelRef.current?.focus()
    return () => {
      document.body.classList.remove("ob-scroll-lock")
      previous?.focus?.()
    }
  }, [])

  /* Each topic is its own screenful, so it starts at the top rather than
     wherever the index happened to be scrolled to. Focus goes back to the
     panel because the button that was clicked has just unmounted — without
     this, focus falls to <body> and the key handler below stops hearing
     anything, so Escape would do nothing on a topic page. */
  useLayoutEffect(() => {
    panelRef.current?.parentElement?.scrollTo({ top: 0 })
    panelRef.current?.focus()
  }, [topic])

  /* Escape backs out one level before it closes, so the key does what the
     visible ← does and the window is never lost from a subpage by accident. */
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      if (topic) setTopic(null)
      else onClose()
      return
    }
    if (e.key !== "Tab") return

    const all = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE)
    const items = all ? [...all].filter(el => !el.closest("[inert]")) : []
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  const current = topic ? HELP_TOPICS.find(s => s.key === topic) : null

  return (
    <div className="ob hl" onClick={onClose}>
      <div
        className="hl__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hl-title"
        tabIndex={-1}
        ref={panelRef}
        onClick={e => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <button type="button" className="ob__close" onClick={onClose} aria-label={t("common.close")}>
          ✕
        </button>

        {!current ? (
          <>
            <p className="ob__eyebrow ob__eyebrow--brand">{t("app.title")}</p>
            <h2 className="ob__title" id="hl-title">{t("help.title")}</h2>
            <p className="ob__body">{t("help.intro")}</p>

            <ul className="hl-index">
              {HELP_TOPICS.map(s => (
                <li key={s.key}>
                  <button type="button" className="hl-index__item" onClick={() => setTopic(s.key)}>
                    <span className="hl-index__text">
                      <span className="hl-index__name">{t(`help.topic.${s.key}.name`)}</span>
                      <span className="hl-index__desc">{t(`help.topic.${s.key}.body`)}</span>
                    </span>
                    <span className="hl-index__chevron" aria-hidden="true">→</span>
                  </button>
                </li>
              ))}
            </ul>

            <p className="hl__version">{t("app.title")} {t("about.version")} {APP_VERSION}</p>
          </>
        ) : (
          <>
            <button type="button" className="hl__back" onClick={() => setTopic(null)}>
              {t("help.backToIndex")}
            </button>

            <h2 className="ob__title" id="hl-title">{t(`help.topic.${current.key}.name`)}</h2>
            <p className="ob__body">{t(`help.topic.${current.key}.body`)}</p>

            <div className="hl-shot-frame">
              <HelpShot topic={current.key} />
            </div>

            <ol className="hl-notes">
              {Array.from({ length: current.marks }, (_, i) => (
                <li key={i} className="hl-notes__item">
                  <span className="hl-notes__num" aria-hidden="true">{i + 1}</span>
                  <span className="hl-notes__text">{t(`help.topic.${current.key}.n${i + 1}`)}</span>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </div>
  )
}
