// infrastructure/audio/safeDecodeAudioBuffer.ts
//
// Удобная обёртка для однократного декодирования blob → AudioBuffer
// с watchdog-таймаутом. Используется в местах, где вызывается
// decodeAudioData напрямую (вне chunkedDecode), например:
//   - FragmentEditorPage.handleAutoDetectRun
//   - FragmentEditorPage.handleTrimSilence
//
// ИСПРАВЛЕНИЕ: таймаут адаптивный — на десктопе щедрый, на мобильных короткий.

import { watchdogDecode, watchdogRace } from "./watchdogDecode"

/**
 * Detect if we're running on a mobile device.
 */
function isMobile(): boolean {
  if (typeof document !== "undefined") {
    return document.documentElement.classList.contains("mobile")
  }
  if (typeof screen !== "undefined") {
    return Math.min(screen.width, screen.height) < 500
  }
  return false
}

/**
 * Safely decode a Blob into an AudioBuffer with watchdog timeout protection.
 *
 * Timeouts scale with blob size and are much more generous on desktop
 * where there's no risk of browser killing the tab for memory usage.
 */
export async function safeDecodeAudioBuffer(
  blob: Blob,
  timeoutMs?: number,
): Promise<AudioBuffer> {
  const mobile = isMobile()

  // Compute adaptive timeout if not explicitly provided
  const effectiveTimeout = timeoutMs ?? (
    mobile
      ? 8_000
      // Desktop: 30s base + 15s per 10MB
      : 30_000 + Math.ceil(blob.size / (10 * 1e6)) * 15_000
  )

  // Step 1: read blob into ArrayBuffer (with timeout)
  const readTimeout = mobile
    ? 8_000
    : 10_000 + Math.ceil(blob.size / (100 * 1e6)) * 5_000

  const arrayBuffer = await watchdogRace(
    blob.arrayBuffer(),
    readTimeout,
    "Reading audio file into memory",
  )

  // Step 2: decode with watchdog
  const ctx = new AudioContext()
  try {
    return await watchdogDecode(ctx, arrayBuffer, effectiveTimeout, "full audio decode")
  } finally {
    try {
      await ctx.close()
    } catch {
      // ignore — may already be closed by watchdog
    }
  }
}