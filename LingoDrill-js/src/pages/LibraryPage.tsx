// pages/LibraryPage.tsx

import { useCallback } from "react"
import { useSharedAudioEngine } from "../app/hooks/useSharedAudioEngine"
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
    isReady,
    isPlaying,
    duration,
    currentTime,
    loadById,
    play,
    stop,
    seekTo,
    setVolume,
    volume,
    pause,
  } = useSharedAudioEngine()

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
    <div style={{ padding: 24 }}>
      <h2>Audio Library</h2>

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
            currentTime={currentTime}
            onPlay={play}
            onPause={pause}
            onStop={stop}
            onSeek={seekTo}
            volume={volume}
            onVolumeChange={setVolume}
          />
        </div>
      )}
    </div>
  )
}