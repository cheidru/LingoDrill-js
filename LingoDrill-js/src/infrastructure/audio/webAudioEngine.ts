// infrastructure/audio/webAudioEngine.ts

import type { AudioEngine, Fragment } from "../../core/audio/audioEngine"

export class WebAudioEngine implements AudioEngine {
  private context = new AudioContext()
  private buffer: AudioBuffer | null = null
  private source: AudioBufferSourceNode | null = null
  private gainNode = this.context.createGain()

  private playbackRate = 1
  private playing = false

  private startTime = 0
  private startOffset = 0
  private pausedOffset = 0

  private fragmentEnd: number | null = null

  private onEndedCallback: (() => void) | null = null
  private isStoppingManually = false

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
    this.pausedOffset = 0
    this.fragmentEnd = null
  }

  private createSource(offset: number, duration?: number) {
    if (!this.buffer) return

    this.source = this.context.createBufferSource()
    this.source.buffer = this.buffer
    this.source.playbackRate.value = this.playbackRate
    this.source.connect(this.gainNode)

    this.startTime = this.context.currentTime
    this.startOffset = offset

    this.source.onended = () => {
      if (this.isStoppingManually) return

      this.playing = false
      this.pausedOffset = 0
      this.fragmentEnd = null

      if (this.onEndedCallback) this.onEndedCallback()
    }

    if (duration !== undefined) {
      this.source.start(0, offset, duration)
    } else {
      this.source.start(0, offset)
    }

    this.playing = true
  }

  private stopSourceOnly() {
    if (!this.source) return

    this.isStoppingManually = true

    try {
      this.source.stop()
    } catch(e) {console.log(e)}

    this.source.disconnect()
    this.source = null

    // this.isStoppingManually = false
  }

  play(): void {
    if (!this.buffer) return
    this.stopSourceOnly()
    this.createSource(this.pausedOffset)
  }

  playFragment(fragment: Fragment): void {
    if (!this.buffer) return

    this.stopSourceOnly()

    const duration = fragment.end - fragment.start
    const repeatsLeft = fragment.repeat

    const playOnce = () => {
      if (!this.buffer || repeatsLeft <= 0) return

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
        if (this.isStoppingManually) {
          this.isStoppingManually = false
          return
        }

        this.playing = false
        this.pausedOffset = 0
        this.fragmentEnd = null

        if (this.onEndedCallback) this.onEndedCallback()
      }   
    }

    playOnce()
  }

  pause(): void {
      if (!this.source) return
    const elapsed =
      (this.context.currentTime - this.startTime) * this.playbackRate

    this.pausedOffset = this.startOffset + elapsed

    this.stopSourceOnly()
    this.playing = false
  }

  stop(): void {
    this.stopSourceOnly()
    this.playing = false
    this.pausedOffset = 0
    this.startOffset = 0
    this.fragmentEnd = null
  }

  setPlaybackRate(rate: number): void {
    this.playbackRate = rate
  }

  getCurrentTime(): number {
    if (!this.buffer) return 0

    if (!this.playing) {
      return this.pausedOffset
    }

    const elapsed =
      (this.context.currentTime - this.startTime) * this.playbackRate

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