// pages/FragmentLibraryPage.tsx
//
// CHANGES:
// 1. REMOVED: Inline sequence playback (VolumeControl, playFragment, play-all etc.)
// 2. Play button on each sequence box now navigates to SequencePlayerPage
// 3. Subtitle management modal remains unchanged
// 4. Copy, Edit, Delete remain unchanged

import { useEffect, useState, useCallback, useRef } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useSequences } from "../app/hooks/useSequences"
import { useSubtitles } from "../app/hooks/useSubtitles"
import { useVocabularies } from "../app/hooks/useVocabularies"
import { useSharedAudioEngine } from "../app/hooks/useSharedAudioEngine"
import type { Sequence, SequenceFragment } from "../core/domain/types"
import { PlayIcon, EditIcon, DeleteIcon, CopyIcon, FavouriteIcon } from "../app/components/SequenceIcons"
import { nanoid } from "nanoid"
import { useT } from "../utils/i18n"

// --- Sequence bar ---
function SequenceBar({
  sequence, duration,
}: {
  sequence: Sequence; duration: number
}) {
  const BAR_WIDTH = 200
  const MIN_FRAG_PX = 2

  /* A trimmed sequence plays a shorter copy of the file, and its fragments are
     laid out against that copy — measuring them against the original duration
     would squash the whole bar into its left end. */
  const span = sequence.processedDuration ?? duration

  return (
    <svg width={BAR_WIDTH} height={16} style={{ display: "block", flexShrink: 0 }}>
      <rect x={0} y={2} width={BAR_WIDTH} height={12} rx={0} fill="#fef3c7" />
      {span > 0 && sequence.fragments.map((f, i) => {
        const startPx = (f.start / span) * BAR_WIDTH
        let widthPx = ((f.end - f.start) / span) * BAR_WIDTH
        if (widthPx < MIN_FRAG_PX) widthPx = MIN_FRAG_PX
        return (
          <rect key={i} x={startPx} y={2} width={widthPx} height={12} rx={0}
            fill="#f87171" opacity={0.85} />
        )
      })}
    </svg>
  )
}

// --- Main page ---
export function FragmentLibraryPage() {
  return <FragmentLibraryPageInner />
}

function FragmentLibraryPageInner() {
  const { id: audioId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const t = useT()

  const {
    files,
    loadById, stop,
    duration,
  } = useSharedAudioEngine()

  const { sequences, isLoading, addSequence, deleteSequence, updateSequence } = useSequences(audioId ?? null)
  const { subtitleFiles, addSubtitleFile, deleteSubtitleFile } = useSubtitles(audioId ?? null)
  const { vocabularyFiles, addVocabularyFile, deleteVocabularyFile } = useVocabularies(audioId ?? null)

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null)
  const [editingLabelValue, setEditingLabelValue] = useState("")

  // Subtitle management modal state
  const [subModalOpen, setSubModalOpen] = useState(false)
  const subFileInputRef = useRef<HTMLInputElement>(null)
  // Vocabulary management modal state
  const [vocabModalOpen, setVocabModalOpen] = useState(false)
  const vocabFileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (audioId) loadById(audioId)
  }, [audioId, loadById])

  // Stop playback when leaving the page (unmount)
  const stopRef = useRef(stop)
  useEffect(() => { stopRef.current = stop }, [stop])
  useEffect(() => {
    return () => {
      console.log("[FragmentLibraryPage] unmounting, stopping playback")
      stopRef.current()
    }
  }, [])

  // --- Label editing ---
  const handleLabelSave = useCallback(async () => {
    if (!editingLabelId) return
    const seq = sequences.find(s => s.id === editingLabelId)
    if (seq) {
      await updateSequence({ ...seq, label: editingLabelValue.trim() || seq.label })
    }
    setEditingLabelId(null)
  }, [editingLabelId, editingLabelValue, sequences, updateSequence])

  // --- Copy sequence ---
  const handleCopySequence = useCallback(async (seq: Sequence) => {
    const copiedFragments: SequenceFragment[] = seq.fragments.map(f => ({
      ...f,
      id: nanoid(),
      subtitles: [...f.subtitles],
    }))
    /* The copy plays what the original plays. Dropping the processed audio here
       would leave the copy's fragment times pointing at the untrimmed file —
       the same fragments, landing in all the wrong places. */
    const processed = seq.processedAudioId
      ? { audioId: seq.processedAudioId, duration: seq.processedDuration ?? 0 }
      : undefined
    const newSeq = await addSequence(copiedFragments, processed)
    if (newSeq) {
      console.log("[FragmentLibrary] Copied sequence", seq.label, "→", newSeq.label)
    }
  }, [addSequence])

  // --- Subtitle file management ---
  const handleSubFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    await addSubtitleFile(file)
    if (subFileInputRef.current) subFileInputRef.current.value = ""
  }, [addSubtitleFile])

  const handleVocabFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    await addVocabularyFile(file)
    if (vocabFileInputRef.current) vocabFileInputRef.current.value = ""
  }, [addVocabularyFile])

  const handleDeleteVocabularyFile = useCallback(async (vocabFileId: string) => {
    await deleteVocabularyFile(vocabFileId)
    for (const seq of sequences) {
      const hasAffected = seq.fragments.some(f =>
        (f.vocabularies ?? []).some(v => v.vocabularyFileId === vocabFileId)
      )
      if (hasAffected) {
        const updatedFragments = seq.fragments.map(f => ({
          ...f,
          vocabularies: (f.vocabularies ?? []).filter(v => v.vocabularyFileId !== vocabFileId),
        }))
        await updateSequence({ ...seq, fragments: updatedFragments })
      }
    }
    console.log("[FragmentLibrary] Deleted vocabulary file and cleaned up bindings:", vocabFileId)
  }, [deleteVocabularyFile, sequences, updateSequence])

  const handleDeleteSubtitleFile = useCallback(async (subFileId: string) => {
    await deleteSubtitleFile(subFileId)

    for (const seq of sequences) {
      const hasAffectedFragments = seq.fragments.some(f =>
        f.subtitles.some(s => s.subtitleFileId === subFileId)
      )
      if (hasAffectedFragments) {
        const updatedFragments = seq.fragments.map(f => ({
          ...f,
          subtitles: f.subtitles.filter(s => s.subtitleFileId !== subFileId),
        }))
        await updateSequence({ ...seq, fragments: updatedFragments })
      }
    }
    console.log("[FragmentLibrary] Deleted subtitle file and cleaned up bindings:", subFileId)
  }, [deleteSubtitleFile, sequences, updateSequence])

  const fileName = files.find(f => f.id === audioId)?.name ?? t("common.unknown")

  return (
    <div className="page">
      <h2>{t("fragmentLibrary.title")}</h2>
      <p className="sp-file-info">
        {fileName}
      </p>

      <div className="toolbar">
        <button onClick={() => navigate(audioId ? `/file/${audioId}/editor` : "/")}>
          {t("fragmentLibrary.newSequence")}
        </button>
        <button onClick={() => setSubModalOpen(true)}>
          {t("fragmentLibrary.sub")} ({subtitleFiles.length})
        </button>
        <button onClick={() => setVocabModalOpen(true)}>
          {t("fragmentLibrary.vocab")} ({vocabularyFiles.length})
        </button>
      </div>

      {isLoading && <p>{t("fragmentLibrary.loading")}</p>}

      {!isLoading && sequences.length === 0 && (
        <p className="empty-state">{t("fragmentLibrary.empty")}</p>
      )}

      {sequences.map(seq => {
        return (
          <div key={seq.id} className={`seq-card${editingLabelId === seq.id ? " seq-card--editing" : ""}`}>
            <div className="seq-bar-wrap">
              {/* Label */}
              {editingLabelId === seq.id ? (
                <input
                  className="seq-label-input"
                  value={editingLabelValue}
                  onChange={e => setEditingLabelValue(e.target.value)}
                  onBlur={handleLabelSave}
                  onKeyDown={e => { if (e.key === "Enter") handleLabelSave() }}
                  autoFocus
                />
              ) : (
                <span
                  className="seq-label"
                  onClick={() => { setEditingLabelId(seq.id); setEditingLabelValue(seq.label) }}
                  title={t("fragmentLibrary.rename")}
                >
                  #{seq.label}
                </span>
              )}

              <span style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
                {t.n("fragmentLibrary.fragments", seq.fragments.length)}
              </span>

              <SequenceBar sequence={seq} duration={duration} />

              {/* Play → navigate to Sequence Player page */}
              <div className="seq-controls">
                <button
                  className="seq-controls__btn"
                  onClick={() => navigate(`/file/${audioId}/player/${seq.id}`)}
                  disabled={seq.fragments.length === 0}
                  title={seq.fragments.length === 0 ? t("fragmentLibrary.noFragments") : t("fragmentLibrary.openPlayer")}
                >
                  <PlayIcon />
                </button>

                {/* Edit / Copy / Delete */}
                <button className="seq-controls__btn" onClick={() => navigate(`/file/${audioId}/editor/${seq.id}`)} title={t("common.edit")}>
                  <EditIcon />
                </button>
                <button className="seq-controls__btn" onClick={() => handleCopySequence(seq)} title={t("fragmentLibrary.copy")}>
                  <CopyIcon />
                </button>
                <button className="seq-controls__btn" onClick={() => setConfirmDeleteId(seq.id)} title={t("common.delete")} style={{ color: "var(--color-danger)" }}>
                  <DeleteIcon />
                </button>
                <button
                  className="seq-controls__btn"
                  onClick={() => updateSequence({ ...seq, favourite: !seq.favourite })}
                  title={seq.favourite ? t("fragmentLibrary.removeFav") : t("fragmentLibrary.addFav")}
                >
                  <FavouriteIcon filled={!!seq.favourite} />
                </button>
              </div>
            </div>
          </div>
        )
      })}


      {/* Delete confirmation modal */}
      {confirmDeleteId && (
        <div className="modal-overlay" onClick={() => setConfirmDeleteId(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <p>{t("fragmentLibrary.confirmDelete")}</p>
            <div className="modal-actions">
              <button onClick={async () => {
                await deleteSequence(confirmDeleteId)
                setConfirmDeleteId(null)
              }} className="btn-danger">{t("common.delete")}</button>
              <button onClick={() => setConfirmDeleteId(null)}>{t("common.cancel")}</button>
            </div>
          </div>
        </div>
      )}

      {/* Subtitle file management modal */}
      {subModalOpen && (
        <div className="modal-overlay" onClick={() => setSubModalOpen(false)}>
          <div className="modal-box modal-box--wide" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <h3 style={{ marginTop: 0 }}>{t("fragmentLibrary.subTitle")}</h3>

            {subtitleFiles.length === 0 ? (
              <p className="empty-state" style={{ fontSize: "0.9rem" }}>{t("fragmentLibrary.subEmpty")}</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                {subtitleFiles.map(sf => (
                  <div key={sf.id} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 14px", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)",
                    background: "var(--color-bg-subtle)",
                  }}>
                    <span style={{ fontSize: "0.9rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
                      {sf.name}
                    </span>
                    <button
                      className="btn-sub"
                      onClick={() => handleDeleteSubtitleFile(sf.id)}
                      style={{ color: "var(--color-danger)", flexShrink: 0, marginLeft: 8 }}
                      title={t("fragmentLibrary.deleteSubFile")}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginBottom: 8 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <button className="btn-primary" onClick={() => subFileInputRef.current?.click()}>
                  {t("fragmentLibrary.addSub")}
                </button>
                <input
                  ref={subFileInputRef}
                  type="file"
                  accept=".txt,.srt,.vtt"
                  onChange={handleSubFileUpload}
                  style={{ display: "none" }}
                />
              </label>
            </div>

            <div className="modal-actions">
              <button onClick={() => setSubModalOpen(false)}>{t("common.close")}</button>
            </div>
          </div>
        </div>
      )}

      {/* Vocabulary file management modal */}
      {vocabModalOpen && (
        <div className="modal-overlay" onClick={() => setVocabModalOpen(false)}>
          <div className="modal-box modal-box--wide" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <h3 style={{ marginTop: 0 }}>{t("fragmentLibrary.vocabTitle")}</h3>

            {vocabularyFiles.length === 0 ? (
              <p className="empty-state" style={{ fontSize: "0.9rem" }}>{t("fragmentLibrary.vocabEmpty")}</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                {vocabularyFiles.map(vf => (
                  <div key={vf.id} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 14px", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)",
                    background: "var(--color-bg-subtle)",
                  }}>
                    <span style={{ fontSize: "0.9rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
                      {vf.name}
                    </span>
                    <button
                      className="btn-sub"
                      onClick={() => handleDeleteVocabularyFile(vf.id)}
                      style={{ color: "var(--color-danger)", flexShrink: 0, marginLeft: 8 }}
                      title={t("fragmentLibrary.deleteVocabFile")}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginBottom: 8 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <button className="btn-primary" onClick={() => vocabFileInputRef.current?.click()}>
                  {t("fragmentLibrary.addVocab")}
                </button>
                <input
                  ref={vocabFileInputRef}
                  type="file"
                  accept=".txt,.csv,.tsv,.md,.json"
                  onChange={handleVocabFileUpload}
                  style={{ display: "none" }}
                />
              </label>
            </div>

            <div className="modal-actions">
              <button onClick={() => setVocabModalOpen(false)}>{t("common.close")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}