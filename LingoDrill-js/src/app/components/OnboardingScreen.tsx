// app/components/OnboardingScreen.tsx

import { useEffect, useRef, useState } from "react"
import type { KeyboardEvent } from "react"
import { useNavigate } from "react-router-dom"
import { useT } from "../../utils/i18n"
import { OnboardingStage } from "./OnboardingStage"
import { OnboardingDemo, type DemoStage } from "./OnboardingDemo"

type Props = {
  onClose: () => void
}

/* The welcome screen is not part of the pipeline, so it carries no number and
   shows the waveform hero. 01–04 map one-to-one onto the app's routes and each
   plays a scripted demo of that page. */
const SCREENS: { key: string; demo: DemoStage | null; num: string | null }[] = [
  { key: "welcome", demo: null, num: null },
  { key: "library", demo: "library", num: "01" },
  { key: "sequences", demo: "sequences", num: "02" },
  { key: "editor", demo: "editor", num: "03" },
  { key: "player", demo: "player", num: "04" },
]

const FOCUSABLE = 'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

export function OnboardingScreen({ onClose }: Props) {
  const t = useT()
  const navigate = useNavigate()
  const [index, setIndex] = useState(0)
  const panelRef = useRef<HTMLDivElement>(null)

  const screen = SCREENS[index]
  const isFirst = index === 0
  const isLast = index === SCREENS.length - 1

  const go = (i: number) => setIndex(Math.min(SCREENS.length - 1, Math.max(0, i)))

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    document.body.classList.add("ob-scroll-lock")
    panelRef.current?.focus()
    return () => {
      document.body.classList.remove("ob-scroll-lock")
      previous?.focus?.()
    }
  }, [])

  const finish = () => {
    navigate("/")
    onClose()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      onClose()
      return
    }
    if (e.key === "ArrowRight") {
      go(index + 1)
      return
    }
    if (e.key === "ArrowLeft") {
      go(index - 1)
      return
    }
    if (e.key !== "Tab") return

    // Keep Tab inside the panel — nothing behind it should be reachable.
    // The demo mocks are inert scenery, so their buttons are skipped.
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

  return (
    <div className="ob" onClick={onClose}>
      <div
        className="ob__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ob-title"
        tabIndex={-1}
        ref={panelRef}
        onClick={e => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        {/* Kept inside the panel so the focus trap can reach it. The panel
            therefore must not animate a transform, or this would position
            against the panel instead of the viewport. */}
        <button
          type="button"
          className="ob__close"
          onClick={onClose}
          aria-label={t("onboarding.close")}
        >
          ✕
        </button>

        <div className="ob__art">
          {screen.demo
            ? <OnboardingDemo key={screen.demo} stage={screen.demo} />
            : <OnboardingStage />}
        </div>

        <div className="ob__copy">
          {/* Keyed so each screen's copy re-enters; the actions below keep focus. */}
          <div className="ob__text" key={screen.key}>
            {screen.num ? (
              <p className="ob__eyebrow">
                <span className="ob__num">{screen.num}</span>
                {t(`onboarding.${screen.key}.eyebrow`)}
              </p>
            ) : (
              <p className="ob__eyebrow ob__eyebrow--brand">{t("app.title")}</p>
            )}

            <h2 className="ob__title" id="ob-title">
              {t(`onboarding.${screen.key}.title`)}
            </h2>

            <p className="ob__body">{t(`onboarding.${screen.key}.body`)}</p>

            {isLast && <p className="ob__note">{t("onboarding.reopenHint")}</p>}
          </div>

          <div className="ob__actions">
            {!isLast && (
              <button type="button" className="ob__skip" onClick={onClose}>
                {t("onboarding.skip")}
              </button>
            )}
            <span className="ob__actions-spacer" />
            {!isFirst && (
              <button type="button" className="ob__back" onClick={() => go(index - 1)}>
                {t("onboarding.back")}
              </button>
            )}
            {isLast ? (
              <button type="button" className="btn-primary ob__cta" onClick={finish}>
                {t("onboarding.startWithAudio")}
              </button>
            ) : (
              <button type="button" className="btn-primary ob__cta" onClick={() => go(index + 1)}>
                {isFirst ? t("onboarding.showMe") : t("onboarding.next")}
              </button>
            )}
          </div>
        </div>

        <nav className="ob__rail" aria-label={t("onboarding.step")}>
          {SCREENS.map((s, i) => (
            <button
              key={s.key}
              type="button"
              className={`ob__rail-btn${i === index ? " ob__rail-btn--active" : ""}${i < index ? " ob__rail-btn--done" : ""}${s.num ? "" : " ob__rail-btn--intro"}`}
              onClick={() => go(i)}
              aria-current={i === index ? "step" : undefined}
              aria-label={
                s.num
                  ? `${t("onboarding.step")} ${s.num} — ${t(`onboarding.${s.key}.eyebrow`)}`
                  : t(`onboarding.${s.key}.title`)
              }
            >
              <span className="ob__rail-mark" aria-hidden="true">{s.num}</span>
            </button>
          ))}
        </nav>
      </div>
    </div>
  )
}
