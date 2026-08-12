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