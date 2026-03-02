// components/AudioLibrary.tsx

import React from "react"
import type { AudioFile } from "../hooks/useAudioLibrary"

interface AudioLibraryProps {
  files: AudioFile[]
  selectedFile: AudioFile | null
  selectFile: (id: string) => void
  onDelete: (id: string) => void
}

export const AudioLibrary: React.FC<AudioLibraryProps> = ({
  files,
  selectedFile,
  selectFile,
  onDelete,
}) => {
  if (files.length === 0) {
    return <p>No audio files uploaded yet.</p>
  }

  return (
    <div>
      <h3>Audio Library</h3>

      <ul style={{ listStyle: "none", padding: 0 }}>
        {files.map((file) => {
          const isSelected = selectedFile?.id === file.id

          return (
            <li
              key={file.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "8px 12px",
                marginBottom: "4px",
                cursor: "pointer",
                backgroundColor: isSelected ? "#e6f2ff" : "#f5f5f5",
                border: isSelected
                  ? "1px solid #3399ff"
                  : "1px solid #ddd",
                borderRadius: 4,
              }}
              onClick={() => selectFile(file.id)}
            >
              <span>{file.name}</span>

              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(file.id)
                }}
                style={{
                  marginLeft: 12,
                  backgroundColor: "#ff4d4f",
                  color: "white",
                  border: "none",
                  padding: "4px 8px",
                  borderRadius: 4,
                  cursor: "pointer",
                }}
              >
                Delete
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}