type UploadHandler = (file: File) => Promise<void> | void

interface AudioUploaderProps {
  onUpload: UploadHandler
}

export function AudioUploader( {onUpload}: AudioUploaderProps) {
  return (
    <input
      type="file"
      accept="audio/*"
      multiple={false}
      onChange={e => {
        if (e.target.files?.[0]) {
          onUpload(e.target.files[0])
        }
      }}
    />
  )
}