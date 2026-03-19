// app/components/AudioLibrary.tsx
import React from "react"
import type { AudioFile } from "../hooks/useAudioLibrary"

interface AudioLibraryProps {
  files: AudioFile[]
  selectedFile: AudioFile | null
  selectFile: (id: string) => void
  onDelete: (id: string) => void
}

export const AudioLibrary: React.FC<AudioLibraryProps> = ({ files, selectedFile, selectFile, onDelete }) => {
  if (files.length === 0) return <p>No audio files uploaded yet.</p>
  return (
    <div>
      <h3>Audio Library</h3>
      {/* <div className="test-text1">Это текст 1rem</div>
      <div className="test-text2">Это window.innerWidth {window.innerWidth}</div> */}
      <ul className="audio-list">
        {files.map(file => {
          const cls = `audio-list__item${selectedFile?.id === file.id ? " audio-list__item--selected" : ""}`
          return (
            <li key={file.id} className={cls} onClick={() => selectFile(file.id)}>
              <span>{file.name}</span>
              <button className="btn-delete" onClick={e => { e.stopPropagation(); onDelete(file.id) }}>Delete</button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}