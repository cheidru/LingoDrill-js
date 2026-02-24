// export interface AudioFileUploaderProps {
//   onUpload: (file: File) => Promise<void> | void
// }

export type AudioFileId = string

// export interface AudioStorage {
//   save(file: File): Promise<AudioFile>
//   getBlob(id: string): Promise<Blob>
//   delete(id: string): Promise<void>
// }


export interface AudioFile {
  id: AudioFileId
  name: string
  mimeType: string
  size: number
  hash: string
  createdAt: number
}

// interface SubtitleFile {
//   id: string
//   audioId: AudioFileId
//   name: string
//   format: "srt" | "vtt"
//   createdAt: number
// }

// interface Fragment {
//   id: string
//   audioId: AudioFileId
//   start: number
//   end: number
//   repeat: number
//   enabled: boolean
// }

// interface Sequence {
//   id: string
//   audioId: AudioFileId
//   name: string
//   fragmentIds: string[]
// }


