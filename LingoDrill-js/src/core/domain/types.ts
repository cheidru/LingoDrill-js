// core/domain/types.ts

export type AudioFileId = string

export interface AudioFile {
  id: AudioFileId
  name: string
  mimeType: string
  size: number
  hash: string
  createdAt: number
  /**
   * Set on files this app produced from another one (trim silence, normalize,
   * maximize). A derived file is not an upload of its own: it is hidden from
   * the Audio Library, reachable only through the sequence that plays it, and
   * deleted together with the file it came from.
   */
  derivedFrom?: AudioFileId
}

/** Файл субтитров, привязанный к аудиофайлу */
export interface SubtitleFile {
  id: string
  audioId: AudioFileId
  name: string        // имя файла
  content: string     // полный текст
  createdAt: number
}

/** Привязка субтитров к фрагменту: ссылка на файл + диапазон символов */
export interface FragmentSubtitle {
  subtitleFileId: string
  subtitleFileName: string
  charStart: number
  charEnd: number
}

/** Файл словаря, привязанный к аудиофайлу */
export interface VocabularyFile {
  id: string
  audioId: AudioFileId
  name: string
  content: string
  createdAt: number
}

/** Привязка словаря к фрагменту: ссылка на файл + диапазон символов */
export interface FragmentVocabulary {
  vocabularyFileId: string
  vocabularyFileName: string
  charStart: number
  charEnd: number
}

export interface SequenceFragment {
  id: string
  start: number       // в секундах
  end: number         // в секундах
  repeat: number      // количество повторений
  speed: number       // скорость воспроизведения (1 = нормальная)
  subtitles: FragmentSubtitle[]  // привязанные субтитры
  vocabularies?: FragmentVocabulary[]  // привязанный словарь
}

/**
 * An audio processing step that has already been applied to a sequence.
 * Recorded so the editor can tick off the button that ran it.
 */
export type ProcessedOp = "trim" | "normalize" | "maximize"

export interface Sequence {
  id: string
  /**
   * The file this sequence belongs to — its place in the sequence library and
   * the owner of its subtitles and vocabularies. Processing never changes it,
   * so a processed sequence stays in the original file's list under its own
   * name; see `processedAudioId` for what actually plays.
   */
  audioId: AudioFileId
  label: string
  fragments: SequenceFragment[]
  createdAt: number
  favourite?: boolean
  /** Sequence-wide playback speed multiplier. Defaults to 1.0 if missing. */
  playbackSpeed?: number
  /**
   * Audio actually played, when trim silence / normalize / maximize has
   * produced a processed copy. Absent on an untouched sequence, which plays
   * `audioId`. Read it through `sequenceAudioId()` rather than directly.
   */
  processedAudioId?: AudioFileId
  /**
   * Duration of `processedAudioId` in seconds. Trimming shortens the audio, so
   * anything laying fragments out against a timeline needs this rather than the
   * original file's duration.
   */
  processedDuration?: number
  /**
   * Processing steps already applied to this sequence (trim silence, normalize,
   * maximize). The editor disables and ticks the matching button, the way
   * auto-detect is ticked once fragments exist. Absent on an untouched sequence.
   */
  processedOps?: ProcessedOp[]
}

// Обратная совместимость
export interface Fragment {
  id: string
  audioId: AudioFileId
  start: number
  end: number
  repeat: number
  enabled: boolean
}

/**
 * One drawing inside a background, reduced to what the pattern builder needs:
 * the box the artwork was drawn in and the markup that fills it. An uploaded
 * SVG becomes this at upload time (see `parseSvgShape`), so nothing downstream
 * ever has to re-read an editor's file — and nothing that has been stored can
 * carry a script, a stylesheet or an external reference into the page.
 */
export interface BackgroundShape {
  id: string
  /** The file it came from, shown in the background's file list. */
  name: string
  /** `[minX, minY, width, height]` of the source SVG. */
  viewBox: [number, number, number, number]
  /** The shape markup, without the surrounding `<svg>`. */
  content: string
}

/**
 * A background: a set of drawings, repeated along the invisible lines of
 * `PATTERN_LINES` and tinted with one colour. `id === BUILTIN_BACKGROUND_ID`
 * marks the one the app ships with, which may be re-coloured but not deleted.
 */
export interface BackgroundDef {
  id: string
  name: string
  shapes: BackgroundShape[]
  /** `"default"` — the theme's own text colour — or a `#rrggbb`. */
  stroke: string
  createdAt: number
}
