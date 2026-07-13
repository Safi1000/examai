"use client";

import { useMemo, useState } from "react";
import type { ExamViolation, ViolationType } from "@/types";
import { useDatabase, useStore } from "@/lib/data/store";
import { useAdminFilter } from "@/lib/admin-filter";
import {
  cohortById,
  securityReports,
  studentById,
  testById,
  violationSummary,
} from "@/lib/data/selectors";
import { useToast } from "@/components/toast";
import { PageHeader } from "@/components/admin/PageHeader";
import { Button, Card, Badge, Pill, Select, CohortDot, EmptyState, Icon, Modal } from "@/components/ui";
import { formatDateTime, formatTimestamp } from "@/lib/time";
import { VIOLATION_LABEL } from "@/components/security/meta";
import { cn } from "@/lib/cn";

/**
 * Counters shown as summary badges. Fullscreen is deliberately absent — the
 * requirement was dropped, so no new fullscreen violations can be recorded.
 * (VIOLATION_LABEL still knows the type so any historical row from before the
 * change still renders correctly in the timeline.)
 */
const ORDER: ViolationType[] = [
  "tab_switch", "window_blur", "copy",
  "paste", "cut", "right_click", "blocked_shortcut",
];

/** A pending clear, described so the confirmation dialog can spell it out. */
interface ClearRequest {
  label: string;
  where: { id?: string; studentId?: string; testId?: string };
}

/**
 * Exam Security — the complete integrity history, grouped per student+exam.
 * Driven entirely by the store cache, which useRealtimeSync keeps in step with
 * exam_violations and exam_locks: new breaches, locks and unlocks all land here
 * without a refresh.
 */
export default function ExamSecurityPage() {
  const db = useDatabase();
  const store = useStore();
  const { toast } = useToast();
  const { cohortId } = useAdminFilter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "locked">("all");
  /** Pending "clear violations" request, held until the teacher confirms. */
  const [pendingClear, setPendingClear] = useState<ClearRequest | null>(null);
  const [clearing, setClearing] = useState(false);

  const reports = useMemo(() => {
    return securityReports(db)
      .map((r) => ({
        ...r,
        student: studentById(db, r.studentId),
        test: testById(db, r.testId),
      }))
      .filter((r) => (cohortId ? r.student?.cohortId === cohortId : true))
      .filter((r) => (filter === "locked" ? r.lock?.status === "locked" : true));
  }, [db, cohortId, filter]);

  const lockedCount = reports.filter((r) => r.lock?.status === "locked").length;

  async function unlock(lockId: string, name: string) {
    setBusyId(lockId);
    const ok = await store.unlockExam(lockId);
    setBusyId(null);
    if (ok) toast(`${name} unlocked.`, "success");
  }

  /** Permanent — runs only after the confirmation dialog. */
  async function confirmClear() {
    if (!pendingClear) return;
    setClearing(true);
    const removed = await store.clearViolations(pendingClear.where);
    setClearing(false);
    setPendingClear(null);
    if (removed > 0) {
      toast(`Cleared ${removed} violation${removed === 1 ? "" : "s"}.`, "success");
    }
  }

  return (
    <div className="px-4 py-6 sm:px-6">
      <PageHeader
        title="Exam security"
        subtitle={`${reports.length} report${reports.length === 1 ? "" : "s"} · ${lockedCount} locked`}
        actions={
          db.examViolations.length > 0 ? (
            <Button
              variant="secondary"
              onClick={() =>
                setPendingClear({
                  label: "every recorded security violation, for every student and every exam",
                  where: {},
                })
              }
            >
              <Icon.Trash className="h-4 w-4" /> Clear all
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4">
        <Select
          value={filter}
          onChange={(e) => setFilter(e.target.value as "all" | "locked")}
          className="w-auto min-w-44"
          aria-label="Filter reports"
        >
          <option value="all">All reports</option>
          <option value="locked">Locked only</option>
        </Select>
      </div>

      {reports.length === 0 ? (
        <EmptyState
          icon={<Icon.Lock />}
          title="No security activity"
          message="Integrity violations and exam locks will appear here as they happen."
        />
      ) : (
        <div className="space-y-4">
          {reports.map(({ lock, violations, student, test, studentId, testId }) => {
            const cohort = student ? cohortById(db, student.cohortId) : null;
            const name = student?.username ?? "Unknown student";
            const locked = lock?.status === "locked";
            const summary = violationSummary(violations);

            return (
              <Card key={`${studentId}:${testId}`} ruled={locked} className="p-4">
                {/* Header: who / which exam / status */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-bold capitalize text-ink">{name}</h3>
                      {cohort && (
                        <span className="inline-flex items-center gap-1.5 text-xs text-ink-2">
                          <CohortDot color={cohort.color} />
                          {cohort.name}
                        </span>
                      )}
                      {locked ? (
                        <Badge tone="error"><Icon.Lock className="h-3 w-3" /> LOCKED</Badge>
                      ) : lock ? (
                        <Badge tone="success"><Icon.Check className="h-3 w-3" /> Unlocked</Badge>
                      ) : (
                        <Badge tone="warning">Flagged</Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-ink-2">{test?.title ?? "Deleted test"}</p>
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    <div className="text-right">
                      <p className="font-mono text-2xl font-bold text-ink">{violations.length}</p>
                      <p className="text-xs text-ink-3">violations</p>
                    </div>
                    {locked && lock && (
                      <Button
                        onClick={() => unlock(lock.id, name)}
                        loading={busyId === lock.id}
                        disabled={busyId === lock.id}
                      >
                        <Icon.Check className="h-4 w-4" /> Unlock
                      </Button>
                    )}
                  </div>
                </div>

                {/* Lock state detail */}
                {lock && (
                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 rounded-md border border-border bg-surface-2/50 px-3 py-2 text-xs">
                    {lock.lockedAt && (
                      <span className="text-ink-2">
                        <span className="font-semibold">Locked at</span>{" "}
                        <span className="tabular">{formatDateTime(lock.lockedAt)}</span>
                      </span>
                    )}
                    {lock.reason && (
                      <span className="text-ink-2">
                        <span className="font-semibold">Reason</span> {VIOLATION_LABEL[lock.reason]}
                      </span>
                    )}
                    {lock.unlockedAt && (
                      <span className="text-success">
                        <span className="font-semibold">Unlocked at</span>{" "}
                        <span className="tabular">{formatDateTime(lock.unlockedAt)}</span>
                      </span>
                    )}
                  </div>
                )}

                {/* Summary badges — every type, including the zeroes */}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {ORDER.map((t) => (
                    <span
                      key={t}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                        summary[t] > 0
                          ? "border-error/30 bg-error-soft text-error"
                          : "border-border bg-surface-2 text-ink-3",
                      )}
                    >
                      {VIOLATION_LABEL[t]}
                      <span className="font-mono tabular">{summary[t]}</span>
                    </span>
                  ))}
                </div>

                {/* Chronological timeline, oldest → newest */}
                {violations.length > 0 && (
                  <>
                    <Timeline
                      violations={violations}
                      onClearOne={(v) =>
                        setPendingClear({
                          label: `this single violation (${VIOLATION_LABEL[v.violationType]}) for ${name}`,
                          where: { id: v.id },
                        })
                      }
                    />
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          setPendingClear({
                            label: `all ${violations.length} violation${violations.length === 1 ? "" : "s"} for ${name} on "${test?.title ?? "this exam"}"`,
                            where: { studentId, testId },
                          })
                        }
                      >
                        <Icon.Trash className="h-4 w-4" /> Clear this exam
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          setPendingClear({
                            label: `every violation for ${name}, across all exams`,
                            where: { studentId },
                          })
                        }
                      >
                        <Icon.Trash className="h-4 w-4" /> Clear all for {name}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          setPendingClear({
                            label: `every violation on "${test?.title ?? "this exam"}", for all students`,
                            where: { testId },
                          })
                        }
                      >
                        <Icon.Trash className="h-4 w-4" /> Clear exam (all students)
                      </Button>
                    </div>
                  </>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={!!pendingClear}
        onClose={() => setPendingClear(null)}
        title="Clear security violations?"
        description={
          pendingClear
            ? `Are you sure you want to clear ${pendingClear.label}?`
            : undefined
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setPendingClear(null)} disabled={clearing}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmClear} loading={clearing}>
              Clear permanently
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">
          This permanently deletes the violation history and cannot be undone. It does{" "}
          <span className="font-semibold text-ink">not</span> unlock anyone — a locked student stays
          locked until you unlock them.
        </p>
      </Modal>
    </div>
  );
}

/** Oldest → newest, with the exact timestamp of every breach. */
function Timeline({
  violations,
  onClearOne,
}: {
  violations: ExamViolation[];
  onClearOne: (v: ExamViolation) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? violations : violations.slice(0, 5);

  return (
    <div className="mt-4">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-2">Timeline</p>
      <ol className="space-y-0 border-l-2 border-border pl-4">
        {shown.map((v) => (
          <li key={v.id} className="group relative py-1.5">
            <span className="absolute -left-[21px] top-3 h-2 w-2 rounded-full bg-error" aria-hidden />
            <div className="flex flex-wrap items-center gap-2">
              <Pill className="text-[11px]">{formatTimestamp(v.createdAt)}</Pill>
              <span className="text-sm text-ink">{VIOLATION_LABEL[v.violationType]}</span>
              <button
                onClick={() => onClearOne(v)}
                className="ml-auto flex h-7 w-7 items-center justify-center rounded-md text-ink-3 opacity-0 transition-opacity hover:bg-error-soft hover:text-error group-hover:opacity-100 focus-visible:opacity-100"
                aria-label="Clear this violation"
                title="Clear this violation"
              >
                <Icon.Trash className="h-4 w-4" />
              </button>
            </div>
          </li>
        ))}
      </ol>
      {violations.length > 5 && (
        <button
          onClick={() => setExpanded((e) => !e)}
          className="mt-2 rounded-md px-2 py-1 text-xs font-semibold text-brand hover:bg-brand-soft"
        >
          {expanded ? "Show less" : `Show all ${violations.length}`}
        </button>
      )}
    </div>
  );
}
