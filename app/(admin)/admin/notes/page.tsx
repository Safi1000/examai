"use client";

import { useRef, useState } from "react";
import { useDatabase, useStore } from "@/lib/data/store";
import { useToast } from "@/components/toast";
import { PageHeader } from "@/components/admin/PageHeader";
import { Card, Button, Input, Select, Label, Modal, EmptyState, Icon } from "@/components/ui";
import type { Note, NoteAssignment } from "@/types";
import { uploadNote, notesConfigured } from "@/lib/cloudinary";

const ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.webp";

function fileIcon(type: string) {
  if (type.startsWith("image/")) return "🖼️";
  if (type.includes("pdf")) return "📄";
  if (type.includes("word") || type.includes("document")) return "📝";
  if (type.includes("sheet") || type.includes("excel")) return "📊";
  if (type.includes("presentation") || type.includes("powerpoint")) return "📑";
  return "📎";
}

function AssignmentBadge({ assignment, db, onDelete }: {
  assignment: NoteAssignment;
  db: ReturnType<typeof useDatabase>;
  onDelete: () => void;
}) {
  const cohort = db.cohorts.find((c) => c.id === assignment.cohortId);
  const cls = assignment.classId ? db.classes.find((c) => c.id === assignment.classId) : null;
  const subj = assignment.subjectId ? db.subjects.find((s) => s.id === assignment.subjectId) : null;

  const parts = [cohort?.name, cls?.name, subj?.name].filter(Boolean);

  return (
    <span className="flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2 py-1 text-xs text-ink-2">
      {parts.join(" › ")}
      <button onClick={onDelete} className="text-ink-3 hover:text-error" aria-label="Remove assignment">
        <Icon.Close className="h-3 w-3" />
      </button>
    </span>
  );
}

export default function NotesPage() {
  const db = useDatabase();
  const store = useStore();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  // Upload modal state
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Assignment form state (inside upload modal)
  const [aCohortId, setACohortId] = useState("");
  const [aClassId, setAClassId] = useState("");
  const [aSubjectId, setASubjectId] = useState("");
  const [pendingAssignments, setPendingAssignments] = useState<{ cohortId: string; classId: string | null; subjectId: string | null }[]>([]);

  // Post-upload: adding assignments to existing note
  const [assigningNote, setAssigningNote] = useState<Note | null>(null);
  const [eaCohortId, setEACohortId] = useState("");
  const [eaClassId, setEAClassId] = useState("");
  const [eaSubjectId, setEASubjectId] = useState("");

  // Delete confirmation
  const [deletingNote, setDeletingNote] = useState<Note | null>(null);

  function resetUploadModal() {
    setUploadTitle("");
    setUploadFile(null);
    setUploadError(null);
    setACohortId("");
    setAClassId("");
    setASubjectId("");
    setPendingAssignments([]);
    if (fileRef.current) fileRef.current.value = "";
  }

  function openUpload() {
    resetUploadModal();
    setShowUpload(true);
  }

  // Classes/subjects available for the selected cohort in the assignment form
  const cohortForA = db.cohorts.find((c) => c.id === aCohortId);
  const classesForA = cohortForA ? db.classes.filter((c) => cohortForA.classIds.includes(c.id)) : [];
  const subjectsForA = cohortForA ? db.subjects.filter((s) => cohortForA.subjectIds.includes(s.id)) : [];

  const cohortForEA = db.cohorts.find((c) => c.id === eaCohortId);
  const classesForEA = cohortForEA ? db.classes.filter((c) => cohortForEA.classIds.includes(c.id)) : [];
  const subjectsForEA = cohortForEA ? db.subjects.filter((s) => cohortForEA.subjectIds.includes(s.id)) : [];

  function addPendingAssignment() {
    if (!aCohortId) return;
    const already = pendingAssignments.some(
      (a) => a.cohortId === aCohortId && a.classId === (aClassId || null) && a.subjectId === (aSubjectId || null),
    );
    if (already) return;
    setPendingAssignments((prev) => [...prev, { cohortId: aCohortId, classId: aClassId || null, subjectId: aSubjectId || null }]);
    setAClassId("");
    setASubjectId("");
  }

  async function handleUpload() {
    if (!uploadTitle.trim()) return setUploadError("Title is required.");
    if (!uploadFile) return setUploadError("Select a file.");
    if (!notesConfigured()) return setUploadError("Cloudinary is not configured. Set NEXT_PUBLIC_CLOUDINARY_CLOUD and NEXT_PUBLIC_CLOUDINARY_NOTES_PRESET.");

    setUploading(true);
    setUploadError(null);
    try {
      const { url, fileType, fileName } = await uploadNote(uploadFile);
      const noteId = await store.addNote(uploadTitle.trim(), url, fileType, fileName);
      for (const a of pendingAssignments) {
        store.addNoteAssignment(noteId, a.cohortId, a.classId, a.subjectId);
      }
      toast("Note uploaded.", "success");
      setShowUpload(false);
      resetUploadModal();
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  function addExistingAssignment() {
    if (!assigningNote || !eaCohortId) return;
    const existing = db.noteAssignments.filter((na) => na.noteId === assigningNote.id);
    const already = existing.some(
      (a) => a.cohortId === eaCohortId && a.classId === (eaClassId || null) && a.subjectId === (eaSubjectId || null),
    );
    if (already) { toast("That assignment already exists.", "error"); return; }
    store.addNoteAssignment(assigningNote.id, eaCohortId, eaClassId || null, eaSubjectId || null);
    setEACohortId("");
    setEAClassId("");
    setEASubjectId("");
    toast("Assignment added.", "success");
  }

  return (
    <div className="px-4 py-6 sm:px-6">
      <PageHeader
        title="Notes"
        subtitle={`${db.notes.length} uploaded`}
        actions={<Button onClick={openUpload}><Icon.Plus className="h-4 w-4" /> Upload note</Button>}
      />

      {db.notes.length === 0 ? (
        <EmptyState
          icon={<Icon.Doc />}
          title="No notes yet"
          message="Upload PDFs, Word docs, images, and more. Assign them to cohorts, classes, or subjects."
          action={<Button onClick={openUpload}>Upload first note</Button>}
        />
      ) : (
        <div className="space-y-3">
          {db.notes.map((note) => {
            const assignments = db.noteAssignments.filter((na) => na.noteId === note.id);
            return (
              <Card key={note.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="text-2xl leading-none">{fileIcon(note.fileType)}</span>
                    <div className="min-w-0">
                      <p className="font-bold text-ink">{note.title}</p>
                      <p className="text-sm text-ink-3">{note.fileName}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {assignments.length === 0 && (
                          <span className="text-xs text-ink-3">No assignments yet</span>
                        )}
                        {assignments.map((a) => (
                          <AssignmentBadge
                            key={a.id}
                            assignment={a}
                            db={db}
                            onDelete={() => store.deleteNoteAssignment(a.id)}
                          />
                        ))}
                        <button
                          onClick={() => { setAssigningNote(note); setEACohortId(""); setEAClassId(""); setEASubjectId(""); }}
                          className="flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-xs text-ink-3 hover:border-border-strong hover:text-ink"
                        >
                          <Icon.Plus className="h-3 w-3" /> Assign
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <a
                      href={`/api/download?url=${encodeURIComponent(note.fileUrl)}&name=${encodeURIComponent(note.fileName)}`}
                      className="flex h-9 w-9 items-center justify-center rounded text-ink-3 hover:bg-surface-2 hover:text-ink"
                      aria-label="Download file"
                    >
                      <Icon.ChevronRight className="h-4 w-4" />
                    </a>
                    <button
                      onClick={() => setDeletingNote(note)}
                      className="flex h-9 w-9 items-center justify-center rounded text-ink-3 hover:bg-error-soft hover:text-error"
                      aria-label="Delete note"
                    >
                      <Icon.Trash className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Upload modal */}
      <Modal
        open={showUpload}
        onClose={() => { setShowUpload(false); resetUploadModal(); }}
        title="Upload note"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setShowUpload(false); resetUploadModal(); }}>Cancel</Button>
            <Button onClick={handleUpload} disabled={uploading || !uploadTitle.trim() || !uploadFile}>
              {uploading ? "Uploading…" : "Upload"}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <Input
            label="Title"
            value={uploadTitle}
            onChange={(e) => setUploadTitle(e.target.value)}
            placeholder="e.g. Chapter 3 – Supply & Demand"
            required
            autoFocus
          />

          <div>
            <Label required>File</Label>
            <div className="mt-1">
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPT}
                onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-ink-2 file:mr-3 file:rounded-md file:border-0 file:bg-brand-soft file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-brand hover:file:opacity-80"
              />
              <p className="mt-1 text-xs text-ink-3">PDF, Word, Excel, PowerPoint, or image (max 100 MB)</p>
            </div>
          </div>

          {/* Assignment builder */}
          <div>
            <Label>Assign to</Label>
            <p className="mb-2 text-xs text-ink-3">Cohort is required. Class and Subject are optional (narrower = fewer students see it).</p>

            <div className="space-y-2">
              <Select value={aCohortId} onChange={(e) => { setACohortId(e.target.value); setAClassId(""); setASubjectId(""); }} aria-label="Cohort">
                <option value="">Select cohort…</option>
                {db.cohorts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>

              {aCohortId && classesForA.length > 0 && (
                <Select value={aClassId} onChange={(e) => { setAClassId(e.target.value); setASubjectId(""); }} aria-label="Class (optional)">
                  <option value="">All classes in cohort</option>
                  {classesForA.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              )}

              {aCohortId && subjectsForA.length > 0 && (
                <Select value={aSubjectId} onChange={(e) => setASubjectId(e.target.value)} aria-label="Subject (optional)">
                  <option value="">All subjects in cohort{aClassId ? " & class" : ""}</option>
                  {subjectsForA.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              )}

              <Button
                type="button"
                variant="secondary"
                onClick={addPendingAssignment}
                disabled={!aCohortId}
                className="w-full"
              >
                <Icon.Plus className="h-4 w-4" /> Add assignment
              </Button>
            </div>

            {pendingAssignments.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {pendingAssignments.map((a, i) => {
                  const cohort = db.cohorts.find((c) => c.id === a.cohortId);
                  const cls = a.classId ? db.classes.find((c) => c.id === a.classId) : null;
                  const subj = a.subjectId ? db.subjects.find((s) => s.id === a.subjectId) : null;
                  const parts = [cohort?.name, cls?.name, subj?.name].filter(Boolean);
                  return (
                    <span key={i} className="flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2 py-1 text-xs text-ink-2">
                      {parts.join(" › ")}
                      <button onClick={() => setPendingAssignments((p) => p.filter((_, j) => j !== i))} className="text-ink-3 hover:text-error">
                        <Icon.Close className="h-3 w-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          {uploadError && (
            <p className="rounded-md border border-error/30 bg-error-soft px-3 py-2 text-sm font-medium text-error">{uploadError}</p>
          )}
        </div>
      </Modal>

      {/* Add assignment to existing note */}
      <Modal
        open={!!assigningNote}
        onClose={() => setAssigningNote(null)}
        title={`Assign: ${assigningNote?.title ?? ""}`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAssigningNote(null)}>Done</Button>
            <Button onClick={addExistingAssignment} disabled={!eaCohortId}>Add</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Select label="Cohort" value={eaCohortId} onChange={(e) => { setEACohortId(e.target.value); setEAClassId(""); setEASubjectId(""); }}>
            <option value="">Select cohort…</option>
            {db.cohorts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          {eaCohortId && classesForEA.length > 0 && (
            <Select label="Class (optional)" value={eaClassId} onChange={(e) => { setEAClassId(e.target.value); setEASubjectId(""); }}>
              <option value="">All classes in cohort</option>
              {classesForEA.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          )}
          {eaCohortId && subjectsForEA.length > 0 && (
            <Select label={`Subject (optional)`} value={eaSubjectId} onChange={(e) => setEASubjectId(e.target.value)}>
              <option value="">All subjects in cohort{eaClassId ? " & class" : ""}</option>
              {subjectsForEA.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          )}
        </div>
      </Modal>

      {/* Delete confirmation */}
      <Modal
        open={!!deletingNote}
        onClose={() => setDeletingNote(null)}
        title="Delete note?"
        description={deletingNote ? `"${deletingNote.title}" will be removed for all students.` : ""}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeletingNote(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => { if (deletingNote) store.deleteNote(deletingNote.id); setDeletingNote(null); toast("Note deleted.", "success"); }}>Delete</Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">This cannot be undone. The file will remain on Cloudinary but will no longer be accessible through the app.</p>
      </Modal>
    </div>
  );
}
