"use client";

/**
 * "Flag question" affordance + the student's conversation for that question.
 * Shared by the test runner and the result breakdown so both entry points behave
 * identically.
 *
 * If a thread already exists we reopen THAT conversation rather than starting a
 * new flag, so the student can keep asking follow-ups without losing the history.
 */
import { useState } from "react";
import type { Question, QuestionFlag } from "@/types";
import { useDatabase } from "@/lib/data/store";
import { flagsForQuestion, messagesForFlag } from "@/lib/data/selectors";
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
  const [newFlag, setNewFlag] = useState(false);

  const flags = flagsForQuestion(db, studentId, question.id);
  // Newest thread wins as the "current" conversation.
  const latest = flags.length
    ? [...flags].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0]
    : null;
  const active = newFlag ? null : latest;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => { setNewFlag(false); setOpen(true); }}>
          <Icon.Flag className="h-4 w-4" />
          {latest ? "Open conversation" : "Flag question"}
        </Button>
        {latest && (
          <Button variant="ghost" size="sm" onClick={() => { setNewFlag(true); setOpen(true); }}>
            <Icon.Plus className="h-4 w-4" /> New flag
          </Button>
        )}
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

      {/* Keyed so switching between "open conversation" and "new flag" gives a
          fresh dialog state rather than a stale form. */}
      {open && (
        <QuestionFlagModal
          key={active?.id ?? "new"}
          open
          onClose={() => setOpen(false)}
          question={question}
          studentId={studentId}
          testId={testId}
          submissionId={submissionId}
          existingFlag={active}
        />
      )}
    </>
  );
}

/** A filed flag summarised in-page: reason, status, and the latest turn. */
function FlagThreadItem({ flag }: { flag: QuestionFlag }) {
  const db = useDatabase();
  const messages = messagesForFlag(db, flag.id);
  const lastAdmin = [...messages].reverse().find((m) => m.sender === "admin");
  const replies = messages.filter((m) => m.sender === "admin").length;

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

      {lastAdmin ? (
        <div className="mt-2.5 rounded-md border border-info/30 bg-info-soft/60 px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-info">
            Teacher reply{replies > 1 ? ` (${replies})` : ""}
          </p>
          <p className="mt-0.5 text-sm text-ink">{lastAdmin.body}</p>
        </div>
      ) : (
        <p className="mt-2 text-xs italic text-ink-3">Waiting for a reply from your teacher.</p>
      )}
    </div>
  );
}
