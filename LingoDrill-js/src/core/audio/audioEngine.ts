// core/audio/audioEngine.ts

/** Фрагмент для воспроизведения (подмножество полей из domain Fragment) */
export type PlayableFragment = {
  start: number   // seconds
  end: number     // seconds
  repeat: number  // number of repetitions
  speed: number   // playback rate (1 = normal)
  /* Pause in seconds after each repeat except the last — the caller's job to
     supply, since it comes from a user setting the engine has no business
     reading. Nothing follows the final repeat: whatever plays next owns the
     pause before it, so putting one here too would double the silence. */
  gap: number
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