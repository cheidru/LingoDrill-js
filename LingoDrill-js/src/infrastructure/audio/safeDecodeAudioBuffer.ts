// infrastructure/audio/safeDecodeAudioBuffer.ts
//
// Удобная обёртка для однократного декодирования blob → AudioBuffer
// с watchdog-таймаутом. Используется в местах, где вызывается
// decodeAudioData напрямую (вне chunkedDecode), например:
//   - FragmentEditorPage.handleAutoDetectRun
//   - FragmentEditorPage.handleTrimSilence
//
// ИСПРАВЛЕНИЕ: watchdog-таймаут применяется ТОЛЬКО на мобильных, где долгий
// decode означает, что браузер вот-вот убьёт вкладку по памяти. На десктопе
// долгий decode означает просто «большой файл» — там ждём сколько нужно,
// иначе Auto-detect speech на длинном аудио падает с ложным таймаутом.

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
 * Safely decode a Blob into an AudioBuffer.
 *
 * On mobile a watchdog timeout guards against the browser killing the tab
 * mid-decode. On desktop there is no timeout at all: a long decode there just
 * means a long file, and aborting it would surface a bogus "timed out" error
 * for a job that would have succeeded. Pass an explicit `timeoutMs` to force
 * a watchdog on any platform; pass `Infinity` to force it off.
 */
export async function safeDecodeAudioBuffer(
  blob: Blob,
  timeoutMs?: number,
): Promise<AudioBuffer> {
  const mobile = isMobile()

  // Desktop: no watchdog. Mobile: short, fixed budget.
  const effectiveTimeout = timeoutMs ?? (mobile ? 8_000 : Infinity)

  // Step 1: read blob into ArrayBuffer (with timeout on mobile only)
  const readTimeout = timeoutMs ?? (mobile ? 8_000 : Infinity)

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