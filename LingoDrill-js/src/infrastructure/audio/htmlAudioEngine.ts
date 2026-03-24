// infrastructure/audio/htmlAudioEngine.ts

/**
 * Движок воспроизведения на основе HTMLAudioElement.
 * Используется для воспроизведения целого файла (мгновенный старт, браузер стримит сам).
 * Не поддерживает playFragment — для этого используется WebAudioEngine.
 */
export class HtmlAudioEngine {
  private audio: HTMLAudioElement = new Audio()
  private objectUrl: string | null = null
  private onEndedCallback: (() => void) | null = null

  constructor() {
    this.audio.addEventListener("ended", () => {
      this.onEndedCallback?.()
    })
  }

  setOnEnded(cb: () => void) {
    this.onEndedCallback = cb
  }

  /** Загружает blob — мгновенно, без decodeAudioData */
  load(blob: Blob): void {
    this.stop()
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl)
    }
    this.objectUrl = URL.createObjectURL(blob)
    this.audio.src = this.objectUrl
    this.audio.load()
  }

  play(): void {
    this.audio.play()
  }

  pause(): void {
    this.audio.pause()
  }

  stop(): void {
    console.log('[HtmlEngine] stop() called, paused:', this.audio.paused, 'currentTime:', this.audio.currentTime)
    this.audio.pause()
    this.audio.currentTime = 0
  }

  seekTo(time: number): void {
    this.audio.currentTime = Math.max(0, Math.min(time, this.getDuration()))
  }

  setVolume(volume: number): void {
    this.audio.volume = volume
  }

  setPlaybackRate(rate: number): void {
    this.audio.playbackRate = rate
  }

  getCurrentTime(): number {
    return this.audio.currentTime
  }

  getDuration(): number {
    const d = this.audio.duration
    return isNaN(d) ? 0 : d
  }

  isPlaying(): boolean {
    return !this.audio.paused && !this.audio.ended
  }

  destroy(): void {
    this.stop()
    this.audio.src = ""
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl)
      this.objectUrl = null
    }
  }
}