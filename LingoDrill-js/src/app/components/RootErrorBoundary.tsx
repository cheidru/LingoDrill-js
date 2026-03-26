// app/components/RootErrorBoundary.tsx
//
// НОВЫЙ ФАЙЛ: корневой Error Boundary для всего приложения.
//
// ЗАЧЕМ:
// HeavyOperationErrorBoundary стоит только ВНУТРИ страниц (FragmentEditorPage,
// FragmentLibraryPage), но AudioEngineProvider, Router и другие компоненты
// находятся ВЫШЕ — без Error Boundary. Если useAudioEngine бросает ошибку
// во время рендер-цикла React (например, setState внутри decodeAudioChunked
// вызывает каскадный краш), вся страница белеет без какого-либо fallback UI.
//
// Этот компонент оборачивает ВСЁ приложение в main.tsx и:
// 1. Ловит любые render-ошибки через getDerivedStateFromError
// 2. Слушает глобальные error/unhandledrejection для OOM и других async-крашей
// 3. Показывает минимальный fallback UI с кнопкой перезагрузки
// 4. НЕ зависит от MobileInstructionModal и других компонентов (они могут быть
//    недоступны если крашнулся провайдер контекста)

import { Component } from "react"
import type { ReactNode, ErrorInfo } from "react"

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class RootErrorBoundary extends Component<Props, State> {
  private boundHandleWindowError: ((event: ErrorEvent) => void) | null = null
  private boundHandleUnhandledRejection: ((event: PromiseRejectionEvent) => void) | null = null

  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[RootErrorBoundary] Uncaught error:", error, errorInfo)
  }

  componentDidMount() {
    // Глобальные обработчики — последняя линия обороны.
    // Ловим только фатальные ошибки, которые не были перехвачены
    // нижестоящими Error Boundary или wrapHeavyOp.
    this.boundHandleWindowError = (event: ErrorEvent) => {
      if (this.isFatalError(event.error || event.message)) {
        event.preventDefault()
        const error =
          event.error instanceof Error
            ? event.error
            : new Error(String(event.message || "Unknown fatal error"))
        this.setState({ hasError: true, error })
      }
    }

    this.boundHandleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (this.isFatalError(event.reason)) {
        event.preventDefault()
        const error =
          event.reason instanceof Error
            ? event.reason
            : new Error(String(event.reason || "Unhandled async error"))
        this.setState({ hasError: true, error })
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
   * Определяем, является ли ошибка фатальной (OOM, stack overflow и т.д.).
   * Нижестоящие boundary ловят специфичные audio-ошибки;
   * этот boundary ловит всё остальное фатальное.
   */
  private isFatalError(errorOrMessage: unknown): boolean {
    const msg =
      errorOrMessage instanceof Error
        ? errorOrMessage.message
        : String(errorOrMessage || "")

    const fatalPatterns = [
      /out of memory/i,
      /allocation failed/i,
      /rangerror/i,
      /maximum call stack/i,
      /oom/i,
      /memory/i,
      /stack overflow/i,
    ]

    return fatalPatterns.some((p) => p.test(msg))
  }

  handleReload = () => {
    window.location.reload()
  }

  handleGoHome = () => {
    // Навигация на корень — сброс без полной перезагрузки невозможен,
    // т.к. React tree уже в error state. Используем жёсткую навигацию.
    window.location.href = window.location.origin + (window.location.pathname.split("/").slice(0, 2).join("/") || "/")
  }

  render() {
    if (this.state.hasError) {
      // Минимальный fallback UI — НЕ зависит ни от каких React-компонентов,
      // контекстов или CSS-модулей, которые могли крашнуться.
      return (
        <div
          style={{
            padding: 24,
            maxWidth: 480,
            margin: "40px auto",
            fontFamily: "system-ui, -apple-system, sans-serif",
            color: "#333",
          }}
        >
          <h2 style={{ color: "#d32f2f", marginTop: 0 }}>
            ⚠ Application Error
          </h2>

          <p style={{ lineHeight: 1.6, marginBottom: 16 }}>
            Something went wrong. This usually happens on mobile devices when
            processing large audio files that require too much memory.
          </p>

          {this.state.error && (
            <pre
              style={{
                fontSize: "0.8rem",
                color: "#888",
                background: "#f5f5f5",
                padding: 12,
                borderRadius: 6,
                overflow: "auto",
                maxHeight: 120,
                marginBottom: 16,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {this.state.error.message}
            </pre>
          )}

          <div
            style={{
              padding: 16,
              background: "#fff3e0",
              border: "1px solid #ffcc80",
              borderRadius: 8,
              marginBottom: 20,
              fontSize: "0.9rem",
              lineHeight: 1.6,
            }}
          >
            <strong>Tip:</strong> For large audio files, prepare the data on a
            desktop computer using the Fragment Editor, then export a{" "}
            <code style={{ background: "#f0f0f0", padding: "1px 4px", borderRadius: 3 }}>
              .lingodrill
            </code>{" "}
            bundle and import it on your mobile device.
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button
              onClick={this.handleReload}
              style={{
                padding: "10px 20px",
                fontSize: "1rem",
                background: "#1976d2",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                minHeight: 44,
              }}
            >
              Reload page
            </button>
            <button
              onClick={this.handleGoHome}
              style={{
                padding: "10px 20px",
                fontSize: "1rem",
                background: "#f5f5f5",
                color: "#333",
                border: "1px solid #ccc",
                borderRadius: 6,
                cursor: "pointer",
                minHeight: 44,
              }}
            >
              Go to library
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}