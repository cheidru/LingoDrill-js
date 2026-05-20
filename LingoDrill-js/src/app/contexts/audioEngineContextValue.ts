// app/contexts/audioEngineContextValue.ts
//
// AudioEngineContextType — возвращаемое значение useAudioEngine плюс часть
// useAudioLibrary (список файлов, getBlob и т.п.).

import { createContext } from "react"
import type { useAudioEngine } from "../hooks/useAudioEngine"
import type { useAudioLibrary } from "../hooks/useAudioLibrary"

export type AudioEngineContextType = ReturnType<typeof useAudioEngine> & {
  files: ReturnType<typeof useAudioLibrary>["files"]
  selectedFile: ReturnType<typeof useAudioLibrary>["selectedFile"]
  isLoading: ReturnType<typeof useAudioLibrary>["isLoading"]
  error: ReturnType<typeof useAudioLibrary>["error"]
  addFile: ReturnType<typeof useAudioLibrary>["addFile"]
  removeFile: ReturnType<typeof useAudioLibrary>["removeFile"]
  selectFile: ReturnType<typeof useAudioLibrary>["selectFile"]
  getBlob: ReturnType<typeof useAudioLibrary>["getBlob"]
}

export const AudioEngineContext = createContext<AudioEngineContextType | null>(null)