"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Answer, ViolationType } from "@/types";
import { useAuth } from "@/lib/auth-context";
import { useDatabase, useStore } from "@/lib/data/store";
import { studentById, testById, submissionFor, examLockFor } from "@/lib/data/selectors";
import { useCountdown } from "@/hooks/useCountdown";
import { useExamSecurity } from "@/hooks/useExamSecurity";
import { ExamLockScreen } from "@/components/student/ExamLockScreen";
import { useDraftAutosave, loadDraft, clearDraft } from "@/hooks/useDraftAutosave";
import { useToast } from "@/components/toast";
import { CountdownTimer } from "@/components/student/CountdownTimer";
import { QuestionView } from "@/components/student/QuestionView";
import { Button, Modal, Pill, Icon } from "@/components/ui";
import { buttonClasses } from "@/components/ui/Button";
import { BrandMark } from "@/components/Brand";
import { testWindow } from "@/lib/time";
import Link from "next/link";

function isAnswered(a: Answer): boolean {
  if (a.type === "mcq") return typeof a.selectedIndex === "number";
  if (a.type === "text") return (a.text ?? "").trim().length > 0;
  return !!a.photoDataUrl;
}

export default function TestRunnerPage() {
  const params = useParams();
  const id = String(params.id);
  const router = useRouter();
  const { session } = useAuth();
  const db = useDatabase();
  const store = useStore();
  const { toast } = useToast();

  const student = session?.studentId ? studentById(db, session.studentId) : null;
  const test = testById(db, id);
  const visible =
    test && test.status !== "draft" && (test.cohortId === null || test.cohortId === student?.cohortId);
  const existing = student && test ? submissionFor(db, student.id, test.id) : null;
  const window = test ? testWindow(test.opensAt, test.closesAt, Date.now()) : "closed";

  // ---- One-time bootstrap from any saved draft -------------------------
  const [boot] = useState(() => {
    const d = student && test ? loadDraft(student.id, test.id) : null;
    return {
      startedAt: d?.startedAt ?? new Date().toISOString(),
      answers: d?.answers ?? null,
      index: d?.currentIndex ?? 0,
    };
  });

  const [answers, setAnswers] = useState<Answer[]>(() => {
    if (!test) return [];
    if (boot.answers && boot.answers.length === test.questions.length) return boot.answers;
    return test.questions.map((q) => ({ questionId: q.id, type: q.type }) as Answer);
  });
  // Clamp the restored index: a stale draft may point past a now-shorter test.
  const [index, setIndex] = useState(() => {
    const max = test ? Math.max(0, test.questions.length - 1) : 0;
    return Math.min(Math.max(0, boot.index), max);
  });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const submittedRef = useRef(false);
  const prevState = useRef<string>("normal");

  const endMs = useMemo(() => {
    if (!test) return null;
    const byDuration = new Date(boot.startedAt).getTime() + test.durationMinutes * 60_000;
    const byClose = new Date(test.closesAt).getTime();
    return Math.min(byDuration, byClose);
  }, [test, boot.startedAt]);

  // Exam lock state. Server-owned: a trigger writes it, only an admin clears it,
  // and the submissions RLS policy refuses a locked student regardless of the UI.
  const lock = student && test ? examLockFor(db, student.id, test.id) : null;
  const locked = lock?.status === "locked";

  const doSubmit = useCallback(
    async (auto: boolean) => {
      if (submittedRef.current || !test || !student || locked) return;
      submittedRef.current = true;
      const duration = Math.min(
        test.durationMinutes * 60,
        Math.round((Date.now() - new Date(boot.startedAt).getTime()) / 1000),
      );
      await store.submitTest({
        testId: test.id,
        studentId: student.id,
        answers,
        startedAt: boot.startedAt,
        autoSubmitted: auto,
        durationSeconds: duration,
      });
      clearDraft(student.id, test.id);
      router.replace(`/test/${test.id}/submitted`);
    },
    [test, student, answers, store, router, boot.startedAt, locked],
  );

  const { remaining, state } = useCountdown(endMs, () => doSubmit(true));

  useDraftAutosave({
    studentId: student?.id ?? "",
    testId: test?.id ?? "",
    answers,
    currentIndex: index,
    startedAt: boot.startedAt,
    enabled: !!test && !!student && !existing && window === "open" && !locked,
  });

  // Report integrity breaches. The server decides whether that locks the exam.
  const onViolation = useCallback(
    (type: ViolationType) => {
      if (!student || !test) return;
      void store.recordViolation({ studentId: student.id, testId: test.id, type });
    },
    [student, test, store],
  );

  useExamSecurity({
    enabled: !!student && !!test && !!visible && !existing && window === "open" && !locked,
    onViolation,
  });

  // Final-five and final-minute warnings (announced once each).
  useEffect(() => {
    if (state !== prevState.current) {
      if (state === "warning") toast("5 minutes left. Wrap it up.", "info");
      if (state === "critical") toast("Last 60 seconds.", "error");
      prevState.current = state;
    }
  }, [state, toast]);

  // Already submitted, or not open → bounce out.
  useEffect(() => {
    if (existing) router.replace(existing.status === "released" ? `/results/${id}` : "/dashboard");
  }, [existing, id, router]);

  if (!student || !test || !visible) {
    return <RunnerNotice title="Test unavailable" message="Something's wrong. Head back and try again." />;
  }
  // Locked takes priority over every other state: no questions, no navigation,
  // no submit. Clears itself when the teacher unlocks (Realtime → re-render).
  if (locked && lock) return <ExamLockScreen lock={lock} testTitle={test.title} />;
  if (existing) return <RunnerNotice title="Already submitted" message="You've already done this one." />;
  if (window === "future") return <RunnerNotice title="Not open yet" message="Not live yet. Check back at the start time." />;
  if (window === "closed") return <RunnerNotice title="Test closed" message="You missed the window." />;
  if (test.questions.length === 0) {
    return <RunnerNotice title="No questions yet" message="This test currently has no questions." />;
  }

  // Defensive: after clamping this is always in-bounds, but never render an
  // undefined question (would throw on q.id).
  const safeIndex = Math.min(Math.max(0, index), test.questions.length - 1);
  const q = test.questions[safeIndex];
  const answer = answers[safeIndex];
  if (!q) {
    return <RunnerNotice title="No questions yet" message="This test currently has no questions." />;
  }
  const answeredCount = answers.filter(isAnswered).length;
  const isLast = index === test.questions.length - 1;

  function update(next: Answer) {
    setAnswers((prev) => prev.map((a, i) => (i === index ? next : a)));
  }

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Focus-mode header with the live countdown */}
      <header className="sticky top-0 z-30 border-b border-border bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-ink">{test.title}</p>
              <Pill>{test.testCode}</Pill>
            </div>
          </div>
          <CountdownTimer remaining={remaining} state={state} />
        </div>
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 pb-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-brand transition-[width] duration-300"
              style={{ width: `${((index + 1) / test.questions.length) * 100}%` }}
            />
          </div>
          <span className="shrink-0 font-mono text-xs text-ink-2">
            {index + 1}/{test.questions.length}
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
        <div key={q.id} className="animate-fade-up">
          <QuestionView
            question={q}
            answer={answer}
            onChange={update}
            flagContext={{ studentId: student.id, testId: test.id }}
          />
        </div>
      </main>

      <footer className="sticky bottom-0 border-t border-border bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <Button
            variant="secondary"
            disabled={index === 0}
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
          >
            <Icon.ChevronLeft className="h-4 w-4" /> Back
          </Button>
          {isLast ? (
            <Button onClick={() => setConfirmOpen(true)}>
              I'm done <Icon.Check className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={() => setIndex((i) => Math.min(test.questions.length - 1, i + 1))}>
              Save &amp; Next <Icon.ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </footer>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Sure you're done?"
        description="You can't come back to this."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>Not yet</Button>
            <Button onClick={() => doSubmit(false)}>Yes, submit</Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">
          <span className="font-semibold text-ink">{answeredCount}/{test.questions.length}</span> answered.
          {answeredCount < test.questions.length && " Blanks stay blank."}
        </p>
      </Modal>
    </div>
  );
}

function RunnerNotice({ title, message }: { title: string; message: string }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <Icon.Lock className="h-8 w-8 text-ink-3" />
      <h1 className="mt-3 text-xl font-bold text-ink">{title}</h1>
      <p className="mt-1 text-sm text-ink-2">{message}</p>
      <Link href="/dashboard" className={buttonClasses({ variant: "secondary", className: "mt-5" })}>
        Back to home
      </Link>
    </div>
  );
}
