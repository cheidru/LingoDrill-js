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
 */
export class HeavyOperationErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, showModal: false }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error, showModal: true }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(
      `[HeavyOperationErrorBoundary] ${this.props.operationName} failed:`,
      error,
      errorInfo,
    )
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