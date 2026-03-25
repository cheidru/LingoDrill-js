// app/components/HeavyOperationErrorBoundary.tsx

import { Component } from "react"
import type { ReactNode, ErrorInfo } from "react"
import { MobileInstructionModal } from "./MobileInstructionModal"

interface Props {
  children: ReactNode
  /** Название операции для пользователя */
  operationName: string
}

interface State {
  hasError: boolean
  error: Error | null
  showModal: boolean
}

/**
 * Error Boundary для тяжёлых операций (декодирование аудио, waveform, VAD, trim).
 * При ошибке показывает модальное окно с инструкцией
 * как подготовить данные на десктопе и передать на мобильное устройство.
 *
 * ИСПРАВЛЕНИЯ:
 * 1. getDerivedStateFromError возвращает полный State (не Partial<State>)
 *    — React ожидает полный объект; Partial мог вызывать undefined поведение.
 * 2. Добавлены глобальные обработчики window error / unhandledrejection
 *    для перехвата асинхронных OOM-ошибок, которые Error Boundary
 *    сам по себе НЕ ловит (decodeAudioData, chunkedDecode, buildWaveform).
 * 3. Очистка обработчиков в componentWillUnmount.
 */
export class HeavyOperationErrorBoundary extends Component<Props, State> {
  private boundHandleWindowError: ((event: ErrorEvent) => void) | null = null
  private boundHandleUnhandledRejection: ((event: PromiseRejectionEvent) => void) | null = null

  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, showModal: false }
  }

  // ИСПРАВЛЕНО: возвращаем полный State, а не Partial<State>
  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, showModal: true }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(
      `[HeavyOperationErrorBoundary] ${this.props.operationName} failed:`,
      error,
      errorInfo,
    )
  }

  componentDidMount() {
    // Глобальные обработчики для асинхронных ошибок (OOM, decode failure),
    // которые Error Boundary не перехватывает
    this.boundHandleWindowError = (event: ErrorEvent) => {
      if (this.isHeavyOperationError(event.error || event.message)) {
        event.preventDefault()
        const error =
          event.error instanceof Error
            ? event.error
            : new Error(String(event.message || "Unknown error during heavy operation"))
        this.setState({ hasError: true, error, showModal: true })
      }
    }

    this.boundHandleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (this.isHeavyOperationError(event.reason)) {
        event.preventDefault()
        const error =
          event.reason instanceof Error
            ? event.reason
            : new Error(String(event.reason || "Async operation failed"))
        this.setState({ hasError: true, error, showModal: true })
      }
    }

    window.addEventListener("error", this.boundHandleWindowError)
    window.addEventListener("unhandledrejection", this.boundHandleUnhandledRejection)
  }

  componentWillUnmount() {
    if (this.boundHandleWindowError) {
      window.removeEventListener("error", this.boundHandleWindowError)
    }
    if (this.boundHandleUnhandledRejection) {
      window.removeEventListener("unhandledrejection", this.boundHandleUnhandledRejection)
    }
  }

  /**
   * Эвристика: является ли ошибка результатом тяжёлой операции (OOM, decode, waveform).
   * Не перехватываем ВСЕ глобальные ошибки — только релевантные.
   */
  private isHeavyOperationError(errorOrMessage: unknown): boolean {
    const msg =
      errorOrMessage instanceof Error
        ? errorOrMessage.message
        : String(errorOrMessage || "")

    const patterns = [
      /out of memory/i,
      /allocation failed/i,
      /decodeaudiodata/i,
      /audio.*decode/i,
      /chunked.*decode/i,
      /waveform/i,
      /arraybuffer/i,
      /rangerror/i,
      /webassembly/i,
      /oom/i,
      /memory/i,
    ]

    return patterns.some((p) => p.test(msg))
  }

  handleCloseModal = () => {
    this.setState({ showModal: false })
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, showModal: false })
  }

  render() {
    if (this.state.hasError) {
      return (
        <>
          <div className="error-boundary-fallback">
            <p style={{ color: "#d32f2f", marginBottom: 8 }}>
              ⚠ {this.props.operationName} failed.
            </p>
            <p style={{ fontSize: "0.85rem", color: "#666", marginBottom: 12 }}>
              This operation may require too much processing power for this device.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={this.handleRetry} className="btn-primary">
                Try again
              </button>
              <button
                onClick={() => this.setState({ showModal: true })}
                className="btn-primary"
                style={{ backgroundColor: "#ff9800" }}
              >
                How to prepare on desktop
              </button>
            </div>
          </div>
          {this.state.showModal && (
            <MobileInstructionModal
              operationName={this.props.operationName}
              errorMessage={this.state.error?.message}
              onClose={this.handleCloseModal}
            />
          )}
        </>
      )
    }

    return this.props.children
  }
}