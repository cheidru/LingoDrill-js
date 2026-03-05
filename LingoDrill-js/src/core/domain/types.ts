// core/domain/types.ts

export type AudioFileId = string

export interface AudioFile {
  id: AudioFileId
  name: string
  mimeType: string
  size: number
  hash: string
  createdAt: number
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

export interface SequenceFragment {
  id: string
  start: number       // в секундах
  end: number         // в секундах
  repeat: number      // количество повторений
  speed: number       // скорость воспроизведения (1 = нормальная)
  subtitles: FragmentSubtitle[]  // привязанные субтитры
}

export interface Sequence {
  id: string
  audioId: AudioFileId
  label: string
  fragments: SequenceFragment[]
  createdAt: number
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