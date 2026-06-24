"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import type { Question, TestStatus } from "@/types";
import { useDatabase, useStore } from "@/lib/data/store";
import { testById } from "@/lib/data/selectors";
import { useToast } from "@/components/toast";
import { PageHeader } from "@/components/admin/PageHeader";
import { QuestionModal, type QuestionDraft } from "@/components/admin/QuestionModal";
import { ImportBankModal } from "@/components/admin/ImportBankModal";
import { Card, CardHeader, CardBody, Button, Input, Select, Badge, Pill, Modal, Icon, EmptyState } from "@/components/ui";

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(v: string): string {
  return new Date(v).toISOString();
}
function stripDraft(d: QuestionDraft): Omit<Question, "id" | "order"> {
  const { subject: _s, ...rest } = d;
  void _s;
  return rest as Omit<Question, "id" | "order">;
}

export default function TestEditorPage() {
  const params = useParams();
  const id = String(params.id);
  const db = useDatabase();
  const store = useStore();
  const { toast } = useToast();

  const test = testById(db, id);

  // Settings form (local until Save).
  const [form, setForm] = useState(() =>
    test
      ? {
          title: test.title,
          subject: test.subject,
          durationMinutes: test.durationMinutes,
          cohortId: test.cohortId ?? "",
          opensAt: toLocalInput(test.opensAt),
          closesAt: toLocalInput(test.closesAt),
          testCode: test.testCode,
          status: test.status,
        }
      : null,
  );

  const [qModalOpen, setQModalOpen] = useState(false);
  const [editingQ, setEditingQ] = useState<Question | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [deleteQId, setDeleteQId] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const questions = useMemo(() => (test ? [...test.questions].sort((a, b) => a.order - b.order) : []), [test]);

  if (!test || !form) {
    return (
      <div className="px-4 py-6">
        <PageHeader title="Test not found" back={{ href: "/admin/tests", label: "Tests" }} />
        <EmptyState icon={<Icon.Doc />} title="This test no longer exists" />
      </div>
    );
  }

  const canSave = form.title.trim().length > 0 && questions.length > 0;

  function saveSettings() {
    if (!form || !canSave) return;
    store.updateTest(id, {
      title: form.title.trim(),
      subject: form.subject.trim() || "General",
      durationMinutes: Math.max(1, form.durationMinutes),
      cohortId: form.cohortId || null,
      opensAt: fromLocalInput(form.opensAt),
      closesAt: fromLocalInput(form.closesAt),
      testCode: form.testCode.trim(),
      status: form.status,
    });
    toast("Test saved.", "success");
  }

  function move(index: number, dir: -1 | 1) {
    const next = [...questions];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    store.reorderQuestions(id, next.map((q) => q.id));
  }

  function onDrop(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex) return;
    const next = [...questions];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(targetIndex, 0, moved);
    store.reorderQuestions(id, next.map((q) => q.id));
    setDragIndex(null);
  }

  const set = <K extends keyof NonNullable<typeof form>>(k: K, v: NonNullable<typeof form>[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  return (
    <div className="px-4 py-6 sm:px-6">
      <PageHeader
        title="Edit test"
        subtitle={test.title}
        back={{ href: "/admin/tests", label: "Tests" }}
        actions={
          <>
            <Pill>{test.testCode}</Pill>
            <Button onClick={saveSettings} disabled={!canSave}>Save</Button>
          </>
        }
      />
      {!canSave && (
        <p className="mb-4 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning">
          Add a title and at least one question to save this test.
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-5">
        {/* Settings */}
        <Card className="lg:col-span-2">
          <CardHeader><h2 className="font-bold text-ink">Details</h2></CardHeader>
          <CardBody className="space-y-4">
            <Input label="Title" value={form.title} onChange={(e) => set("title", e.target.value)} required />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Subject" value={form.subject} onChange={(e) => set("subject", e.target.value)} />
              <Input label="Duration (min)" type="number" min={1} value={form.durationMinutes} onChange={(e) => set("durationMinutes", Number(e.target.value))} />
            </div>
            <Input label="Test code" value={form.testCode} onChange={(e) => set("testCode", e.target.value)} />
            <Select label="Cohort" value={form.cohortId} onChange={(e) => set("cohortId", e.target.value)}>
              <option value="">Open to all cohorts</option>
              {db.cohorts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-ink-2">Opens</label>
                <input type="datetime-local" value={form.opensAt} onChange={(e) => set("opensAt", e.target.value)} className="h-12 w-full rounded-md border border-border-strong bg-surface px-3 text-ink" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-ink-2">Closes</label>
                <input type="datetime-local" value={form.closesAt} onChange={(e) => set("closesAt", e.target.value)} className="h-12 w-full rounded-md border border-border-strong bg-surface px-3 text-ink" />
              </div>
            </div>
            <Select label="Status" value={form.status} onChange={(e) => set("status", e.target.value as TestStatus)}>
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="closed">Closed</option>
            </Select>
          </CardBody>
        </Card>

        {/* Questions */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-bold text-ink">Questions <span className="text-ink-3">({questions.length})</span></h2>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => setImportOpen(true)}>
                  <Icon.Bank className="h-4 w-4" /> Import
                </Button>
                <Button size="sm" onClick={() => { setEditingQ(null); setQModalOpen(true); }}>
                  <Icon.Plus className="h-4 w-4" /> Add
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardBody>
            {questions.length === 0 ? (
              <EmptyState icon={<Icon.Doc />} title="No questions yet" message="Add a question or import from the bank." />
            ) : (
              <ul className="space-y-2">
                {questions.map((q, i) => (
                  <li
                    key={q.id}
                    draggable
                    onDragStart={() => setDragIndex(i)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => onDrop(i)}
                    className="flex items-start gap-2 rounded-md border border-border bg-surface p-3"
                  >
                    <span className="mt-1 cursor-grab text-ink-3" aria-hidden><Icon.Grip className="h-4 w-4" /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-ink-3">Q{i + 1}</span>
                        <Badge tone="neutral" className="uppercase">{q.type}</Badge>
                        <Badge tone="brand">{q.topic}</Badge>
                        <Pill>{q.marks}m</Pill>
                      </div>
                      <p className="mt-1.5 text-sm text-ink">{q.prompt}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-center gap-0.5">
                      <button onClick={() => move(i, -1)} disabled={i === 0} className="flex h-7 w-7 items-center justify-center rounded text-ink-3 hover:bg-surface-2 disabled:opacity-30" aria-label="Move up">
                        <Icon.ChevronLeft className="h-4 w-4 rotate-90" />
                      </button>
                      <button onClick={() => move(i, 1)} disabled={i === questions.length - 1} className="flex h-7 w-7 items-center justify-center rounded text-ink-3 hover:bg-surface-2 disabled:opacity-30" aria-label="Move down">
                        <Icon.ChevronRight className="h-4 w-4 rotate-90" />
                      </button>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button onClick={() => { setEditingQ(q); setQModalOpen(true); }} className="flex h-8 w-8 items-center justify-center rounded text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label="Edit question">
                        <Icon.Edit className="h-4 w-4" />
                      </button>
                      <button onClick={() => setDeleteQId(q.id)} className="flex h-8 w-8 items-center justify-center rounded text-ink-3 hover:bg-error-soft hover:text-error" aria-label="Delete question">
                        <Icon.Trash className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <QuestionModal
        open={qModalOpen}
        onClose={() => setQModalOpen(false)}
        initial={editingQ ? ({ ...editingQ } as QuestionDraft) : null}
        onSave={(draft) => {
          if (editingQ) store.updateQuestion(id, editingQ.id, stripDraft(draft));
          else store.addQuestion(id, stripDraft(draft));
          setQModalOpen(false);
          toast(editingQ ? "Question updated." : "Question added.", "success");
        }}
      />

      <ImportBankModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={(ids) => { store.importBankItems(id, ids); toast(`${ids.length} question${ids.length === 1 ? "" : "s"} imported.`, "success"); }}
      />

      <Modal
        open={!!deleteQId}
        onClose={() => setDeleteQId(null)}
        title="Delete question?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteQId(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => { if (deleteQId) store.deleteQuestion(id, deleteQId); setDeleteQId(null); }}>Delete</Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">This removes the question from this test only.</p>
      </Modal>
    </div>
  );
}
