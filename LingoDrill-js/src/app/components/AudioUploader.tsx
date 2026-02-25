type UploadHandler = (file: File) => Promise<void> | void

interface AudioUploaderProps {
  onUpload: UploadHandler
}

export function AudioUploader( {onUpload}: AudioUploaderProps) {
  return (
    // ToDo Стилизовать input, чтобы не появлялась надпись No file chosen
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