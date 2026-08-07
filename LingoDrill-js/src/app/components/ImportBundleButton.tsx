// app/components/ImportBundleButton.tsx

import { useState, useCallback, useRef } from "react"
import { importBundle } from "../../core/bundle/importBundle"
import { useT } from "../../utils/i18n"

interface Props {
  /** Перезагрузить список файлов после импорта */
  onImportComplete: () => void
}

export function ImportBundleButton({ onImportComplete }: Props) {
  const t = useT()
  const [importing, setImporting] = useState(false)
  const [showResult, setShowResult] = useState(false)
  const [resultMessage, setResultMessage] = useState("")
  const [needAudio, setNeedAudio] = useState(false)

  const bundleInputRef = useRef<HTMLInputElement>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)
  const pendingBundleRef = useRef<Blob | null>(null)

  const handleBundleSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Reset input so same file can be re-selected
    if (bundleInputRef.current) bundleInputRef.current.value = ""

    setImporting(true)

    try {
      const text = await file.text()
      const parsed = JSON.parse(text)

      if (!parsed.manifest?.audio?.audioIncluded && !parsed.audioData) {
        // Бандл без аудио — нужно попросить отдельный аудиофайл
        pendingBundleRef.current = file
        setNeedAudio(true)
        setImporting(false)
        return
      }

      const result = await importBundle(file)
      setResultMessage(
        `${t("bundle.imported", { name: result.audioName })}\n` +
        `${t.n("bundle.sequences", result.sequenceCount)}, ${t.n("bundle.subtitleFiles", result.subtitleCount)}\n` +
        `${t("bundle.waveform", { state: t(result.waveformLoaded ? "bundle.waveform.loaded" : "bundle.waveform.notIncluded") })}\n` +
        `${t("bundle.audio", { state: t(result.audioImported ? "bundle.audio.imported" : "bundle.audio.notIncluded") })}`
      )
      setShowResult(true)
      onImportComplete()
    } catch (err) {
      console.error("Import failed:", err)
      alert(t("bundle.importFailed", { message: err instanceof Error ? err.message : t("bundle.unknownError") }))
    } finally {
      setImporting(false)
    }
  }, [onImportComplete, t])

  const handleAudioForBundle = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const audioFile = e.target.files?.[0]
    if (!audioFile || !pendingBundleRef.current) return

    if (audioInputRef.current) audioInputRef.current.value = ""

    setImporting(true)
    setNeedAudio(false)

    try {
      const result = await importBundle(pendingBundleRef.current, audioFile)
      pendingBundleRef.current = null
      setResultMessage(
        `${t("bundle.imported", { name: result.audioName })}\n` +
        `${t.n("bundle.sequences", result.sequenceCount)}, ${t.n("bundle.subtitleFiles", result.subtitleCount)}\n` +
        `${t("bundle.waveform", { state: t(result.waveformLoaded ? "bundle.waveform.loaded" : "bundle.waveform.notIncluded") })}\n` +
        `${t("bundle.audio", { state: t("bundle.audio.fromSeparate") })}`
      )
      setShowResult(true)
      onImportComplete()
    } catch (err) {
      console.error("Import failed:", err)
      alert(t("bundle.importFailed", { message: err instanceof Error ? err.message : t("bundle.unknownError") }))
    } finally {
      setImporting(false)
    }
  }, [onImportComplete, t])

  return (
    <div className="import-bundle">
      <div className="import-bundle__row">
        <button
          onClick={() => bundleInputRef.current?.click()}
          disabled={importing}
        >
          {importing ? t("bundle.importing") : t("bundle.import")}
        </button>
        <span className="import-bundle__hint">
          {t("bundle.importHint")}
        </span>
      </div>

      <input
        ref={bundleInputRef}
        type="file"
        accept=".lingodrill,application/json"
        style={{ display: "none" }}
        onChange={handleBundleSelect}
      />

      {/* Диалог для отдельного аудио, если бандл без аудио */}
      {needAudio && (
        <div className="modal-overlay" onClick={() => { setNeedAudio(false); pendingBundleRef.current = null }}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>{t("bundle.audioNeeded")}</h3>
            <p>{t("bundle.audioNeededBody")}</p>
            <div className="modal-actions">
              <button
                onClick={() => audioInputRef.current?.click()}
                className="btn-primary"
              >
                {t("bundle.selectAudio")}
              </button>
              <button
                onClick={() => { setNeedAudio(false); pendingBundleRef.current = null }}
                style={{ padding: "6px 16px" }}
              >
                {t("common.cancel")}
              </button>
            </div>
            <input
              ref={audioInputRef}
              type="file"
              accept="audio/*"
              style={{ display: "none" }}
              onChange={handleAudioForBundle}
            />
          </div>
        </div>
      )}

      {/* Результат импорта */}
      {showResult && (
        <div className="modal-overlay" onClick={() => setShowResult(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>{t("bundle.importComplete")}</h3>
            <pre style={{
              whiteSpace: "pre-wrap",
              fontSize: "0.9rem",
              background: "#f5f5f5",
              padding: 12,
              borderRadius: 4,
              textAlign: "left",
            }}>
              {resultMessage}
            </pre>
            <div className="modal-actions">
              <button onClick={() => setShowResult(false)} className="btn-primary">
                {t("common.ok")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}