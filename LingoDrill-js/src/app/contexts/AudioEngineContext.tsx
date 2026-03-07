// app/contexts/AudioEngineContext.tsx

import { useAudioEngine } from "../hooks/useAudioEngine"
import { useAudioLibrary } from "../hooks/useAudioLibrary"
import { AudioEngineContext } from "./audioEngineContextValue"
import type { AudioEngineContextType } from "./audioEngineContextValue"

export function AudioEngineProvider({ children }: { children: React.ReactNode }) {
  const library = useAudioLibrary()
  const engine = useAudioEngine(library.getBlob)

  const value: AudioEngineContextType = {
    ...engine,
    files: library.files,
    selectedFile: library.selectedFile,
    isLoading: library.isLoading,
    error: library.error,
    addFile: library.addFile,
    removeFile: library.removeFile,
    selectFile: library.selectFile,
    getBlob: library.getBlob,
  }

  return (
    <AudioEngineContext.Provider value={value}>
      {children}
    </AudioEngineContext.Provider>
  )
}