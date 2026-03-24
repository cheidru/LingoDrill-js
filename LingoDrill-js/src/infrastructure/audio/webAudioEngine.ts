// infrastructure/audio/webAudioEngine.ts

import type { AudioEngine, PlayableFragment } from "../../core/audio/audioEngine"

/** Пауза в секундах между повторами фрагмента (при repeat > 1) */
// TODO: в дальнейшем сделать настраиваемой через UI настроек
const FRAGMENT_TRAILING_PAUSE = 1

export class WebAudioEngine implements AudioEngine {
  private context = new AudioContext()
  private buffer: AudioBuffer | null = null
  private source: AudioBufferSourceNode | null = null
  private gainNode = this.context.createGain()
  private pauseTimer: ReturnType<typeof setTimeout> | null = null

  private playbackRate = 1
  private playing = false

  private startTime = 0
  private startOffset = 0
  private pausedOffset = 0

  private fragmentEnd: number | null = null

  private onEndedCallback: (() => void) | null = null
  private isStoppingManually = false

  // Монотонно растущий ID сессии воспроизведения.
  // Инкрементируется при stop() и playFragment().
  // Все onended/setTimeout callbacks замыкают текущий playbackId
  // и игнорируются, если он изменился (значит началось новое воспроизведение или был stop).
  private playbackId = 0

  // Состояние для repeat — сохраняется при pause, используется при resume
  private currentFragment: PlayableFragment | null = null
  private repeatsLeft = 0

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
    this.currentFragment = null
    this.repeatsLeft = 0
  }

  /** Загрузка из уже декодированного AudioBuffer (без повторного декодирования) */
  loadFromBuffer(audioBuffer: AudioBuffer): void {
    this.buffer = audioBuffer

    this.startOffset = 0
    this.pausedOffset = 0
    this.fragmentEnd = null
    this.currentFragment = null
    this.repeatsLeft = 0
  }

  private createSource(offset: number, duration?: number) {
    if (!this.buffer) return

    this.source = this.context.createBufferSource()
    this.source.buffer = this.buffer
    this.source.playbackRate.value = this.playbackRate
    this.source.connect(this.gainNode)

    this.startTime = this.context.currentTime
    this.startOffset = offset

    const expectedId = this.playbackId

    this.source.onended = () => {
      if (this.isStoppingManually) return
      if (this.playbackId !== expectedId) return

      this.playing = false
      this.pausedOffset = 0
      this.fragmentEnd = null
      this.currentFragment = null
      this.repeatsLeft = 0

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
    if (this.pauseTimer !== null) {
      clearTimeout(this.pauseTimer)
      this.pauseTimer = null
    }

    if (!this.source) return

    this.isStoppingManually = true

    try {
      this.source.stop()
    } catch (e) {
      console.log(e)
      // source may already be stopped
    }

    this.source.disconnect()
    this.source = null
  }

  play(): void {
    if (!this.buffer) return
    this.stopSourceOnly()

    // Если был фрагмент с repeat — возобновляем с поддержкой повторов
    if (this.currentFragment !== null && this.fragmentEnd !== null && this.pausedOffset < this.fragmentEnd) {
      const remaining = this.fragmentEnd - this.pausedOffset

      this.source = this.context.createBufferSource()
      this.source.buffer = this.buffer
      this.source.playbackRate.value = this.playbackRate
      this.source.connect(this.gainNode)

      this.startTime = this.context.currentTime
      this.startOffset = this.pausedOffset

      this.source.start(0, this.pausedOffset, remaining)
      this.playing = true
      this.isStoppingManually = false

      const fragment = this.currentFragment
      const repsLeft = this.repeatsLeft
      const expectedId = this.playbackId

      this.source.onended = () => {
        if (this.isStoppingManually) return
        if (this.playbackId !== expectedId) return

        if (repsLeft > 0) {
          this.pauseTimer = setTimeout(() => {
            this.pauseTimer = null
            if (this.isStoppingManually) return
            if (this.playbackId !== expectedId) return
            this.playRepeatCycle(fragment, repsLeft)
          }, FRAGMENT_TRAILING_PAUSE * 1000)
        } else {
          this.playing = false
          this.pausedOffset = 0
          this.fragmentEnd = null
          this.currentFragment = null
          this.repeatsLeft = 0
          if (this.onEndedCallback) this.onEndedCallback()
        }
      }
    } else {
      this.createSource(this.pausedOffset)
      this.isStoppingManually = false
    }
  }

  /**
   * Запускает цикл повторов фрагмента.
   * Каждый вызов воспроизводит один повтор, по окончании — следующий (с паузой).
   */
  private playRepeatCycle(fragment: PlayableFragment, repeatsLeft: number) {
    if (!this.buffer || repeatsLeft <= 0) {
      this.playing = false
      this.pausedOffset = 0
      this.fragmentEnd = null
      this.currentFragment = null
      this.repeatsLeft = 0
      if (this.onEndedCallback) this.onEndedCallback()
      return
    }

    const duration = fragment.end - fragment.start

    this.source = this.context.createBufferSource()
    this.source.buffer = this.buffer
    this.source.playbackRate.value = this.playbackRate
    this.source.connect(this.gainNode)

    this.startTime = this.context.currentTime
    this.startOffset = fragment.start
    this.fragmentEnd = fragment.end
    this.currentFragment = fragment
    this.repeatsLeft = repeatsLeft - 1

    this.source.start(0, fragment.start, duration)
    this.playing = true
    this.isStoppingManually = false

    const repsLeft = this.repeatsLeft
    const expectedId = this.playbackId

    this.source.onended = () => {
      if (this.isStoppingManually) return
      if (this.playbackId !== expectedId) return

      if (repsLeft > 0) {
        this.pauseTimer = setTimeout(() => {
          this.pauseTimer = null
          if (this.isStoppingManually) return
          if (this.playbackId !== expectedId) return
          this.playRepeatCycle(fragment, repsLeft)
        }, FRAGMENT_TRAILING_PAUSE * 1000)
      } else {
        this.playing = false
        this.pausedOffset = 0
        this.fragmentEnd = null
        this.currentFragment = null
        this.repeatsLeft = 0
        if (this.onEndedCallback) this.onEndedCallback()
      }
    }
  }

  playFragment(fragment: PlayableFragment): void {
    if (!this.buffer) return

    this.stopSourceOnly()
    this.playbackId++  // инвалидируем все старые onended/setTimeout
    this.currentFragment = fragment
    this.repeatsLeft = fragment.repeat

    this.playRepeatCycle(fragment, this.repeatsLeft)
  }

  pause(): void {
    if (!this.source) return

    const elapsed =
      (this.context.currentTime - this.startTime) * this.playbackRate

    this.pausedOffset = this.startOffset + elapsed

    this.stopSourceOnly()
    this.playing = false
    // playbackId НЕ инкрементируется — resume должен продолжить ту же сессию
    // isStoppingManually остаётся true — onended должен быть проигнорирован
    // pausedOffset, fragmentEnd, currentFragment, repeatsLeft сохранены
  }

  stop(): void {
    this.stopSourceOnly()
    this.playbackId++  // инвалидируем все старые onended/setTimeout
    this.playing = false
    this.pausedOffset = 0
    this.startOffset = 0
    this.fragmentEnd = null
    this.currentFragment = null
    this.repeatsLeft = 0
  }

  seekTo(time: number): void {
    if (!this.buffer) return
    const wasPlaying = this.playing
    this.stopSourceOnly()
    this.playbackId++  // инвалидируем старые callbacks
    this.pausedOffset = Math.max(0, Math.min(time, this.buffer.duration))
    this.fragmentEnd = null
    this.currentFragment = null
    this.repeatsLeft = 0
    if (wasPlaying) {
      this.createSource(this.pausedOffset)
      this.playing = true
    }
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