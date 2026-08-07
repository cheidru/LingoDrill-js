// pages/LibraryPage.tsx
//
// ИЗМЕНЕНИЕ: добавлена кнопка ImportBundleButton для загрузки .lingodrill бандлов
// ИЗМЕНЕНИЕ: добавлен stop playback при уходе со страницы (unmount)

import { useCallback, useEffect, useRef } from "react"
import { useSharedAudioEngine } from "../app/hooks/useSharedAudioEngine"
import { AudioUploader } from "../app/components/AudioUploader"
import { AudioLibrary } from "../app/components/AudioLibrary"
import { AudioPlayer } from "../app/components/AudioPlayer"
import { ImportBundleButton } from "../app/components/ImportBundleButton"
import { useT } from "../utils/i18n"

export default function LibraryPage() {
  const t = useT()
  const { files, selectedFile, isLoading, error, addFile, removeFile, selectFile, isReady, isPlaying, duration, currentTime, loadById, play, stop, seekTo, setVolume, volume, pause } = useSharedAudioEngine()

  // Stop playback when leaving the page (unmount)
  const stopRef = useRef(stop)
  useEffect(() => { stopRef.current = stop }, [stop])
  useEffect(() => {
    return () => {
      console.log("[LibraryPage] unmounting, stopping playback")
      stopRef.current()
    }
  }, [])

  const handleSelect = useCallback(async (id: string) => { selectFile(id); await loadById(id) }, [selectFile, loadById])
  const handleDelete = useCallback(async (id: string) => {
    await removeFile(id)
    if (selectedFile?.id === id) { selectFile(null) }
  }, [removeFile, selectedFile?.id, selectFile])

  // Перезагрузить список файлов после импорта бандла
  const handleImportComplete = useCallback(() => {
    // Вызываем перезагрузку файлов — через window.location.reload
    // так как useAudioLibrary загружает файлы при монтировании
    window.location.reload()
  }, [])

  const isMobile = typeof document !== "undefined" && document.documentElement.classList.contains("mobile")

  return (
    <div className="page">
      <h2>{t("library.title")}</h2>
      {isLoading && <p>{t("common.loading")}</p>}
      {error && <p style={{ color: "var(--color-danger)" }}>{error}</p>}

      <AudioUploader onUpload={addFile} />

      {/* Import bundle button — mobile only */}
      {isMobile && (
        <div style={{ marginTop: 16, marginBottom: 16 }}>
          <ImportBundleButton onImportComplete={handleImportComplete} />
        </div>
      )}

      <AudioLibrary files={files} selectedFile={selectedFile} selectFile={id => void handleSelect(id)} onDelete={id => void handleDelete(id)} />
      {selectedFile && (
        <div style={{ marginTop: 20 }}>
          <AudioPlayer fileId={selectedFile.id} isReady={isReady} isPlaying={isPlaying} duration={duration} currentTime={currentTime} onPlay={play} onPause={pause} onStop={stop} onSeek={seekTo} volume={volume} onVolumeChange={setVolume} />
        </div>
      )}
    </div>
  )
}