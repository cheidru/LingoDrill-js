// core/audio/audioEngine.ts
export interface Fragment {
  start: number   // seconds
  end: number     // seconds
  repeat: number  // number of repetitions
}

export interface AudioEngine {  
  load(blob: Blob): Promise<void>  
  play(): void
  pause(): void
  stop(): void  
  playFragment(fragment: Fragment): void
  setPlaybackRate(rate: number): void
  getCurrentTime(): number
  getDuration(): number
  isPlaying(): boolean  
  destroy(): void
}