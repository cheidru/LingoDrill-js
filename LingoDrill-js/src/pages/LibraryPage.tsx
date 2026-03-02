// pages/LibraryPage.tsx

import { useCallback } from "react"
import { useAudioLibrary } from "../app/hooks/useAudioLibrary"
import { useAudioEngine } from "../app/hooks/useAudioEngine"
import { AudioUploader } from "../app/components/AudioUploader"
import { AudioLibrary } from "../app/components/AudioLibrary"
import { AudioPlayer } from "../app/components/AudioPlayer"

export default function LibraryPage() {
  const {
    files,
    selectedFile,
    isLoading,
    error,
    addFile,
    removeFile,
    selectFile,
    getBlob,
  } = useAudioLibrary()

  const {
    isReady,
    isPlaying,
    duration,
    loadById,
    play,
    stop,
    setVolume,
    volume,
    pause
  } = useAudioEngine(getBlob)

  // Единственная точка загрузки engine
  const handleSelect = useCallback(
    async (id: string) => {
      selectFile(id)
      await loadById(id)
    },
    [selectFile, loadById]
  )

  const handleDelete = useCallback(
    async (id: string) => {
      await removeFile(id)

      if (selectedFile?.id === id) {
        selectFile(null)
        await loadById(null)
      }
    },
    [removeFile, selectedFile?.id, selectFile, loadById]
  )

  return (
    <div>
      <h1>LingoDrill</h1>

      {isLoading && <p>Loading...</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}

      <AudioUploader onUpload={addFile} />

      <AudioLibrary
        files={files}
        selectedFile={selectedFile}
        selectFile={(id) => void handleSelect(id)}
        onDelete={(id) => void handleDelete(id)}
      />

      {selectedFile && (
        <div style={{ marginTop: 20 }}>
          <AudioPlayer
            fileId={selectedFile.id}
            isReady={isReady}
            isPlaying={isPlaying}
            duration={duration}
            onPlay={play}
            onPause={pause}
            onStop={stop}
            volume={volume}
            onVolumeChange={setVolume}
          />
        </div>
      )}
    </div>
  )
}

// Safari требует user interaction для AudioContext.
// Если появится ошибка "AudioContext was not allowed 
// to start", нужно будет вызывать context.resume() 
// внутри play().