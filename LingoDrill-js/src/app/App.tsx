import { useAudioLibrary } from "./hooks/useAudioLibrary"
import { AudioUploader } from "./components/AudioUploader"
import { AudioLibrary } from "./components/AudioLibrary"

export default function App() {
  const { 
    files,
    addFile,
    removeFile,
    getBlob,
    selectFile,
    selectedFile,
    isLoading,
    error
  } = useAudioLibrary()

  return (
    <div>
      <h1>Language Trainer</h1>

      {isLoading && <p>Loading...</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}

      <AudioUploader onUpload={addFile} />

      <AudioLibrary
        files={files}
        selectedFile={selectedFile}
        selectFile={selectFile}
        getBlob={getBlob}
        onDelete={removeFile}
      />
    </div>
  )
}