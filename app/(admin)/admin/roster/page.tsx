"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Student } from "@/types";
import { useDatabase, useStore } from "@/lib/data/store";
import { useAdminFilter } from "@/lib/admin-filter";
import { cohortById } from "@/lib/data/selectors";
import { useToast } from "@/components/toast";
import { PageHeader } from "@/components/admin/PageHeader";
import { CsvImportModal } from "@/components/admin/CsvImportModal";
import { Card, Button, Input, Select, Label, CohortDot, Modal, EmptyState, Icon } from "@/components/ui";
import { cn } from "@/lib/cn";

function genPassword() {
  const words = ["maple", "river", "amber", "delta", "lunar", "cedar", "north", "ochre"];
  const w = words[Math.floor(Math.random() * words.length)];
  return `${w}${Math.floor(100 + Math.random() * 900)}`;
}

function ChipToggle({
  items,
  selected,
  onToggle,
  placeholder,
}: {
  items: { id: string; name: string }[];
  selected: string[];
  onToggle: (id: string) => void;
  placeholder?: string;
}) {
  if (items.length === 0) return <p className="text-sm text-ink-3">{placeholder ?? "None available."}</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => {
        const on = selected.includes(item.id);
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onToggle(item.id)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm font-semibold transition-colors",
              on
                ? "border-brand bg-brand-soft text-brand"
                : "border-border text-ink-2 hover:border-border-strong hover:text-ink",
            )}
          >
            {item.name}
          </button>
        );
      })}
    </div>
  );
}

export default function RosterPage() {
  const db = useDatabase();
  const store = useStore();
  const { toast } = useToast();
  const { cohortId } = useAdminFilter();

  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Student | "new" | null>(null);
  const [form, setForm] = useState({ username: "", email: "", cohortId: "", tempPassword: "", classIds: [] as string[], subjectIds: [] as string[] });
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Student | null>(null);
  const [importing, setImporting] = useState(false);

  const students = useMemo(
    () =>
      db.students
        .filter((s) => (cohortId ? s.cohortId === cohortId : true))
        .filter((s) => (search.trim() ? (s.username + (s.email ?? "")).toLowerCase().includes(search.toLowerCase()) : true))
        .sort((a, b) => a.username.localeCompare(b.username)),
    [db.students, cohortId, search],
  );

  // Classes/subjects available for the selected cohort in the form
  const selectedCohort = db.cohorts.find((c) => c.id === form.cohortId);
  const availableClasses = selectedCohort
    ? db.classes.filter((c) => selectedCohort.classIds.includes(c.id))
    : db.classes;
  const availableSubjects = selectedCohort
    ? db.subjects.filter((s) => selectedCohort.subjectIds.includes(s.id))
    : db.subjects;

  function toggleClass(id: string) {
    setForm((f) => ({
      ...f,
      classIds: f.classIds.includes(id) ? f.classIds.filter((x) => x !== id) : [...f.classIds, id],
    }));
  }
  function toggleSubject(id: string) {
    setForm((f) => ({
      ...f,
      subjectIds: f.subjectIds.includes(id) ? f.subjectIds.filter((x) => x !== id) : [...f.subjectIds, id],
    }));
  }

  function openNew() {
    setEditing("new");
    setForm({ username: "", email: "", cohortId: cohortId ?? db.cohorts[0]?.id ?? "", tempPassword: genPassword(), classIds: [], subjectIds: [] });
    setError(null);
  }
  function openEdit(s: Student) {
    setEditing(s);
    setForm({ username: s.username, email: s.email ?? "", cohortId: s.cohortId, tempPassword: s.tempPassword ?? "", classIds: [...s.classIds], subjectIds: [...s.subjectIds] });
    setError(null);
  }
  function save() {
    if (!form.username.trim()) return setError("Username is required.");
    if (!form.cohortId) return setError("Choose a cohort.");
    const exceptId = editing !== "new" && editing ? editing.id : undefined;
    if (store.usernameTaken(form.username, exceptId)) return setError("That username is already taken.");
    if (!form.tempPassword.trim()) return setError("Set a temporary password.");
    if (editing === "new") {
      store.addStudent({ username: form.username.trim(), email: form.email.trim() || undefined, cohortId: form.cohortId, tempPassword: form.tempPassword.trim(), classIds: form.classIds, subjectIds: form.subjectIds });
      toast("Student added.", "success");
    } else if (editing) {
      store.updateStudent(editing.id, { username: form.username.trim(), email: form.email.trim() || undefined, cohortId: form.cohortId, tempPassword: form.tempPassword.trim(), classIds: form.classIds, subjectIds: form.subjectIds });
      toast("Student updated.", "success");
    }
    setEditing(null);
  }

  return (
    <div className="px-4 py-6 sm:px-6">
      <PageHeader
        title="Roster"
        subtitle={`${students.length} students`}
        actions={
          <>
            <Button variant="secondary" onClick={() => setImporting(true)} disabled={db.cohorts.length === 0}>
              <Icon.Download className="h-4 w-4" /> Import CSV
            </Button>
            <Button onClick={openNew} disabled={db.cohorts.length === 0}><Icon.Plus className="h-4 w-4" /> Add student</Button>
          </>
        }
      />

      <div className="mb-4">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search students…" className="max-w-xs" aria-label="Search students" />
      </div>

      {students.length === 0 ? (
        <EmptyState icon={<Icon.Users />} title="No students" message="Add a student to get started." />
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {students.map((s) => {
            const cohort = cohortById(db, s.cohortId);
            const released = db.submissions.filter((x) => x.studentId === s.id && x.status === "released").length;
            const classNames = s.classIds.map((cid) => db.classes.find((x) => x.id === cid)?.name).filter(Boolean);
            const subjectNames = s.subjectIds.map((sid) => db.subjects.find((x) => x.id === sid)?.name).filter(Boolean);
            return (
              <Card key={s.id} className="flex items-start justify-between gap-3 p-4">
                <Link href={`/admin/roster/${s.id}`} className="flex min-w-0 items-start gap-3 hover:opacity-80">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-2 font-display text-sm font-bold uppercase text-ink-2">
                    {s.username.slice(0, 2)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-bold capitalize text-ink">{s.username}</p>
                    <p className="flex items-center gap-1.5 text-sm text-ink-2">
                      {cohort && <CohortDot color={cohort.color} />}
                      <span className="truncate">{cohort?.name ?? "—"}</span>
                      <span className="text-ink-3">· {released} results</span>
                    </p>
                    {(classNames.length > 0 || subjectNames.length > 0) && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {classNames.map((n) => (
                          <span key={n} className="rounded border border-border px-1.5 py-0.5 text-xs text-ink-2">{n}</span>
                        ))}
                        {subjectNames.map((n) => (
                          <span key={n} className="rounded border border-brand/40 bg-brand-soft px-1.5 py-0.5 text-xs text-brand">{n}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </Link>
                <div className="flex shrink-0 gap-1">
                  <button onClick={() => openEdit(s)} className="flex h-9 w-9 items-center justify-center rounded text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label={`Edit ${s.username}`}>
                    <Icon.Edit className="h-4 w-4" />
                  </button>
                  <button onClick={() => setDeleting(s)} className="flex h-9 w-9 items-center justify-center rounded text-ink-3 hover:bg-error-soft hover:text-error" aria-label={`Delete ${s.username}`}>
                    <Icon.Trash className="h-4 w-4" />
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Add student" : "Edit student"}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save}>{editing === "new" ? "Add" : "Save"}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Username" value={form.username} onChange={(e) => { setForm({ ...form, username: e.target.value }); setError(null); }} required autoCapitalize="none" />
          <Input label="Email (optional)" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Select label="Cohort" value={form.cohortId} onChange={(e) => setForm({ ...form, cohortId: e.target.value, classIds: [], subjectIds: [] })}>
            <option value="">Choose…</option>
            {db.cohorts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <div>
            <Label>Classes</Label>
            <p className="mb-2 text-xs text-ink-3">
              {form.cohortId ? "Select which classes this student takes." : "Select a cohort first to see available classes."}
            </p>
            <ChipToggle
              items={availableClasses}
              selected={form.classIds}
              onToggle={toggleClass}
              placeholder={form.cohortId ? "No classes assigned to this cohort yet." : ""}
            />
          </div>
          <div>
            <Label>Subjects</Label>
            <p className="mb-2 text-xs text-ink-3">
              {form.cohortId ? "Select which subjects this student takes." : "Select a cohort first to see available subjects."}
            </p>
            <ChipToggle
              items={availableSubjects}
              selected={form.subjectIds}
              onToggle={toggleSubject}
              placeholder={form.cohortId ? "No subjects assigned to this cohort yet." : ""}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-ink-2">Temporary password</label>
            <div className="flex gap-2">
              <Input value={form.tempPassword} onChange={(e) => setForm({ ...form, tempPassword: e.target.value })} className="flex-1" aria-label="Temporary password" />
              <Button type="button" variant="secondary" onClick={() => setForm({ ...form, tempPassword: genPassword() })}>Generate</Button>
            </div>
            <p className="mt-1.5 text-xs text-ink-3">Share this with the student for their first sign-in.</p>
          </div>
          {error && <p className="rounded-md border border-error/30 bg-error-soft px-3 py-2 text-sm font-medium text-error">{error}</p>}
        </div>
      </Modal>

      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete student?"
        description={deleting ? `${deleting.username} and their submissions will be removed.` : ""}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => { if (deleting) store.deleteStudent(deleting.id); setDeleting(null); toast("Student deleted.", "success"); }}>Delete</Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">This action cannot be undone.</p>
      </Modal>

      <CsvImportModal open={importing} onClose={() => setImporting(false)} />
    </div>
  );
}
