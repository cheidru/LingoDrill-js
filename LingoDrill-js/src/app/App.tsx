import { useAudioLibrary } from "./hooks/useAudioLibrary"
import { AudioUploader } from "./components/AudioUploader"
import { AudioLibrary } from "./components/AudioLibrary"

export default function App() {
  const { files, addFile, removeFile, getBlob } = useAudioLibrary()

  return (
    <div>
      <h1>Language Trainer</h1>
      <AudioUploader onUpload={addFile} />
      <AudioLibrary
        files={files}
        getBlob={getBlob}
        onDelete={removeFile}
      />
    </div>
  )
}