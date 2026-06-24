"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import type { Answer, Question } from "@/types";
import { useAuth } from "@/lib/auth-context";
import { useDatabase } from "@/lib/data/store";
import { studentById, testById, submissionFor } from "@/lib/data/selectors";
import { Card, Badge, Pill, Icon, EmptyState } from "@/components/ui";
import { buttonClasses } from "@/components/ui/Button";
import { gradeSubmission, gradeLetter, gradeRole } from "@/lib/grading";
import { formatDuration, formatTimestamp } from "@/lib/time";
import { cn } from "@/lib/cn";

export default function ResultsPage() {
  const params = useParams();
  const id = String(params.id);
  const { session } = useAuth();
  const db = useDatabase();

  const student = session?.studentId ? studentById(db, session.studentId) : null;
  const test = testById(db, id);
  const submission = student && test ? submissionFor(db, student.id, test.id) : null;

  if (!student || !test) {
    return <PendingShell title="Result unavailable" message="We couldn't find this test for your account." />;
  }
  if (!submission || submission.status !== "released") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <BackLink />
        <EmptyState
          className="mt-4"
          icon={<Icon.Clock />}
          title="Results pending"
          message="Your teacher hasn't released results for this test yet. They'll appear here as soon as they do."
        />
      </div>
    );
  }

  const grade = gradeSubmission(test, submission);
  const role = gradeRole(gradeLetter(grade.percent));

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <BackLink />

      <Card ruled className="mt-4 animate-fade-up p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Pill>{test.testCode}</Pill>
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-3">{test.subject}</span>
        </div>
        <h1 className="mt-1.5 text-2xl font-extrabold tracking-tight text-ink">{test.title}</h1>

        <div className="mt-5 flex items-end justify-between gap-4">
          <div>
            <p className="font-mono text-4xl font-bold tabular-nums text-ink">
              {grade.awarded}
              <span className="text-xl text-ink-3">/{grade.total}</span>
            </p>
            <p className="mt-1 text-sm text-ink-2">{grade.percent}% overall</p>
          </div>
          <div
            className={cn(
              "flex h-20 w-20 flex-col items-center justify-center rounded-xl border-2",
              role === "success" && "border-success/40 bg-success-soft text-success",
              role === "warning" && "border-warning/40 bg-warning-soft text-warning",
              role === "error" && "border-error/40 bg-error-soft text-error",
            )}
          >
            <span className="font-display text-4xl font-extrabold leading-none">{grade.letter}</span>
            <span className="mt-1 text-[11px] font-semibold uppercase tracking-wide">Grade</span>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-1 border-t border-border pt-4 text-sm text-ink-2">
          <span className="inline-flex items-center gap-1.5">
            <Icon.Check className="h-4 w-4 text-ink-3" />
            Submitted {submission.submittedAt ? formatTimestamp(submission.submittedAt) : "—"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Icon.Clock className="h-4 w-4 text-ink-3" />
            {formatDuration(submission.durationSeconds ?? 0)}
          </span>
        </div>
      </Card>

      <h2 className="mb-2.5 mt-7 text-sm font-bold uppercase tracking-wide text-ink-2">
        Question breakdown
      </h2>
      <div className="space-y-3">
        {test.questions.map((q, i) => {
          const a = submission.answers.find((x) => x.questionId === q.id);
          return <BreakdownCard key={q.id} index={i} question={q} answer={a} />;
        })}
      </div>
    </div>
  );
}

function BreakdownCard({ index, question, answer }: { index: number; question: Question; answer?: Answer }) {
  const awarded = answer?.marksAwarded ?? 0;
  const full = awarded >= question.marks;
  const zero = awarded === 0;

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-ink-3">Q{index + 1}</span>
          <Badge tone="neutral">{question.topic}</Badge>
        </div>
        <Badge tone={full ? "success" : zero ? "error" : "warning"}>
          {awarded}/{question.marks} marks
        </Badge>
      </div>
      <p className="mt-2 font-semibold text-ink">{question.prompt}</p>

      <div className="mt-3">
        {question.type === "mcq" && (
          <ul className="space-y-1.5">
            {question.options.map((opt, oi) => {
              const chosen = answer?.selectedIndex === oi;
              const correct = question.correctIndex === oi;
              return (
                <li
                  key={oi}
                  className={cn(
                    "flex items-center gap-2 rounded-md border px-3 py-2 text-sm",
                    correct
                      ? "border-success/40 bg-success-soft text-success"
                      : chosen
                        ? "border-error/40 bg-error-soft text-error"
                        : "border-border bg-surface text-ink-2",
                  )}
                >
                  {correct ? (
                    <Icon.Check className="h-4 w-4 shrink-0" />
                  ) : chosen ? (
                    <Icon.Close className="h-4 w-4 shrink-0" />
                  ) : (
                    <span className="h-4 w-4 shrink-0" />
                  )}
                  <span>{opt}</span>
                  {chosen && <span className="ml-auto text-xs font-semibold">Your pick</span>}
                </li>
              );
            })}
          </ul>
        )}

        {question.type === "text" && (
          <div className="rounded-md border border-border bg-surface-2/60 p-3 text-sm text-ink">
            {answer?.text ? answer.text : <span className="italic text-ink-3">(blank)</span>}
          </div>
        )}

        {question.type === "photo" &&
          (answer?.photoDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={answer.photoDataUrl}
              alt={`Your answer to question ${index + 1}`}
              className="max-h-64 w-full rounded-md border border-border object-contain bg-surface-2"
            />
          ) : (
            <p className="text-sm italic text-ink-3">(no photo)</p>
          ))}
      </div>

      {answer?.feedback && (
        <div className="mt-3 rounded-md border border-info/30 bg-info-soft/60 px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-info">Teacher feedback</p>
          <p className="mt-0.5 text-sm text-ink">{answer.feedback}</p>
        </div>
      )}
    </Card>
  );
}

function BackLink() {
  return (
    <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-2 hover:text-ink">
      <Icon.ArrowLeft className="h-4 w-4" /> Home
    </Link>
  );
}

function PendingShell({ title, message }: { title: string; message: string }) {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-xl font-bold text-ink">{title}</h1>
      <p className="mt-1 text-sm text-ink-2">{message}</p>
      <Link href="/dashboard" className={buttonClasses({ variant: "secondary", className: "mt-5" })}>
        Back to home
      </Link>
    </div>
  );
}
