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
export interface Fragment {
  id: string
  audioId: AudioFileId
  start: number   // в секундах
  end: number     // в секундах
  repeat: number  // количество повторений
  enabled: boolean
}



