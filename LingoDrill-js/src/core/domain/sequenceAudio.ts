// core/domain/sequenceAudio.ts

import type { AudioFileId, Sequence } from "./types"

/** The part of a Sequence that decides which audio it plays. */
type AudioBound = Pick<Sequence, "audioId" | "processedAudioId">

/**
 * The audio a sequence actually plays.
 *
 * A sequence always lives in the list of the file it was cut from (`audioId`),
 * but once it has been trimmed or had its volume raised it plays a processed
 * copy instead. Everything that loads audio for a sequence — the player, the
 * editor, bundle export — must go through here; `audioId` on its own is the
 * grouping key, not the sound.
 */
export function sequenceAudioId(seq: AudioBound): AudioFileId {
  return seq.processedAudioId ?? seq.audioId
}

/** True when the sequence plays a processed copy rather than the original. */
export function isProcessed(seq: AudioBound): boolean {
  return !!seq.processedAudioId && seq.processedAudioId !== seq.audioId
}
