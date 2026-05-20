// infrastructure/audio/mediaSession.ts
//
// Thin wrapper around navigator.mediaSession for the background-listening mode.
// Lets the OS lock-screen / notification show what's playing and route media
// keys (play, pause, prev/next track) back into our HTMLAudioElement even when
// the page is backgrounded — that's the path JS timers can't reach.
//
// Safe to call on browsers without Media Session: every method no-ops when
// navigator.mediaSession is undefined.

type ActionHandlers = {
  play?: () => void
  pause?: () => void
  previoustrack?: () => void
  nexttrack?: () => void
}

const ACTIONS: MediaSessionAction[] = ["play", "pause", "previoustrack", "nexttrack"]

function ms(): MediaSession | null {
  if (typeof navigator === "undefined") return null
  return navigator.mediaSession ?? null
}

export function setMediaMetadata(title: string, artist?: string): void {
  const m = ms()
  if (!m) return
  // MediaMetadata constructor is gated separately from mediaSession on a few engines.
  if (typeof MediaMetadata === "undefined") return
  m.metadata = new MediaMetadata({ title, artist: artist ?? "LingoDrill" })
}

export function setActionHandlers(handlers: ActionHandlers): void {
  const m = ms()
  if (!m) return
  for (const action of ACTIONS) {
    const handler = handlers[action as keyof ActionHandlers]
    try {
      m.setActionHandler(action, handler ?? null)
    } catch {
      // Some browsers throw on unsupported actions — ignore.
    }
  }
}

export function setPlaybackState(state: MediaSessionPlaybackState): void {
  const m = ms()
  if (!m) return
  m.playbackState = state
}

export function setPositionState(durationSec: number, positionSec: number, playbackRate = 1): void {
  const m = ms()
  if (!m || typeof m.setPositionState !== "function") return
  // Spec: position must be <= duration, both finite and non-negative.
  if (!isFinite(durationSec) || durationSec <= 0) return
  const pos = Math.max(0, Math.min(durationSec, positionSec))
  try {
    m.setPositionState({ duration: durationSec, position: pos, playbackRate })
  } catch {
    // Some engines reject odd values — ignore.
  }
}

export function clearMediaSession(): void {
  const m = ms()
  if (!m) return
  for (const action of ACTIONS) {
    try {
      m.setActionHandler(action, null)
    } catch {
      // ignore
    }
  }
  m.metadata = null
  m.playbackState = "none"
}
