// app/components/OnboardingModal.tsx

import { useState } from "react"
import { useT } from "../../utils/i18n"

type Props = {
  onClose: () => void
}

const STEPS = [
  { emoji: "🎧", key: "step1" },
  { emoji: "🎵", key: "step2" },
  { emoji: "📚", key: "step3" },
  { emoji: "✂️", key: "step4" },
  { emoji: "🔁", key: "step5" },
  { emoji: "⭐", key: "step6" },
] as const

export function OnboardingModal({ onClose }: Props) {
  const t = useT()
  const [step, setStep] = useState(0)

  const current = STEPS[step]
  const isFirst = step === 0
  const isLast = step === STEPS.length - 1

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-box modal-box--wide onboarding"
        onClick={e => e.stopPropagation()}
      >
        <button
          type="button"
          className="onboarding__close"
          onClick={onClose}
          aria-label={t("onboarding.close")}
        >
          ✕
        </button>

        <div className="onboarding__dots" role="tablist" aria-label={t("onboarding.step")}>
          {STEPS.map((s, i) => (
            <button
              type="button"
              key={s.key}
              className={`onboarding__dot${i === step ? " onboarding__dot--active" : ""}`}
              onClick={() => setStep(i)}
              aria-label={`${t("onboarding.step")} ${i + 1}`}
              aria-current={i === step}
            />
          ))}
        </div>

        <div className="onboarding__step">
          <div className="onboarding__emoji" aria-hidden="true">{current.emoji}</div>
          <h3 className="onboarding__title">{t(`onboarding.${current.key}.title`)}</h3>
          <p className="onboarding__body">{t(`onboarding.${current.key}.body`)}</p>
        </div>

        <div className="onboarding__footer">
          {!isLast && (
            <button type="button" className="onboarding__skip" onClick={onClose}>
              {t("onboarding.skip")}
            </button>
          )}
          <div className="onboarding__footer-spacer" />
          {!isFirst && (
            <button type="button" onClick={() => setStep(s => s - 1)}>
              {t("onboarding.back")}
            </button>
          )}
          {isLast ? (
            <button type="button" className="btn-primary" onClick={onClose}>
              {t("onboarding.getStarted")}
            </button>
          ) : (
            <button type="button" className="btn-primary" onClick={() => setStep(s => s + 1)}>
              {t("onboarding.next")}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
