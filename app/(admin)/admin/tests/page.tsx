"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDatabase, useStore } from "@/lib/data/store";
import { useAdminFilter } from "@/lib/admin-filter";
import { cohortById, testStats } from "@/lib/data/selectors";
import { useToast } from "@/components/toast";
import { useNow } from "@/hooks/useNow";
import { effectiveTestStatus, type EffectiveTestStatus } from "@/lib/time";
import { PageHeader } from "@/components/admin/PageHeader";
import { Button, Card, Badge, Pill, Select, CohortTag, EmptyState, Modal, Icon } from "@/components/ui";
import { buttonClasses } from "@/components/ui/Button";

const STATUS_TONE: Record<EffectiveTestStatus, "neutral" | "success" | "warning" | "info" | "error"> = {
  draft: "neutral",
  scheduled: "info",
  active: "success",
  closed: "warning",
  cancelled: "error",
};

export default function AdminTestsPage() {
  const db = useDatabase();
  const store = useStore();
  const router = useRouter();
  const { toast } = useToast();
  const { cohortId } = useAdminFilter();

  const [subject, setSubject] = useState("all");
  const [status, setStatus] = useState("all");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const nowMs = useNow();

  const subjects = useMemo(() => Array.from(new Set(db.tests.map((t) => t.subject))).sort(), [db.tests]);

  const tests = useMemo(() => {
    return db.tests
      .filter((t) => (cohortId ? t.cohortId === cohortId || t.cohortId === null : true))
      .filter((t) => (subject === "all" ? true : t.subject === subject))
      .filter((t) => (status === "all" ? true : effectiveTestStatus(t, nowMs) === status))
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }, [db.tests, cohortId, subject, status, nowMs]);

  // Open the editor in "new" mode — nothing is inserted until the admin clicks
  // Create there (see app/(admin)/admin/tests/[id]/page.tsx).
  function openNew() {
    router.push("/admin/tests/new");
  }

  const target = deleteId ? db.tests.find((t) => t.id === deleteId) : null;

  return (
    <div className="px-4 py-6 sm:px-6">
      <PageHeader
        title="Tests"
        subtitle={`${tests.length} ${tests.length === 1 ? "test" : "tests"}`}
        actions={<Button onClick={openNew}><Icon.Plus className="h-4 w-4" /> New test</Button>}
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <Select value={subject} onChange={(e) => setSubject(e.target.value)} className="w-auto min-w-40" aria-label="Filter by subject">
          <option value="all">All subjects</option>
          {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto min-w-36" aria-label="Filter by status">
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="scheduled">Scheduled</option>
          <option value="active">Active</option>
          <option value="closed">Closed</option>
          <option value="cancelled">Cancelled</option>
        </Select>
      </div>

      {tests.length === 0 ? (
        <EmptyState
          icon={<Icon.Doc />}
          title="No tests match"
          message="Adjust your filters, or create a new test to get started."
          action={<Button onClick={openNew}><Icon.Plus className="h-4 w-4" /> New test</Button>}
        />
      ) : (
        <div className="space-y-3">
          {tests.map((t) => {
            const stats = testStats(db, t);
            const cohort = cohortById(db, t.cohortId);
            return (
              <Card key={t.id} ruled className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill>{t.testCode}</Pill>
                      {(() => { const eff = effectiveTestStatus(t, nowMs); return <Badge tone={STATUS_TONE[eff]} className="capitalize">{eff}</Badge>; })()}
                    </div>
                    <h3 className="mt-1.5 text-lg font-bold text-ink">{t.title}</h3>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-ink-2">
                      <span>{t.subject}</span>
                      <span>·</span>
                      <span>{t.questions.length} Q</span>
                      <span>·</span>
                      <span>{t.durationMinutes} min</span>
                      {cohort ? <CohortTag color={cohort.color} name={cohort.name} className="text-xs" /> : <span className="text-xs text-ink-3">All cohorts</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link href={`/admin/tests/${t.id}`} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                      <Icon.Edit className="h-4 w-4" /> Edit
                    </Link>
                    <button
                      onClick={() => setDeleteId(t.id)}
                      className="flex h-10 w-10 items-center justify-center rounded-md text-ink-3 hover:bg-error-soft hover:text-error"
                      aria-label={`Delete ${t.title}`}
                    >
                      <Icon.Trash className="h-[18px] w-[18px]" />
                    </button>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
                  <Stat label="Submissions" value={String(stats.submissionCount)} />
                  <Stat label="Average" value={stats.averagePercent != null ? `${stats.averagePercent}%` : "—"} />
                  <Stat label="Completion" value={`${stats.completionPercent}%`} />
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Delete test?"
        description={target ? `"${target.title}" and its submissions will be removed.` : ""}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button
              variant="danger"
              loading={deleting}
              onClick={async () => {
                if (!deleteId) return;
                setDeleting(true);
                const ok = await store.deleteTest(deleteId);
                setDeleting(false);
                if (!ok) return; // the store surfaced the real reason; keep the dialog open
                setDeleteId(null);
                toast("Test deleted.", "success");
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">This action cannot be undone.</p>
      </Modal>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-lg font-bold text-ink">{value}</p>
      <p className="text-xs text-ink-3">{label}</p>
    </div>
  );
}
