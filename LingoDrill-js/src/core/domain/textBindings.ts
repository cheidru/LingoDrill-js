// core/domain/textBindings.ts
//
// Fragments do not own subtitle or vocabulary text: each binding is a
// `charStart`/`charEnd` range into the one shared `SubtitleFile.content` /
// `VocabularyFile.content` of the audio file. Every sequence of that file
// reads from the same string, so editing that string moves the ground under
// every binding that sits after the edit.
//
// These helpers describe an edit as a single replaced span and re-base the
// bindings across it, so a text fix in one snippet leaves the others pointing
// at the same words they pointed at before.

import type { SequenceFragment } from "./types"

/**
 * An edit reduced to the one span that actually changed: everything before
 * `prefix` and everything from `oldTailStart` (old text) / `newTailStart` (new
 * text) onwards is untouched. `newTailStart - oldTailStart` is the length delta.
 */
export interface TextEdit {
  prefix: number
  oldTailStart: number
  newTailStart: number
}

/**
 * Reduces two versions of a text to their differing span by trimming the
 * common prefix and the common suffix. Returns null when nothing changed.
 */
export function diffText(oldText: string, newText: string): TextEdit | null {
  if (oldText === newText) return null

  const max = Math.min(oldText.length, newText.length)

  let prefix = 0
  while (prefix < max && oldText[prefix] === newText[prefix]) prefix++

  let suffix = 0
  while (
    suffix < max - prefix &&
    oldText[oldText.length - 1 - suffix] === newText[newText.length - 1 - suffix]
  ) suffix++

  return {
    prefix,
    oldTailStart: oldText.length - suffix,
    newTailStart: newText.length - suffix,
  }
}

/**
 * Moves one character offset from the old text into the new one.
 *
 * Offsets before the edit stay put; offsets after it shift by the length
 * delta. An offset inside the replaced span has no exact answer — it is pulled
 * to the edge of the span its edge belongs to, so a binding that straddles the
 * edit ends up covering the replacement whole rather than half a word.
 */
export function rebaseOffset(offset: number, edit: TextEdit, edge: "start" | "end"): number {
  if (offset <= edit.prefix) return offset
  if (offset >= edit.oldTailStart) return offset + (edit.newTailStart - edit.oldTailStart)
  return edge === "start" ? edit.prefix : edit.newTailStart
}

function rebaseRange<T extends { charStart: number; charEnd: number }>(binding: T, edit: TextEdit): T {
  const charStart = rebaseOffset(binding.charStart, edit, "start")
  const charEnd = Math.max(charStart, rebaseOffset(binding.charEnd, edit, "end"))
  if (charStart === binding.charStart && charEnd === binding.charEnd) return binding
  return { ...binding, charStart, charEnd }
}

/**
 * Re-bases every subtitle binding that reads `subtitleFileId`. Returns the very
 * same array when no binding moved, so callers can skip the write.
 */
export function rebaseSubtitleBindings(
  fragments: SequenceFragment[],
  subtitleFileId: string,
  edit: TextEdit,
): SequenceFragment[] {
  let changed = false

  const next = fragments.map(f => {
    let fragChanged = false
    const subtitles = f.subtitles.map(s => {
      if (s.subtitleFileId !== subtitleFileId) return s
      const rebased = rebaseRange(s, edit)
      if (rebased !== s) fragChanged = true
      return rebased
    })
    if (!fragChanged) return f
    changed = true
    return { ...f, subtitles }
  })

  return changed ? next : fragments
}

/** The same for vocabulary bindings. */
export function rebaseVocabularyBindings(
  fragments: SequenceFragment[],
  vocabularyFileId: string,
  edit: TextEdit,
): SequenceFragment[] {
  let changed = false

  const next = fragments.map(f => {
    if (!f.vocabularies?.length) return f
    let fragChanged = false
    const vocabularies = f.vocabularies.map(v => {
      if (v.vocabularyFileId !== vocabularyFileId) return v
      const rebased = rebaseRange(v, edit)
      if (rebased !== v) fragChanged = true
      return rebased
    })
    if (!fragChanged) return f
    changed = true
    return { ...f, vocabularies }
  })

  return changed ? next : fragments
}

/**
 * One sequence's fragments, named so a clash can be pointed at in the UI.
 * The sequence being edited contributes its live `fragments` state, the rest
 * come straight from storage.
 */
export interface BindingSource {
  label: string
  fragments: SequenceFragment[]
}

/** The binding an edit would have disturbed, and the sequence it sits in. */
export interface BindingOverlap {
  label: string
  charStart: number
  charEnd: number
}

/** Half-open ranges: touching at an edge is not an overlap. */
function overlaps(a: { charStart: number; charEnd: number }, b: { charStart: number; charEnd: number }): boolean {
  return a.charStart < b.charEnd && b.charStart < a.charEnd
}

/**
 * Finds a subtitle binding of another fragment that shares characters with
 * `range`. Rewriting a span that two fragments read would change the other
 * fragment's snippet too, so the editor refuses the edit instead of re-basing
 * it. `skipFragmentId` is the fragment whose own snippet is being edited.
 */
export function findSubtitleOverlap(
  sources: BindingSource[],
  subtitleFileId: string,
  range: { charStart: number; charEnd: number },
  skipFragmentId: string,
): BindingOverlap | null {
  for (const source of sources) {
    for (const f of source.fragments) {
      if (f.id === skipFragmentId) continue
      for (const s of f.subtitles) {
        if (s.subtitleFileId !== subtitleFileId) continue
        if (overlaps(s, range)) {
          return { label: source.label, charStart: s.charStart, charEnd: s.charEnd }
        }
      }
    }
  }
  return null
}

/** The same for vocabulary bindings. */
export function findVocabularyOverlap(
  sources: BindingSource[],
  vocabularyFileId: string,
  range: { charStart: number; charEnd: number },
  skipFragmentId: string,
): BindingOverlap | null {
  for (const source of sources) {
    for (const f of source.fragments) {
      if (f.id === skipFragmentId) continue
      for (const v of f.vocabularies ?? []) {
        if (v.vocabularyFileId !== vocabularyFileId) continue
        if (overlaps(v, range)) {
          return { label: source.label, charStart: v.charStart, charEnd: v.charEnd }
        }
      }
    }
  }
  return null
}
