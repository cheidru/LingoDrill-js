// core/audio/audioEngine.ts

/** Фрагмент для воспроизведения (подмножество полей из domain Fragment) */
export type PlayableFragment = {
  start: number   // seconds
  end: number     // seconds
  repeat: number  // number of repetitions
}

export interface AudioEngine {  
  load(blob: Blob): Promise<void>  
  play(): void
  pause(): void
  stop(): void  
  seekTo(time: number): void
  playFragment(fragment: PlayableFragment): void
  setPlaybackRate(rate: number): void
  getCurrentTime(): number
  getDuration(): number
  isPlaying(): boolean  
  destroy(): void
}