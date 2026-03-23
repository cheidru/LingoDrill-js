// app/components/MobileInstructionModal.tsx

interface Props {
  operationName: string
  errorMessage?: string
  onClose: () => void
}

/**
 * Модальное окно с инструкцией для пользователя мобильного устройства.
 * Объясняет как подготовить аудиоданные на десктопе и перенести на мобильное устройство.
 */
export function MobileInstructionModal({ operationName, errorMessage, onClose }: Props) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-box modal-box--wide"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: 520 }}
      >
        <h3 style={{ marginTop: 0, color: "#d32f2f" }}>
          ⚠ {operationName} failed
        </h3>

        {errorMessage && (
          <p style={{ fontSize: "0.8rem", color: "#888", fontStyle: "italic", marginBottom: 12 }}>
            Error: {errorMessage}
          </p>
        )}

        <p style={{ marginBottom: 12 }}>
          This usually happens on mobile devices because audio decoding and processing require significant
          computing power. You can prepare the data on a desktop computer and transfer it to your mobile device.
        </p>

        <div style={{
          background: "#f5f5f5",
          border: "1px solid #ddd",
          borderRadius: 8,
          padding: 16,
          marginBottom: 16,
          overflowY: "auto",
          maxHeight: "50vh",
        }}>
          <h4 style={{ marginTop: 0, marginBottom: 12 }}>How to prepare on desktop:</h4>

          <div style={{ marginBottom: 16 }}>
            <strong>Step 1.</strong> Open LingoDrill on your desktop computer / laptop.
          </div>

          <div style={{ marginBottom: 16 }}>
            <strong>Step 2.</strong> Upload the audio file and open the <em>Fragment Editor</em>.
          </div>

          <div style={{ marginBottom: 16 }}>
            <strong>Step 3.</strong> Wait for audio decoding to complete (the "Decoding audio for fragments..."
            indicator will disappear).
          </div>

          <div style={{ marginBottom: 16 }}>
            <strong>Step 4.</strong> If needed, use <em>Auto-detect speech</em> and/or <em>Trim silence</em> to
            prepare your fragments.
          </div>

          <div style={{ marginBottom: 16 }}>
            <strong>Step 5.</strong> Click the <strong>"Export for mobile"</strong> button at the bottom of the editor page.
            This will save a <code>.lingodrill</code> file containing all prepared data.
          </div>

          <div style={{ marginBottom: 16 }}>
            <strong>Step 6.</strong> Transfer the <code>.lingodrill</code> file to your mobile device using any method:
            <ul style={{ marginTop: 6, marginBottom: 0 }}>
              <li>Cloud storage (Google Drive, iCloud, Dropbox, etc.)</li>
              <li>Email (send to yourself)</li>
              <li>Messenger (Telegram, WhatsApp, etc.)</li>
              <li>AirDrop (iPhone/Mac)</li>
              <li>USB cable</li>
            </ul>
          </div>

          <div>
            <strong>Step 7.</strong> On your mobile device, open LingoDrill and go to the <em>Audio Library</em> page.
            Use the <strong>"Import bundle"</strong> button to load the <code>.lingodrill</code> file.
            The audio, waveform, fragments, and subtitles will be loaded without heavy processing.
          </div>
        </div>

        <div className="modal-actions">
          <button onClick={onClose} className="btn-primary">
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}