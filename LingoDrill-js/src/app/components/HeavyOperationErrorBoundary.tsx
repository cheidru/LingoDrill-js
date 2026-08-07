// app/components/HeavyOperationErrorBoundary.tsx
//
// ИСПРАВЛЕНИЕ: убраны глобальные обработчики window error / unhandledrejection.
//
// ПРОБЛЕМА:
// Раньше каждый экземпляр HeavyOperationErrorBoundary регистрировал свои
// глобальные обработчики. Когда на странице было 2+ boundary (FragmentEditorPage
// и FragmentLibraryPage), или когда ошибка возникала ВНЕ boundary (в
// AudioEngineProvider), обработчики конкурировали между собой, а ошибки
// выше boundary оставались неперехваченными.
//
// РЕШЕНИЕ:
// - Глобальные обработчики OOM/fatal ошибок теперь живут ТОЛЬКО в
//   RootErrorBoundary (корень приложения) — одна точка перехвата.
// - HeavyOperationErrorBoundary занимается ТОЛЬКО render-ошибками
//   через getDerivedStateFromError / componentDidCatch.
// - Async-ошибки из decode/waveform/VAD ловятся через wrapHeavyOp (useHeavyOperation hook).

import { Component } from "react"
import type { ReactNode, ErrorInfo } from "react"
import { MobileInstructionModal } from "./MobileInstructionModal"
/* The plain `t`, not the hook: this is a class component, and an error screen
   has no reason to re-render on a language change anyway. */
import { t } from "../../utils/i18n"

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
 * Ловит ТОЛЬКО render-ошибки (getDerivedStateFromError).
 * Async OOM/fatal ошибки перехватываются RootErrorBoundary.
 */
export class HeavyOperationErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, showModal: false }
  }

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
              ⚠ {t("error.heavyFailed", { op: this.props.operationName })}
            </p>
            <p style={{ fontSize: "0.85rem", color: "#666", marginBottom: 12 }}>
              {t("error.heavyBody")}
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={this.handleRetry} className="btn-primary">
                {t("error.retry")}
              </button>
              <button
                onClick={() => this.setState({ showModal: true })}
                className="btn-primary"
                style={{ backgroundColor: "#ff9800" }}
              >
                {t("editor.howToPrepare")}
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