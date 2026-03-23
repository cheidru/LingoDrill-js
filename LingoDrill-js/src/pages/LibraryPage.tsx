// pages/LibraryPage.tsx
//
// ИЗМЕНЕНИЕ: добавлена кнопка ImportBundleButton для загрузки .lingodrill бандлов

import { useCallback } from "react"
import { useSharedAudioEngine } from "../app/hooks/useSharedAudioEngine"
import { AudioUploader } from "../app/components/AudioUploader"
import { AudioLibrary } from "../app/components/AudioLibrary"
import { AudioPlayer } from "../app/components/AudioPlayer"
import { ImportBundleButton } from "../app/components/ImportBundleButton"

export default function LibraryPage() {
  const { files, selectedFile, isLoading, error, addFile, removeFile, selectFile, isReady, isPlaying, duration, currentTime, loadById, play, stop, seekTo, setVolume, volume, pause } = useSharedAudioEngine()

  const handleSelect = useCallback(async (id: string) => { selectFile(id); await loadById(id) }, [selectFile, loadById])
  const handleDelete = useCallback(async (id: string) => {
    await removeFile(id)
    if (selectedFile?.id === id) { selectFile(null); await loadById(null) }
  }, [removeFile, selectedFile?.id, selectFile, loadById])

  // Перезагрузить список файлов после импорта бандла
  const handleImportComplete = useCallback(() => {
    // Вызываем перезагрузку файлов — через window.location.reload
    // так как useAudioLibrary загружает файлы при монтировании
    window.location.reload()
  }, [])

  return (
    <div className="page">
      <h2>Audio Library</h2>
      {isLoading && <p>Loading...</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}

      <AudioUploader onUpload={addFile} />

      {/* Import bundle button */}
      <div style={{ marginTop: 12, marginBottom: 12 }}>
        <ImportBundleButton onImportComplete={handleImportComplete} />
      </div>

      <AudioLibrary files={files} selectedFile={selectedFile} selectFile={id => void handleSelect(id)} onDelete={id => void handleDelete(id)} />
      {selectedFile && (
        <div style={{ marginTop: 20 }}>
          <AudioPlayer fileId={selectedFile.id} isReady={isReady} isPlaying={isPlaying} duration={duration} currentTime={currentTime} onPlay={play} onPause={pause} onStop={stop} onSeek={seekTo} volume={volume} onVolumeChange={setVolume} />
        </div>
      )}
    </div>
  )
}