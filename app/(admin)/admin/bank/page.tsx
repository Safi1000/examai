"use client";

import { useMemo, useState } from "react";
import type { QuestionBankItem } from "@/types";
import { useDatabase, useStore } from "@/lib/data/store";
import { useToast } from "@/components/toast";
import { PageHeader } from "@/components/admin/PageHeader";
import { QuestionModal, type QuestionDraft } from "@/components/admin/QuestionModal";
import { Card, Button, Input, Select, Badge, Pill, Checkbox, Modal, EmptyState, Icon } from "@/components/ui";

export default function QuestionBankPage() {
  const db = useDatabase();
  const store = useStore();
  const { toast } = useToast();

  const [q, setQ] = useState("");
  const [subject, setSubject] = useState("all");
  const [topic, setTopic] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<QuestionBankItem | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importTestId, setImportTestId] = useState("");

  const subjects = useMemo(() => Array.from(new Set(db.bank.map((b) => b.subject))).sort(), [db.bank]);
  const topics = useMemo(() => Array.from(new Set(db.bank.map((b) => b.topic))).sort(), [db.bank]);

  const items = useMemo(
    () =>
      db.bank
        .filter((b) => (subject === "all" ? true : b.subject === subject))
        .filter((b) => (topic === "all" ? true : b.topic === topic))
        .filter((b) => (q.trim() ? (b.prompt + b.topic + b.subject).toLowerCase().includes(q.toLowerCase()) : true)),
    [db.bank, subject, topic, q],
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function runImport() {
    if (!importTestId) return;
    store.importBankItems(importTestId, Array.from(selected));
    const test = db.tests.find((t) => t.id === importTestId);
    toast(`Imported ${selected.size} into "${test?.title ?? "test"}".`, "success");
    setSelected(new Set());
    setImportOpen(false);
    setImportTestId("");
  }

  return (
    <div className="px-4 py-6 sm:px-6">
      <PageHeader
        title="Question bank"
        subtitle={`${db.bank.length} reusable questions`}
        actions={<Button onClick={() => { setEditing(null); setModalOpen(true); }}><Icon.Plus className="h-4 w-4" /> Add question</Button>}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="min-w-44 flex-1" aria-label="Search bank" />
        <Select value={subject} onChange={(e) => setSubject(e.target.value)} className="w-auto min-w-36" aria-label="Subject">
          <option value="all">All subjects</option>
          {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Select value={topic} onChange={(e) => setTopic(e.target.value)} className="w-auto min-w-32" aria-label="Topic">
          <option value="all">All topics</option>
          {topics.map((t) => <option key={t} value={t}>{t}</option>)}
        </Select>
      </div>

      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-brand/30 bg-brand-soft px-4 py-2.5">
          <span className="text-sm font-semibold text-brand">{selected.size} selected</span>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
            <Button size="sm" onClick={() => setImportOpen(true)}><Icon.Doc className="h-4 w-4" /> Import into test</Button>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState icon={<Icon.Bank />} title="No questions found" message="Adjust filters or add a new reusable question." />
      ) : (
        <ul className="space-y-2">
          {items.map((b) => (
            <Card as="li" key={b.id} className="flex items-start gap-3 p-3">
              <div className="pt-0.5"><Checkbox checked={selected.has(b.id)} onChange={() => toggle(b.id)} /></div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="neutral">{b.subject}</Badge>
                  <Badge tone="brand">{b.topic}</Badge>
                  <span className="text-xs uppercase tracking-wide text-ink-3">{b.type}</span>
                  <Pill>{b.marks}m</Pill>
                </div>
                <p className="mt-1.5 text-sm text-ink">{b.prompt}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button onClick={() => { setEditing(b); setModalOpen(true); }} className="flex h-8 w-8 items-center justify-center rounded text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label="Edit">
                  <Icon.Edit className="h-4 w-4" />
                </button>
                <button onClick={() => setDeleteId(b.id)} className="flex h-8 w-8 items-center justify-center rounded text-ink-3 hover:bg-error-soft hover:text-error" aria-label="Delete">
                  <Icon.Trash className="h-4 w-4" />
                </button>
              </div>
            </Card>
          ))}
        </ul>
      )}

      <QuestionModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        withSubject
        initial={editing ? ({ ...editing } as QuestionDraft) : null}
        onSave={(draft) => {
          const item = draft as Omit<QuestionBankItem, "id">;
          if (editing) store.updateBankItem(editing.id, item);
          else store.addBankItem(item);
          setModalOpen(false);
          toast(editing ? "Question updated." : "Question added to bank.", "success");
        }}
      />

      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import into test"
        description={`Copy ${selected.size} question${selected.size === 1 ? "" : "s"} into a test.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setImportOpen(false)}>Cancel</Button>
            <Button onClick={runImport} disabled={!importTestId}>Import</Button>
          </>
        }
      >
        <Select label="Target test" value={importTestId} onChange={(e) => setImportTestId(e.target.value)}>
          <option value="">Choose a test…</option>
          {db.tests.map((t) => <option key={t.id} value={t.id}>{t.title} ({t.testCode})</option>)}
        </Select>
      </Modal>

      <Modal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Delete bank question?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => { if (deleteId) store.deleteBankItem(deleteId); setDeleteId(null); toast("Deleted.", "success"); }}>Delete</Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">Tests that already imported it keep their copy.</p>
      </Modal>
    </div>
  );
}
