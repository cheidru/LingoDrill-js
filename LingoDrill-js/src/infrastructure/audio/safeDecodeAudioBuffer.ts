// infrastructure/audio/safeDecodeAudioBuffer.ts
//
// НОВЫЙ ФАЙЛ.
//
// Удобная обёртка для однократного декодирования blob → AudioBuffer
// с watchdog-таймаутом. Используется в местах, где вызывается
// decodeAudioData напрямую (вне chunkedDecode), например:
//   - FragmentEditorPage.handleAutoDetectRun
//   - FragmentEditorPage.handleTrimSilence
//
// Эти места ранее вызывали ctx.decodeAudioData(buffer) без какой-либо
// защиты от зависания, что приводило к hard kill вкладки на мобильных.

import { watchdogDecode, watchdogRace } from "./watchdogDecode"

/**
 * Safely decode a Blob into an AudioBuffer with watchdog timeout protection.
 */
export async function safeDecodeAudioBuffer(
  blob: Blob,
  timeoutMs = 8_000,
): Promise<AudioBuffer> {
  // Step 1: read blob into ArrayBuffer (with timeout)
  const arrayBuffer = await watchdogRace(
    blob.arrayBuffer(),
    timeoutMs,
    "Reading audio file into memory",
  )

  // Step 2: decode with watchdog
  const ctx = new AudioContext()
  try {
    return await watchdogDecode(ctx, arrayBuffer, timeoutMs, "full audio decode")
  } finally {
    try {
      await ctx.close()
    } catch {
      // ignore — may already be closed by watchdog
    }
  }
}