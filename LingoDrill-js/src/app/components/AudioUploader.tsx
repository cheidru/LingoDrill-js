// app/components/AudioUploader.tsx

import { useRef } from "react"

type UploadHandler = (file: File) => Promise<void> | void

interface AudioUploaderProps {
  onUpload: UploadHandler
}

export function AudioUploader({ onUpload }: AudioUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div>
      <button
        className="btn-primary"
        onClick={() => inputRef.current?.click()}
      >
        + Upload audio
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
