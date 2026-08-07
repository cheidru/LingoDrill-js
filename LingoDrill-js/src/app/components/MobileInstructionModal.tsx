// app/components/MobileInstructionModal.tsx

import { useT } from "../../utils/i18n"

interface Props {
  operationName: string
  errorMessage?: string
  onClose: () => void
}

/**
 * Модальное окно с инструкцией для пользователя мобильного устройства.
 * Объясняет как подготовить аудиоданные на десктопе и перенести на мобильное устройство.
 */
export function MobileInstructionModal({ operationName, errorMessage, onClose }: Props) {
  const t = useT()
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-box modal-box--wide"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: 520 }}
      >
        <h3 style={{ marginTop: 0, color: "#d32f2f" }}>
          ⚠ {t("error.heavyFailed", { op: operationName })}
        </h3>

        {errorMessage && (
          <p style={{ fontSize: "0.8rem", color: "#888", fontStyle: "italic", marginBottom: 12 }}>
            {errorMessage}
          </p>
        )}

        <p style={{ marginBottom: 12 }}>{t("mobileHelp.why")}</p>

        <div style={{
          background: "#f5f5f5",
          border: "1px solid #ddd",
          borderRadius: 8,
          padding: 16,
          marginBottom: 16,
          overflowY: "auto",
          maxHeight: "50vh",
        }}>
          <h4 style={{ marginTop: 0, marginBottom: 12 }}>{t("mobileHelp.heading")}</h4>

          {[1, 2, 3, 4, 5].map(n => (
            <div key={n} style={{ marginBottom: 16 }}>
              <strong>{t("mobileHelp.step", { n })}</strong> {t(`mobileHelp.step${n}`)}
            </div>
          ))}

          <div style={{ marginBottom: 16 }}>
            <strong>{t("mobileHelp.step", { n: 6 })}</strong> {t("mobileHelp.step6")}
            <ul style={{ marginTop: 6, marginBottom: 0 }}>
              {["a", "b", "c", "d"].map(k => (
                <li key={k}>{t(`mobileHelp.step6${k}`)}</li>
              ))}
            </ul>
          </div>

          <div>
            <strong>{t("mobileHelp.step", { n: 7 })}</strong> {t("mobileHelp.step7")}
          </div>
        </div>

        <div className="modal-actions">
          <button onClick={onClose} className="btn-primary">
            {t("common.gotIt")}
          </button>
        </div>
      </div>
    </div>
  )
}