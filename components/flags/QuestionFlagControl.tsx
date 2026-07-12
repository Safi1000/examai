"use client";

/**
 * "Flag question" affordance + the student's own thread for that question.
 * Shared by the test runner and the result breakdown so both entry points behave
 * identically. The thread is read-only by design: once filed, a flag belongs to
 * the admin to answer and resolve (RLS gives students no UPDATE path).
 */
import { useState } from "react";
import type { Question, QuestionFlag } from "@/types";
import { useDatabase } from "@/lib/data/store";
import { flagsForQuestion } from "@/lib/data/selectors";
import { Badge, Button, Icon } from "@/components/ui";
import { QuestionFlagModal } from "@/components/flags/QuestionFlagModal";
import { reasonLabel } from "@/components/flags/meta";
import { formatDate } from "@/lib/time";

export function QuestionFlagControl({
  question,
  studentId,
  testId,
  submissionId = null,
  showThread = true,
}: {
  question: Question;
  studentId: string;
  testId: string;
  submissionId?: string | null;
  /** The runner keeps it compact; the breakdown shows the replies. */
  showThread?: boolean;
}) {
  const db = useDatabase();
  const [open, setOpen] = useState(false);
  const flags = flagsForQuestion(db, studentId, question.id);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
          <Icon.Flag className="h-4 w-4" />
          {flags.length > 0 ? "Flag again" : "Flag question"}
        </Button>
        {!showThread && flags.length > 0 && (
          <span className="text-xs text-ink-3">
            {flags.length === 1 ? "1 flag sent" : `${flags.length} flags sent`}
          </span>
        )}
      </div>

      {showThread && flags.length > 0 && (
        <div className="mt-3 space-y-2">
          {flags.map((f) => <FlagThreadItem key={f.id} flag={f} />)}
        </div>
      )}

      {/* Mounted only while open — that's what gives each flag a fresh form. */}
      {open && (
        <QuestionFlagModal
          open
          onClose={() => setOpen(false)}
          question={question}
          studentId={studentId}
          testId={testId}
          submissionId={submissionId}
        />
      )}
    </>
  );
}

/** One filed flag: what the student said, and the admin's answer if there is one. */
function FlagThreadItem({ flag }: { flag: QuestionFlag }) {
  return (
    <div className="rounded-md border border-border bg-surface-2/40 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="neutral">{reasonLabel(flag.reason)}</Badge>
        {flag.status === "resolved" ? (
          <Badge tone="success"><Icon.Check className="h-3 w-3" /> Resolved</Badge>
        ) : (
          <Badge tone="warning">Open</Badge>
        )}
        <span className="text-xs text-ink-3">{formatDate(flag.createdAt)}</span>
      </div>
      <p className="mt-1.5 text-sm text-ink">{flag.message}</p>

      {flag.adminReply ? (
        <div className="mt-2.5 rounded-md border border-info/30 bg-info-soft/60 px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-info">Admin reply</p>
          <p className="mt-0.5 text-sm text-ink">{flag.adminReply}</p>
        </div>
      ) : (
        <p className="mt-2 text-xs italic text-ink-3">Waiting for a reply from your teacher.</p>
      )}
    </div>
  );
}
