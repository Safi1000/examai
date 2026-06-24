"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useDatabase } from "@/lib/data/store";
import { studentById, testById, submissionFor } from "@/lib/data/selectors";
import { Card, Badge, Icon } from "@/components/ui";
import { buttonClasses } from "@/components/ui/Button";
import { formatDuration, formatTimestamp } from "@/lib/time";

export default function SubmittedPage() {
  const params = useParams();
  const id = String(params.id);
  const { session } = useAuth();
  const db = useDatabase();

  const student = session?.studentId ? studentById(db, session.studentId) : null;
  const test = testById(db, id);
  const submission = student && test ? submissionFor(db, student.id, test.id) : null;

  if (!student || !test || !submission) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center text-ink-2">
        Nothing to show here.{" "}
        <Link href="/dashboard" className="font-semibold text-brand underline">Back to dashboard</Link>
      </div>
    );
  }

  const answered = submission.answers.filter((a) =>
    a.type === "mcq" ? typeof a.selectedIndex === "number" : a.type === "text" ? !!a.text?.trim() : !!a.photoDataUrl,
  ).length;

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <div className="animate-fade-up text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success-soft text-success">
          <Icon.Check className="h-8 w-8" />
        </div>
        <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-ink">Done.</h1>
        <p className="mt-1 text-sm text-ink-2">Your answers are saved. Sit tight.</p>
      </div>

      <Card ruled className="mt-6 animate-fade-up divide-y divide-border">
        <Row label="Questions answered">
          <span className="font-mono font-semibold text-ink">{answered} / {test.questions.length}</span>
        </Row>
        <Row label="Submitted at">
          <span className="text-ink">{submission.submittedAt ? formatTimestamp(submission.submittedAt) : "—"}</span>
        </Row>
        <Row label="Time taken">
          <span className="font-mono text-ink">{formatDuration(submission.durationSeconds ?? 0)}</span>
        </Row>
        <Row label="Submission">
          {submission.autoSubmitted ? (
            <Badge tone="warning">Time's up. Auto-submitted.</Badge>
          ) : (
            <Badge tone="success">Submitted</Badge>
          )}
        </Row>
      </Card>

      <p className="mt-5 animate-fade-up text-center text-sm text-ink-2">
        Your teacher will mark this and release results soon.
      </p>

      <Link href="/dashboard" className={buttonClasses({ fullWidth: true, className: "mt-4" })}>
        Back to home
      </Link>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5 text-sm">
      <span className="text-ink-2">{label}</span>
      {children}
    </div>
  );
}
