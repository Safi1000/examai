"use client";

import { useState } from "react";
import type { Announcement } from "@/types";
import { useDatabase, useStore } from "@/lib/data/store";
import { cohortById } from "@/lib/data/selectors";
import { useToast } from "@/components/toast";
import { PageHeader } from "@/components/admin/PageHeader";
import { Card, Button, Textarea, Select, Checkbox, Badge, CohortTag, Modal, EmptyState, Icon } from "@/components/ui";
import { formatDate } from "@/lib/time";

const MAX = 250;

export default function AnnouncementsPage() {
  const db = useDatabase();
  const store = useStore();
  const { toast } = useToast();

  const [editing, setEditing] = useState<Announcement | "new" | null>(null);
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [cohortId, setCohortId] = useState("");
  const [deleting, setDeleting] = useState<Announcement | null>(null);

  function openNew() { setEditing("new"); setBody(""); setPinned(false); setCohortId(""); }
  function openEdit(a: Announcement) { setEditing(a); setBody(a.body); setPinned(a.pinned); setCohortId(a.cohortId ?? ""); }
  function save() {
    const text = body.trim().slice(0, MAX);
    if (!text) return;
    if (editing === "new") {
      store.addAnnouncement({ body: text, pinned, cohortId: cohortId || null });
      toast("Announcement posted.", "success");
    } else if (editing) {
      store.updateAnnouncement(editing.id, { body: text, pinned, cohortId: cohortId || null });
      toast("Announcement updated.", "success");
    }
    setEditing(null);
  }

  const sorted = [...db.announcements].sort((a, b) => Number(b.pinned) - Number(a.pinned) || +new Date(b.createdAt) - +new Date(a.createdAt));

  return (
    <div className="px-4 py-6 sm:px-6">
      <PageHeader
        title="Announcements"
        subtitle={`${db.announcements.length} posted`}
        actions={<Button onClick={openNew}><Icon.Plus className="h-4 w-4" /> New announcement</Button>}
      />

      {sorted.length === 0 ? (
        <EmptyState icon={<Icon.Megaphone />} title="No announcements" action={<Button onClick={openNew}>Post one</Button>} />
      ) : (
        <div className="space-y-2.5">
          {sorted.map((a) => {
            const cohort = cohortById(db, a.cohortId);
            return (
              <Card key={a.id} ruled={a.pinned} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      {a.pinned && <Badge tone="info"><Icon.Flag className="h-3 w-3" /> Pinned</Badge>}
                      {cohort ? <CohortTag color={cohort.color} name={cohort.name} className="text-xs" /> : <span className="text-xs text-ink-3">All cohorts</span>}
                      <span className="text-xs text-ink-3">{formatDate(a.createdAt)}</span>
                    </div>
                    <p className="text-sm text-ink">{a.body}</p>
                    {!a.pinned && (
                      <p className="mt-1.5 text-xs text-ink-3">Dismissed by {a.dismissedBy.length} {a.dismissedBy.length === 1 ? "student" : "students"}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button onClick={() => store.updateAnnouncement(a.id, { pinned: !a.pinned })} className="flex h-9 w-9 items-center justify-center rounded text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label={a.pinned ? "Unpin" : "Pin"} title={a.pinned ? "Unpin" : "Pin"}>
                      <Icon.Flag className={a.pinned ? "h-4 w-4 text-info" : "h-4 w-4"} />
                    </button>
                    <button onClick={() => openEdit(a)} className="flex h-9 w-9 items-center justify-center rounded text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label="Edit">
                      <Icon.Edit className="h-4 w-4" />
                    </button>
                    <button onClick={() => setDeleting(a)} className="flex h-9 w-9 items-center justify-center rounded text-ink-3 hover:bg-error-soft hover:text-error" aria-label="Delete">
                      <Icon.Trash className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "New announcement" : "Edit announcement"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} disabled={!body.trim()}>{editing === "new" ? "Post" : "Save"}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <Textarea label="Message" value={body} maxLength={MAX} onChange={(e) => setBody(e.target.value)} placeholder="Keep it short and clear…" />
            <p className="mt-1 text-right text-xs text-ink-3 tabular">{body.length} / {MAX}</p>
          </div>
          <Select label="Audience" value={cohortId} onChange={(e) => setCohortId(e.target.value)}>
            <option value="">All cohorts</option>
            {db.cohorts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Checkbox checked={pinned} onChange={setPinned} label="Pin to the top (always visible, not dismissible)" />
        </div>
      </Modal>

      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete announcement?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => { if (deleting) store.deleteAnnouncement(deleting.id); setDeleting(null); toast("Deleted.", "success"); }}>Delete</Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">Students will no longer see this message.</p>
      </Modal>
    </div>
  );
}
