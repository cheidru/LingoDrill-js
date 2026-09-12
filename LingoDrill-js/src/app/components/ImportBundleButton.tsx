// app/components/ImportBundleButton.tsx

import { useState, useCallback, useRef } from "react"
import { importBundle } from "../../core/bundle/importBundle"
import { BundleParseError, readBundleFile } from "../../core/bundle/parseBundle"
import type { BundleFile } from "../../core/bundle/types"
import { useT, type TFunc } from "../../utils/i18n"

/* Файл, который выбрали, но не смогли прочитать: без его имени и начала
   «это не бандл» не проверить — ни пользователю, ни в сообщении об ошибке. */
interface ImportError {
  message: string
  fileName: string
  fileSize: number
  /** Начало файла — только когда его вообще удалось прочитать как текст. */
  excerpt: string | null
  /** Адрес страницы, снимок которой подсунули вместо бандла. */
  savedFrom: string | null
}

/* Разбор бандла даёт код причины, а не текст: сообщение о том, что вместо
   .lingodrill выбрали сохранённую веб-страницу, должно быть на языке
   интерфейса. Всё остальное показываем как есть. */
function describeError(err: unknown, file: File, t: TFunc): ImportError {
  const base = { fileName: file.name, fileSize: file.size }
  if (err instanceof BundleParseError) {
    return {
      ...base,
      message: t(`bundle.error.${err.reason}`),
      excerpt: err.excerpt,
      savedFrom: err.savedFrom,
    }
  }
  return {
    ...base,
    message: err instanceof Error ? err.message : t("bundle.unknownError"),
    excerpt: null,
    savedFrom: null,
  }
}

function formatSize(bytes: number): string {
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`
  if (bytes >= 1e3) return `${Math.round(bytes / 1e3)} KB`
  return `${bytes} B`
}

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
  const [error, setError] = useState<ImportError | null>(null)

  const bundleInputRef = useRef<HTMLInputElement>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)
  const pendingBundleRef = useRef<BundleFile | null>(null)

  const handleBundleSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Reset input so same file can be re-selected
    if (bundleInputRef.current) bundleInputRef.current.value = ""

    setError(null)
    setImporting(true)

    try {
      const bundle = await readBundleFile(file)

      if (!bundle.manifest.audio?.audioIncluded && !bundle.audioData) {
        // Бандл без аудио — нужно попросить отдельный аудиофайл
        pendingBundleRef.current = bundle
        setNeedAudio(true)
        setImporting(false)
        return
      }

      const result = await importBundle(bundle)
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
      setError(describeError(err, file, t))
    } finally {
      setImporting(false)
    }
  }, [onImportComplete, t])

  const handleAudioForBundle = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const audioFile = e.target.files?.[0]
    if (!audioFile || !pendingBundleRef.current) return

    if (audioInputRef.current) audioInputRef.current.value = ""

    setError(null)
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
      setError(describeError(err, audioFile, t))
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

      {/* Пустой accept открывает на Android камеру и галерею, поэтому типы
          перечислены. Расширение «.lingodrill» системе неизвестно — файл
          приходит как application/octet-stream, и без него он в списке
          оказался бы неактивным. Что именно выбрали, разбирает readBundleFile. */}
      <input
        ref={bundleInputRef}
        type="file"
        accept="application/octet-stream,application/json,text/plain,.lingodrill"
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

      {/* Ошибка импорта */}
      {error && (
        <div className="modal-overlay" onClick={() => setError(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>{t("bundle.importFailedTitle")}</h3>
            <p className="import-bundle__error-text">{error.message}</p>
            {error.savedFrom && (
              <p className="import-bundle__error-file">
                {t("bundle.errorSavedFrom", { url: error.savedFrom })}
              </p>
            )}
            <p className="import-bundle__error-file">
              {t("bundle.errorFile", { name: error.fileName, size: formatSize(error.fileSize) })}
            </p>
            {error.excerpt && (
              <>
                <p className="import-bundle__error-file">{t("bundle.errorExcerpt")}</p>
                <pre className="import-bundle__error-excerpt">{error.excerpt}</pre>
              </>
            )}
            <div className="modal-actions">
              <button onClick={() => setError(null)} className="btn-primary">
                {t("common.ok")}
              </button>
            </div>
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