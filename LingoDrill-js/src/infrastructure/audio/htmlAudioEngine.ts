// infrastructure/audio/htmlAudioEngine.ts

import type { PlayableFragment } from "../../core/audio/audioEngine"

/** Пауза в секундах между повторами фрагмента (при repeat > 1) */
// TODO: в дальнейшем сделать настраиваемой через UI настроек
const FRAGMENT_TRAILING_PAUSE = 1

/**
 * Движок воспроизведения на основе HTMLAudioElement.
 *
 * Воспроизводит и весь файл (мгновенный старт, браузер стримит сам), и
 * отдельные фрагменты — по start/end времени, БЕЗ декодирования файла в
 * AudioBuffer. Границы фрагмента отслеживаются через requestAnimationFrame
 * (~16 мс точность), повторы — через setTimeout. Скорость задаётся
 * playbackRate с preservesPitch=true (замедление звучит естественно).
 */
export class HtmlAudioEngine {
  private audio: HTMLAudioElement = new Audio()
  private objectUrl: string | null = null
  private onEndedCallback: (() => void) | null = null

  // --- Состояние воспроизведения фрагмента ---
  private fragmentMode = false
  private currentFragment: PlayableFragment | null = null
  private fragmentEnd: number | null = null
  private repeatsLeft = 0
  private rafId: number | null = null
  private pauseTimer: ReturnType<typeof setTimeout> | null = null

  // Монотонно растущий ID сессии воспроизведения. Инкрементируется при старте
  // нового фрагмента, при достижении границы и при stop/seek. Все
  // rAF/setTimeout-колбэки замыкают ожидаемый ID и игнорируются при расхождении.
  private playbackId = 0

  constructor() {
    this.audio.addEventListener("ended", () => {
      // В режиме фрагмента концом владеет монитор границы. Нативный ended
      // важен только если фрагмент дотянул до самого конца файла.
      if (this.fragmentMode) {
        this.handleFragmentBoundary(this.playbackId)
        return
      }
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
    if (this.fragmentMode && this.currentFragment) {
      // Возобновление приостановленного фрагмента. Если пауза пришлась на
      // промежуток между повторами (currentTime у границы) — начинаем повтор
      // с начала фрагмента, иначе продолжаем с текущей позиции.
      if (
        this.fragmentEnd !== null &&
        this.audio.currentTime >= this.fragmentEnd - 0.01
      ) {
        this.audio.currentTime = this.currentFragment.start
      }
      this.audio.play()
      this.startBoundaryMonitor()
    } else {
      this.audio.play()
    }
  }

  pause(): void {
    this.audio.pause()
    // Останавливаем монитор и таймер повтора, но сохраняем состояние фрагмента
    // для последующего resume через play().
    this.cancelTimers()
  }

  stop(): void {
    this.audio.pause()
    this.audio.currentTime = 0
    this.clearFragmentState()
  }

  seekTo(time: number): void {
    // Ручной seek выходит из режима фрагмента (как WebAudioEngine.seekTo).
    this.clearFragmentState()
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

  // --- Воспроизведение фрагмента ---

  playFragment(fragment: PlayableFragment): void {
    this.cancelTimers()
    this.playbackId++
    this.fragmentMode = true
    this.currentFragment = fragment
    this.fragmentEnd = fragment.end
    this.repeatsLeft = Math.max(1, fragment.repeat)

    // preservesPitch=true — замедленный звук сохраняет высоту тона.
    this.audio.preservesPitch = true
    this.audio.playbackRate = fragment.speed ?? 1
    this.audio.currentTime = fragment.start
    this.audio.play()
    this.startBoundaryMonitor()
  }

  /** Запускает rAF-цикл, отслеживающий достижение границы фрагмента. */
  private startBoundaryMonitor(): void {
    this.stopBoundaryMonitor()
    const expectedId = this.playbackId
    const tick = () => {
      if (this.playbackId !== expectedId) return
      if (
        this.fragmentEnd !== null &&
        this.audio.currentTime >= this.fragmentEnd
      ) {
        this.handleFragmentBoundary(expectedId)
        return
      }
      this.rafId = requestAnimationFrame(tick)
    }
    this.rafId = requestAnimationFrame(tick)
  }

  private stopBoundaryMonitor(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }

  /**
   * Вызывается при достижении конца одного повтора фрагмента — из rAF-монитора
   * или из нативного ended (если фрагмент кончается у конца файла).
   * Идемпотентна в пределах одного цикла: первым делом инкрементирует
   * playbackId, поэтому повторный вызов с прежним expectedId игнорируется.
   */
  private handleFragmentBoundary(expectedId: number): void {
    if (this.playbackId !== expectedId) return
    this.stopBoundaryMonitor()
    this.audio.pause()

    const fragment = this.currentFragment
    if (!fragment) return

    this.playbackId++
    const cycleId = this.playbackId

    if (this.repeatsLeft > 1) {
      this.repeatsLeft--
      this.pauseTimer = setTimeout(() => {
        this.pauseTimer = null
        if (this.playbackId !== cycleId) return
        this.audio.currentTime = fragment.start
        this.audio.play()
        this.startBoundaryMonitor()
      }, FRAGMENT_TRAILING_PAUSE * 1000)
    } else {
      this.clearFragmentState()
      this.onEndedCallback?.()
    }
  }

  private cancelTimers(): void {
    this.stopBoundaryMonitor()
    if (this.pauseTimer !== null) {
      clearTimeout(this.pauseTimer)
      this.pauseTimer = null
    }
  }

  private clearFragmentState(): void {
    this.cancelTimers()
    this.playbackId++
    this.fragmentMode = false
    this.currentFragment = null
    this.fragmentEnd = null
    this.repeatsLeft = 0
    // Возврат к обычному воспроизведению файла на нормальной скорости.
    this.audio.playbackRate = 1
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
