"use client";

/**
 * Admin queue for student question flags. Reads come straight from the store
 * cache, which for an admin session holds every flag (RLS decides that, not this
 * page). Open flags first — this is a to-do list, not an archive.
 */
import { useMemo, useState } from "react";
import { useDatabase } from "@/lib/data/store";
import { useAdminFilter } from "@/lib/admin-filter";
import { studentById, testById } from "@/lib/data/selectors";
import { PageHeader } from "@/components/admin/PageHeader";
import { FlagCard } from "@/components/admin/FlagCard";
import { FLAG_REASONS } from "@/components/flags/meta";
import { EmptyState, Icon, Select } from "@/components/ui";

export default function FlagsPage() {
  const db = useDatabase();
  const { cohortId } = useAdminFilter();

  const [status, setStatus] = useState("open");
  const [reason, setReason] = useState("all");

  const rows = useMemo(() => {
    return db.questionFlags
      .map((flag) => {
        const student = studentById(db, flag.studentId);
        const test = flag.testId ? testById(db, flag.testId) : null;
        const index = test && flag.questionId
          ? test.questions.findIndex((q) => q.id === flag.questionId)
          : -1;
        const question = index >= 0 && test ? test.questions[index] : null;
        return {
          flag,
          student,
          studentName: student?.username ?? "Unknown student",
          testTitle: test?.title ?? "Deleted test",
          questionLabel: index >= 0 ? `Q${index + 1}` : "Question",
          // The snapshot is what keeps a flag readable after its question is gone.
          prompt: question?.prompt ?? flag.questionPrompt ?? "(question no longer exists)",
          questionDeleted: !question,
        };
      })
      .filter((r) => (cohortId ? r.student?.cohortId === cohortId : true))
      .filter((r) => (status === "all" ? true : r.flag.status === status))
      .filter((r) => (reason === "all" ? true : r.flag.reason === reason))
      .sort(
        (a, b) =>
          Number(a.flag.status === "resolved") - Number(b.flag.status === "resolved") ||
          +new Date(b.flag.createdAt) - +new Date(a.flag.createdAt),
      );
  }, [db, cohortId, status, reason]);

  const openCount = db.questionFlags.filter((f) => f.status === "open").length;

  return (
    <div className="px-4 py-6 sm:px-6">
      <PageHeader
        title="Question flags"
        subtitle={`${openCount} open · ${db.questionFlags.length} total`}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="w-auto min-w-40"
          aria-label="Status"
        >
          <option value="open">Open</option>
          <option value="resolved">Resolved</option>
          <option value="all">All statuses</option>
        </Select>
        <Select
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-auto min-w-40"
          aria-label="Reason"
        >
          <option value="all">All reasons</option>
          {FLAG_REASONS.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </Select>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Icon.Flag />}
          title="No flags"
          message="Nothing matches the current filters. Students raise flags from a question during a test or from their result breakdown."
        />
      ) : (
        <div className="space-y-2.5">
          {rows.map((r) => (
            <FlagCard
              key={r.flag.id}
              flag={r.flag}
              studentName={r.studentName}
              testTitle={r.testTitle}
              questionLabel={r.questionLabel}
              prompt={r.prompt}
              questionDeleted={r.questionDeleted}
            />
          ))}
        </div>
      )}
    </div>
  );
}
