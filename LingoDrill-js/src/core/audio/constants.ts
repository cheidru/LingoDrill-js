// core/audio/constants.ts
//
// Shared audio constants used by both the live engine (HtmlAudioEngine) and the
// background-mode sequence renderer (renderSequence). Keeping them in one place
// guarantees baked output matches live playback timing exactly.

/** Pause in seconds between repeats of the same fragment (when repeat > 1). */
// TODO: make configurable via the settings UI.
export const FRAGMENT_TRAILING_PAUSE = 1
