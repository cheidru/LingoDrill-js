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



