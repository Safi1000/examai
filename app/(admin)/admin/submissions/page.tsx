"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useDatabase, useStore } from "@/lib/data/store";
import { useAdminFilter } from "@/lib/admin-filter";
import { cohortById, studentById, submissionsForTest } from "@/lib/data/selectors";
import { useToast } from "@/components/toast";
import { PageHeader } from "@/components/admin/PageHeader";
import { Card, Button, Select, Badge, CohortDot, EmptyState, Icon, TableScroll, Table, Th, Td, Modal } from "@/components/ui";
import { buttonClasses } from "@/components/ui/Button";
import { gradeSubmission, isAllMcq } from "@/lib/grading";
import { formatTimestamp } from "@/lib/time";

export default function SubmissionsPage() {
  const db = useDatabase();
  const store = useStore();
  const { toast } = useToast();
  const { cohortId } = useAdminFilter();

  const testsWithSubs = useMemo(
    () => db.tests.filter((t) => submissionsForTest(db, t.id).length > 0),
    [db],
  );
  const [testId, setTestId] = useState(() => testsWithSubs[0]?.id ?? db.tests[0]?.id ?? "");
  const [statusFilter, setStatusFilter] = useState("all");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const test = db.tests.find((t) => t.id === testId) ?? null;

  const rows = useMemo(() => {
    if (!test) return [];
    return submissionsForTest(db, test.id)
      .filter((s) => {
        const student = studentById(db, s.studentId);
        return cohortId ? student?.cohortId === cohortId : true;
      })
      .filter((s) => (statusFilter === "all" ? true : s.status === statusFilter))
      .map((s) => ({ sub: s, student: studentById(db, s.studentId), grade: gradeSubmission(test, s) }))
      .sort((a, b) => +new Date(b.sub.submittedAt ?? 0) - +new Date(a.sub.submittedAt ?? 0));
  }, [db, test, cohortId, statusFilter]);

  const submittedCount = test ? submissionsForTest(db, test.id).filter((s) => s.status === "submitted").length : 0;
  const canBulk = test && isAllMcq(test) && submittedCount > 0;

  if (db.tests.length === 0) {
    return (
      <div className="px-4 py-6 sm:px-6">
        <PageHeader title="Submissions" />
        <EmptyState icon={<Icon.Inbox />} title="No tests yet" />
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-6">
      <PageHeader
        title="Submissions"
        subtitle={test ? `${rows.length} for "${test.title}"` : undefined}
        actions={canBulk ? <Button onClick={() => setBulkOpen(true)}><Icon.Check className="h-4 w-4" /> Release all (MCQ)</Button> : undefined}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Select value={testId} onChange={(e) => setTestId(e.target.value)} className="w-auto min-w-52" aria-label="Test">
          {db.tests.map((t) => <option key={t.id} value={t.id}>{t.title} ({submissionsForTest(db, t.id).length})</option>)}
        </Select>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-auto min-w-36" aria-label="Status">
          <option value="all">All statuses</option>
          <option value="submitted">Awaiting grading</option>
          <option value="released">Released</option>
        </Select>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={<Icon.Inbox />} title="No submissions" message="Nothing matches the current filters." />
      ) : (
        <Card className="p-0">
          <TableScroll>
            <Table stickyFirst>
              <thead>
                <tr>
                  <Th>Student</Th>
                  <Th>Cohort</Th>
                  <Th>Status</Th>
                  <Th>Score</Th>
                  <Th>Submitted</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ sub, student, grade }) => {
                  const cohort = student ? cohortById(db, student.cohortId) : null;
                  return (
                    <tr key={sub.id}>
                      <Td className="font-semibold capitalize">{student?.username ?? "—"}</Td>
                      <Td>{cohort ? <span className="inline-flex items-center gap-1.5 text-ink-2"><CohortDot color={cohort.color} />{cohort.name}</span> : "—"}</Td>
                      <Td>
                        {sub.status === "released" ? <Badge tone="success">Released</Badge> : <Badge tone="warning">Awaiting</Badge>}
                        {sub.autoSubmitted && <span className="ml-1 text-xs text-ink-3">auto</span>}
                      </Td>
                      <Td className="font-mono">{sub.status === "released" ? `${grade.percent}% · ${grade.letter}` : <span className="text-ink-3">—</span>}</Td>
                      <Td className="whitespace-nowrap text-ink-2">{sub.submittedAt ? formatTimestamp(sub.submittedAt) : "—"}</Td>
                      <Td>
                        <div className="flex items-center gap-1.5">
                          <Link href={`/admin/grading/${sub.id}`} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                            {sub.status === "released" ? "Review" : "Grade"}
                          </Link>
                          <button onClick={() => setDeleteId(sub.id)} className="flex h-9 w-9 items-center justify-center rounded text-ink-3 hover:bg-error-soft hover:text-error" aria-label="Delete submission">
                            <Icon.Trash className="h-4 w-4" />
                          </button>
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </TableScroll>
        </Card>
      )}

      <Modal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        title="Release all MCQ results?"
        description={test ? `${submittedCount} ungraded submission${submittedCount === 1 ? "" : "s"} for "${test.title}".` : ""}
        footer={
          <>
            <Button variant="secondary" onClick={() => setBulkOpen(false)}>Cancel</Button>
            <Button onClick={() => { if (test) store.bulkReleaseForTest(test.id); setBulkOpen(false); toast("Results released.", "success"); }}>Release all</Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">All questions are auto-graded multiple choice, so results can be released in one click.</p>
      </Modal>

      <Modal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Delete submission?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => { if (deleteId) store.deleteSubmission(deleteId); setDeleteId(null); toast("Submission deleted.", "success"); }}>Delete</Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">This permanently removes the student&apos;s submission.</p>
      </Modal>
    </div>
  );
}
