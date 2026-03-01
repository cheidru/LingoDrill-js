import type { AudioEngine, Fragment } from "../../core/audio/audioEngine"

export class WebAudioEngine implements AudioEngine {
  private context = new AudioContext()
  private buffer: AudioBuffer | null = null
  private source: AudioBufferSourceNode | null = null
  private playbackRate = 1
  private playing = false

  // Для корректного currentTime
  private startOffset = 0
  private startTime = 0
  private fragmentEnd: number | null = null

  private onEndedCallback: (() => void) | null = null
  private gainNode = this.context.createGain()

  constructor() {
    this.gainNode.connect(this.context.destination)
  }

  setOnEnded(cb: () => void) {
    this.onEndedCallback = cb
  }

  setVolume(volume: number) {
    this.gainNode.gain.value = volume
  }

  async load(blob: Blob): Promise<void> {
    const arrayBuffer = await blob.arrayBuffer()
    this.buffer = await this.context.decodeAudioData(arrayBuffer)
    this.startOffset = 0
    this.fragmentEnd = null
  }

  play(): void {
    if (!this.buffer) return
    this.stop()

    this.source = this.context.createBufferSource()
    this.source.buffer = this.buffer
    this.source.playbackRate.value = this.playbackRate
    this.source.connect(this.gainNode)

    this.startTime = this.context.currentTime
    this.startOffset = 0
    this.fragmentEnd = null

    this.source.start(0, this.startOffset)
    this.playing = true

    this.source.onended = () => {
      this.playing = false
      this.fragmentEnd = null
      if (this.onEndedCallback) this.onEndedCallback()
    }
  }

  playFragment(fragment: Fragment): void {
    if (!this.buffer) return
    this.stop()

    const duration = fragment.end - fragment.start
    let repeatsLeft = fragment.repeat

    const playOnce = () => {
      if (!this.buffer) return
      if (repeatsLeft <= 0) return

      this.source = this.context.createBufferSource()
      this.source.buffer = this.buffer
      this.source.playbackRate.value = this.playbackRate
      this.source.connect(this.gainNode)

      this.startTime = this.context.currentTime
      this.startOffset = fragment.start
      this.fragmentEnd = fragment.end

      this.source.start(0, fragment.start, duration)
      this.playing = true

      this.source.onended = () => {
        repeatsLeft--
        if (repeatsLeft > 0) {
          playOnce()
        } else {
          this.playing = false
          this.fragmentEnd = null
          if (this.onEndedCallback) this.onEndedCallback()
        }
      }
    }

    playOnce()
  }

  stop(): void {
    if (this.source) {
      try {
        this.source.stop()
      } catch {
        /* игнор если уже остановлен */
      }
      this.source.disconnect()
      this.source = null
    }
    this.playing = false
    this.fragmentEnd = null
  }

  pause(): void {
    this.stop()
  }

  setPlaybackRate(rate: number): void {
    this.playbackRate = rate
  }

  getCurrentTime(): number {
    if (!this.buffer) return 0
    if (!this.source) return this.startOffset
    const elapsed = (this.context.currentTime - this.startTime) * this.playbackRate
    let time = this.startOffset + elapsed
    if (this.fragmentEnd !== null && time > this.fragmentEnd) {
      time = this.fragmentEnd
    }
    return time
  }

  getDuration(): number {
    return this.buffer?.duration ?? 0
  }

  isPlaying(): boolean {
    return this.playing
  }

  destroy(): void {
    this.stop()
    this.context.close()
  }
}