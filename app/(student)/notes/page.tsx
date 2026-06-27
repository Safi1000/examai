"use client";

import { useDatabase } from "@/lib/data/store";
import { useAuth } from "@/lib/auth-context";
import { studentById } from "@/lib/data/selectors";
import { EmptyState, Icon } from "@/components/ui";
import { cn } from "@/lib/cn";

function downloadFile(url: string, fileName: string) {
  window.location.href = `/api/download?url=${encodeURIComponent(url)}&name=${encodeURIComponent(fileName)}`;
}

function fileIcon(type: string) {
  if (type.startsWith("image/")) return "🖼️";
  if (type.includes("pdf")) return "📄";
  if (type.includes("word") || type.includes("document")) return "📝";
  if (type.includes("sheet") || type.includes("excel")) return "📊";
  if (type.includes("presentation") || type.includes("powerpoint")) return "📑";
  return "📎";
}

function fileLabel(type: string) {
  if (type.startsWith("image/")) return "Image";
  if (type.includes("pdf")) return "PDF";
  if (type.includes("word") || type.includes("document")) return "Word";
  if (type.includes("sheet") || type.includes("excel")) return "Excel";
  if (type.includes("presentation") || type.includes("powerpoint")) return "PowerPoint";
  return "File";
}

function scopeLabel(
  cohortName: string | undefined,
  className: string | undefined,
  subjectName: string | undefined,
): string {
  const parts = [cohortName, className, subjectName].filter(Boolean);
  return parts.join(" › ");
}

export default function StudentNotesPage() {
  const db = useDatabase();
  const { session } = useAuth();

  if (!session?.studentId) return null;
  const student = studentById(db, session.studentId);
  if (!student) return null;

  // The store already applies RLS so db.notes only contains notes this student
  // can access. We still filter locally to build per-note scope labels.
  const accessibleAssignments = db.noteAssignments.filter((na) => {
    if (na.cohortId !== student.cohortId) return false;
    if (na.classId && !student.classIds.includes(na.classId)) return false;
    if (na.subjectId && !student.subjectIds.includes(na.subjectId)) return false;
    return true;
  });

  const accessibleNoteIds = new Set(accessibleAssignments.map((a) => a.noteId));
  const notes = db.notes.filter((n) => accessibleNoteIds.has(n.id));

  // Group notes by subject, then "General" for cohort-only
  const bySubject = new Map<string, typeof notes>();
  for (const note of notes) {
    const assignment = accessibleAssignments.find((a) => a.noteId === note.id);
    const subjectName = assignment?.subjectId
      ? db.subjects.find((s) => s.id === assignment.subjectId)?.name ?? "Other"
      : assignment?.classId
      ? db.classes.find((c) => c.id === assignment.classId)?.name ?? "Other"
      : "General";
    if (!bySubject.has(subjectName)) bySubject.set(subjectName, []);
    bySubject.get(subjectName)!.push(note);
  }

  const groups = Array.from(bySubject.entries()).sort(([a], [b]) => {
    if (a === "General") return 1;
    if (b === "General") return -1;
    return a.localeCompare(b);
  });

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-1 font-display text-2xl font-bold text-ink">Notes</h1>
      <p className="mb-6 text-sm text-ink-3">Things your teacher wants you to have.</p>

      {notes.length === 0 ? (
        <EmptyState
          icon={<Icon.Doc />}
          title="No notes yet"
          message="Your teacher hasn't shared any notes with you yet. Check back later."
        />
      ) : (
        <div className="space-y-8">
          {groups.map(([groupName, groupNotes]) => (
            <section key={groupName}>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-3">{groupName}</h2>
              <div className="space-y-2">
                {groupNotes.map((note) => {
                  const assignment = accessibleAssignments.find((a) => a.noteId === note.id);
                  const cohortName = db.cohorts.find((c) => c.id === assignment?.cohortId)?.name;
                  const className = assignment?.classId ? db.classes.find((c) => c.id === assignment.classId)?.name : undefined;
                  const subjectName = assignment?.subjectId ? db.subjects.find((s) => s.id === assignment.subjectId)?.name : undefined;
                  const scope = scopeLabel(cohortName, className, subjectName);

                  return (
                    <div
                      key={note.id}
                      className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface p-4"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="text-2xl leading-none">{fileIcon(note.fileType)}</span>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-ink">{note.title}</p>
                          <p className="flex items-center gap-1.5 text-xs text-ink-3">
                            <span className={cn(
                              "rounded px-1.5 py-0.5 font-medium",
                              "border border-border bg-surface-2",
                            )}>
                              {fileLabel(note.fileType)}
                            </span>
                            {scope && <span className="truncate">{scope}</span>}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => downloadFile(note.fileUrl, note.fileName)}
                        className={cn(
                          "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold",
                          "bg-brand-soft text-brand hover:opacity-80 transition-opacity",
                        )}
                        aria-label={`Download ${note.title}`}
                      >
                        <Icon.Download className="h-4 w-4" />
                        <span className="hidden sm:inline">Download</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
