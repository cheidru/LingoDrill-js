// app/hooks/useHeavyOperation.ts

import { useState, useCallback } from "react"

export interface HeavyOperationError {
  operationName: string
  error: Error
}

/**
 * Хук для оборачивания тяжёлых асинхронных операций (decode, waveform, VAD, trim).
 *
 * Error Boundary ловит только ошибки рендера, а decode/VAD/trim — асинхронные.
 * Этот хук предоставляет:
 * - wrapHeavyOp(name, fn) — обёртку, которая при ошибке сохраняет состояние
 * - heavyError — текущая ошибка (или null)
 * - showMobileHelp — показывать ли модальное окно
 * - clearError / openHelp — управление UI
 */
export function useHeavyOperation() {
  const [heavyError, setHeavyError] = useState<HeavyOperationError | null>(null)
  const [showMobileHelp, setShowMobileHelp] = useState(false)

  const wrapHeavyOp = useCallback(
    async <T>(operationName: string, fn: () => Promise<T>): Promise<T | null> => {
      try {
        return await fn()
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))
        console.error(`[HeavyOperation] ${operationName} failed:`, error)
        setHeavyError({ operationName, error })
        setShowMobileHelp(true)
        return null
      }
    },
    [],
  )

  const clearError = useCallback(() => {
    setHeavyError(null)
    setShowMobileHelp(false)
  }, [])

  const openHelp = useCallback(() => {
    setShowMobileHelp(true)
  }, [])

  const closeHelp = useCallback(() => {
    setShowMobileHelp(false)
  }, [])

  return {
    heavyError,
    showMobileHelp,
    wrapHeavyOp,
    clearError,
    openHelp,
    closeHelp,
  }
}