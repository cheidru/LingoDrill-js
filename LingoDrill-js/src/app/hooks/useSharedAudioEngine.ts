// app/hooks/useSharedAudioEngine.ts

import { useContext } from "react"
import { AudioEngineContext } from "../contexts/audioEngineContextValue"
import type { AudioEngineContextType } from "../contexts/audioEngineContextValue"

export function useSharedAudioEngine(): AudioEngineContextType {
  const ctx = useContext(AudioEngineContext)
  if (!ctx) throw new Error("useSharedAudioEngine must be used within AudioEngineProvider")
  return ctx
}