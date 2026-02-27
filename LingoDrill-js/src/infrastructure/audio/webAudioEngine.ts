import type { AudioEngine, Fragment } from "../../core/audio/audioEngine"


export class WebAudioEngine implements AudioEngine {
  private context = new AudioContext()
  private buffer: AudioBuffer | null = null
  // В Web Audio API AudioBufferSourceNode можно использовать только один раз
  // Его нельзя "перезапустить". При каждом play создаётся 
  // новый AudioBufferSourceNode
  private source: AudioBufferSourceNode | null = null
  private playbackRate = 1
  private volume = 1
  private playing = false

  // Громкость в Web Audio регулируется через GainNode, 
  // а не через AudioBufferSourceNode
  // Схема графа AudioBufferSourceNode → GainNode → destination
  private gainNode = this.context.createGain()

  private stopRequested = false
  private onEndedCallback?: () => void

  constructor() {
    // подключаем gain к выходу один раз
    this.gainNode.connect(this.context.destination)
    this.gainNode.gain.value = this.volume
  }

  setOnEnded(callback: () => void) {
    this.onEndedCallback = callback
  }

  // Декодирует в AudioBuffer
  async load(blob: Blob): Promise<void> {    
    const arrayBuffer = await blob.arrayBuffer()
    this.buffer = await this.context.decodeAudioData(arrayBuffer)
  }

  private createSource(): AudioBufferSourceNode {
    if (!this.buffer) {
      throw new Error("Audio buffer not loaded")
    }

    const source = this.context.createBufferSource()
    source.buffer = this.buffer
    source.playbackRate.value = this.playbackRate

    // 🔹 теперь подключаем к gainNode, а не напрямую
    source.connect(this.gainNode)

    return source
  }

  // Проигрывает с текущей позиции
  play(): void {
    if (!this.buffer) return

    this.stop()
    this.stopRequested = false

    this.source = this.createSource()
    this.source.start()

    this.playing = true

    this.source.onended = () => {
      if (this.stopRequested) return
      this.playing = false
      this.onEndedCallback?.()
    }
  }

  // Запускает scheduling конкретного фрагмента
  playFragment(fragment: Fragment): void {
    if (!this.buffer) return

    this.stop()

    const duration = fragment.end - fragment.start
    let repeatsLeft = fragment.repeat

    this.stopRequested = false
    this.playing = true

    const playOnce = () => {
      if (!this.buffer) return
      if (repeatsLeft <= 0) return
      if (this.stopRequested) return

      this.source = this.createSource()
      this.source.start(0, fragment.start, duration)

      this.source.onended = () => {
        if (this.stopRequested) return

        repeatsLeft--

        if (repeatsLeft > 0) {
          playOnce()
        } else {
          this.playing = false
          this.onEndedCallback?.()
        }
      }
    }

    playOnce()
  }

  pause(): void {
    this.stop()
  }

  stop(): void {
    this.stopRequested = true

    if (this.source) {
      this.source.onended = null

      try {
        this.source.stop()
      } catch (err) {
        if (
          !(err instanceof DOMException) ||
          err.name !== "InvalidStateError"
        ) {
          throw err
        }
      }

      this.source.disconnect()
      this.source = null
    }

    this.playing = false
  }

  // Устанавливает скорость воспроизведения фрагмента
  setPlaybackRate(rate: number): void {
    this.playbackRate = rate
  }

  setVolume(volume: number): void {
    // нормализация
    const clamped = Math.min(Math.max(volume, 0), 1)
    this.volume = clamped
    // this.gainNode.gain.value = clamped может давать щелчки при 
    // быстром изменении громкости. Поэтому заменили на
    this.gainNode.gain.setTargetAtTime(
      clamped,
      this.context.currentTime,
      0.01
    )
  }

  getVolume(): number {
    return this.volume
  }

  getCurrentTime(): number {
    return this.context.currentTime
  }

  getDuration(): number {
    return this.buffer?.duration ?? 0
  }

  isPlaying(): boolean {
    return this.playing
  }

  // Закрывает AudioContext (важно для mobile)
  destroy(): void {
    this.stop()
    this.gainNode.disconnect()
    this.context.close()
  }
}