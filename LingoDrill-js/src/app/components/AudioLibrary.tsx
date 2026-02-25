import { useState, useEffect } from "react"
import type { AudioFile, AudioFileId } from "../../core/domain/types"

interface AudioLibraryProps {
  files: AudioFile[]
  getBlob: (id: AudioFileId) => Promise<Blob | undefined>
  onDelete: (id: AudioFileId) => Promise<void> | void
  selectedFile: AudioFile | null
  selectFile: (id: AudioFileId) => void
}

export function AudioLibrary({ 
  files, 
  getBlob,
  onDelete,
  selectedFile,
  selectFile,
 }: AudioLibraryProps) {
  const [currentUrl, setCurrentUrl] = useState<string | null>(null)
  const [currentFileId, setCurrentFileId] = useState<AudioFileId | null>(null)

  async function play(id: string) {
    const blob = await getBlob(id)
    if (!blob) return

    // убираем старый URL перед созданием нового,
    // если он существует
    if (currentUrl) {
      URL.revokeObjectURL(currentUrl)
    }

    const url = URL.createObjectURL(blob)
    setCurrentUrl(url)
    setCurrentFileId(id)
  }

  // Очищаем память при удалении файла из списка
  async function handleDelete(id: AudioFileId) {
    await onDelete(id)

    if (currentFileId === id) {
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl)
      }
      setCurrentUrl(null)
      setCurrentFileId(null)
    }
  }

  // cleanup при unmount
  useEffect(() => {
    return () => {
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl)
      }
    }
  }, [currentUrl])




  return (
    <div>
      {files.map(file => {
        const isActive = selectedFile?.id === file.id

        return (
          <div
            key={file.id}
            // ToDo Перенести инлайн стиль в css
            style={{
              border: isActive ? "2px solid blue" : "1px solid gray",
              padding: 8,
              marginBottom: 4,
              cursor: "pointer",
            }}
            onClick={() => selectFile(file.id)}
          >
            {file.name}

            <button onClick={(e) => {
              e.stopPropagation()
              play(file.id)
              }
            }>
              Play
            </button>

            <button onClick={(e) => {
              e.stopPropagation()
              handleDelete(file.id)
              }
            }>
              Delete
            </button>
          </div>
        )
      })}

      {currentUrl && (
        <audio
          key={currentFileId} // заставляет пересоздать элемент
          src={currentUrl}
          controls
          autoPlay
        />
      )}
    </div>
  )
}