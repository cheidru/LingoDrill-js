// app/components/ExportBundleButton.tsx

import { useState, useCallback } from "react"
import { exportBundle } from "../../core/bundle/exportBundle"
import type { Sequence, SubtitleFile } from "../../core/domain/types"
import { useT } from "../../utils/i18n"

interface Props {
  audioId: string | null
  audioName: string
  getBlob: (id: string) => Promise<Blob | null>
  waveformData: number[]
  sequences: Sequence[]
  subtitleFiles: SubtitleFile[]
  disabled?: boolean
}

export function ExportBundleButton({
  audioId,
  audioName,
  getBlob,
  waveformData,
  sequences,
  subtitleFiles,
  disabled,
}: Props) {
  const t = useT()
  const [exporting, setExporting] = useState(false)
  const [includeAudio, setIncludeAudio] = useState(true)

  const handleExport = useCallback(async () => {
    if (!audioId || exporting) return

    setExporting(true)

    try {
      const blob = await getBlob(audioId)
      if (!blob) {
        alert(t("bundle.audioNotFound"))
        return
      }

      const bundleBlob = await exportBundle({
        audioBlob: blob,
        audioName,
        audioMimeType: blob.type || "audio/mpeg",
        audioSize: blob.size,
        waveform: waveformData,
        sequences,
        subtitleFiles,
        includeAudio,
      })

      // Trigger download
      const url = URL.createObjectURL(bundleBlob)
      const a = document.createElement("a")
      const baseName = audioName.replace(/\.[^.]+$/, "")
      a.href = url
      a.download = `${baseName}.lingodrill`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error("Export failed:", err)
      alert(t("bundle.exportFailed"))
    } finally {
      setExporting(false)
    }
  }, [audioId, exporting, getBlob, audioName, waveformData, sequences, subtitleFiles, includeAudio, t])

  return (
    <>
      <button
        onClick={handleExport}
        disabled={disabled || exporting || !audioId}
      >
        {exporting ? t("bundle.exporting") : t("bundle.export")}
      </button>
      <label className="export-bundle__checkbox">
        <input
          type="checkbox"
          checked={includeAudio}
          onChange={e => setIncludeAudio(e.target.checked)}
        />
        <span style={{ fontSize: "0.85rem" }}>{t("bundle.includeAudio")}</span>
      </label>
    </>
  )
}