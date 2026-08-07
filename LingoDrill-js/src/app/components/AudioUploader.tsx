// app/components/AudioUploader.tsx

import { useRef } from "react"
import { useT } from "../../utils/i18n"

type UploadHandler = (file: File) => Promise<void> | void

interface AudioUploaderProps {
  onUpload: UploadHandler
}

export function AudioUploader({ onUpload }: AudioUploaderProps) {
  const t = useT()
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div>
      <button onClick={() => inputRef.current?.click()}>
        {t("library.upload")}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        multiple={false}
        style={{ display: "none" }}
        onChange={e => {
          if (e.target.files?.[0]) {
            onUpload(e.target.files[0])
            e.target.value = ""
          }
        }}
      />
    </div>
  )
}
