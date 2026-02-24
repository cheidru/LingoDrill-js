import { useState } from "react"
import type { AudioFile, AudioFileId } from "../../core/domain/types"

interface AudioLibraryProps {
  files: AudioFile[]
  getBlob: (id: AudioFileId) => Promise<Blob>
  onDelete: (id: AudioFileId) => Promise<void>
}

export function AudioLibrary({ files, getBlob, onDelete }: AudioLibraryProps) {
  const [currentUrl, setCurrentUrl] = useState<string | null>(null)

  async function play(id: string) {
    const blob = await getBlob(id)
    const url = URL.createObjectURL(blob)
    setCurrentUrl(url)
  }

  return (
    <div>
      {files.map(file => (
        <div key={file.id}>
          {file.name}
          <button onClick={() => play(file.id)}>Play</button>
          <button onClick={() => onDelete(file.id)}>Delete</button>
        </div>
      ))}

      {currentUrl && <audio src={currentUrl} controls autoPlay />}
    </div>
  )
}