"use client";

import { useMemo, useState } from "react";
import { useDatabase } from "@/lib/data/store";
import { Modal, Button, Input, Select, Checkbox, Badge, EmptyState, Icon } from "@/components/ui";

/** Multi-select bank picker → returns chosen bank item ids to import. */
export function ImportBankModal({
  open,
  onClose,
  onImport,
}: {
  open: boolean;
  onClose: () => void;
  onImport: (ids: string[]) => void;
}) {
  const db = useDatabase();
  const [q, setQ] = useState("");
  const [subject, setSubject] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const subjects = useMemo(() => Array.from(new Set(db.bank.map((b) => b.subject))).sort(), [db.bank]);
  const items = useMemo(
    () =>
      db.bank
        .filter((b) => (subject === "all" ? true : b.subject === subject))
        .filter((b) => (q.trim() ? (b.prompt + b.topic).toLowerCase().includes(q.toLowerCase()) : true)),
    [db.bank, subject, q],
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function confirm() {
    onImport(Array.from(selected));
    setSelected(new Set());
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Import from question bank"
      description="Select reusable questions to copy into this test."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={confirm} disabled={selected.size === 0}>
            Import {selected.size > 0 ? `(${selected.size})` : ""}
          </Button>
        </>
      }
    >
      <div className="mb-3 flex flex-wrap gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search questions…" className="min-w-40 flex-1" aria-label="Search bank" />
        <Select value={subject} onChange={(e) => setSubject(e.target.value)} className="w-auto min-w-36" aria-label="Filter subject">
          <option value="all">All subjects</option>
          {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
      </div>

      {items.length === 0 ? (
        <EmptyState icon={<Icon.Search />} title="No matching questions" />
      ) : (
        <ul className="space-y-2">
          {items.map((b) => (
            <li
              key={b.id}
              className={"flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 " + (selected.has(b.id) ? "border-brand bg-brand-soft" : "border-border bg-surface")}
              onClick={() => toggle(b.id)}
            >
              <Checkbox checked={selected.has(b.id)} onChange={() => toggle(b.id)} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="neutral">{b.subject}</Badge>
                  <span className="text-xs uppercase tracking-wide text-ink-3">{b.type} · {b.topic} · {b.marks}m</span>
                </div>
                <p className="mt-1 text-sm text-ink">{b.prompt}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
