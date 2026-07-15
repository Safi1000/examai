"use client";

/**
 * Practice mode (Feature 2) — ungraded self-assessment.
 *
 * Pick a subject, get a short randomised MCQ quiz built from the student-facing
 * `practice_questions` pool, and answer with instant right/wrong feedback. This
 * is entirely client-side: no Submission row is ever created, no countdown, no
 * grading pipeline. It only reads the practice pool, whose answer keys are
 * intentionally student-readable (see the practice_questions migration) — the
 * graded question_keys are never touched, so no graded answer key is exposed.
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import type { PracticeItem } from "@/types";
import { useAuth } from "@/lib/auth-context";
import { useDatabase, useStore } from "@/lib/data/store";
import {
  studentById,
  practiceSubjectsForStudent,
  practiceCountFor,
  practiceQuizFor,
} from "@/lib/data/selectors";
import { Card, Badge, Pill, Button, RadioCard, Icon, EmptyState } from "@/components/ui";
import { cn } from "@/lib/cn";

type Length = 5 | 10 | 0; // 0 = all available

export default function PracticePage() {
  const { session } = useAuth();
  const db = useDatabase();
  const store = useStore();

  const student = session?.studentId ? studentById(db, session.studentId) : null;
  const subjects = useMemo(
    () => (student ? practiceSubjectsForStudent(db, student) : []),
    [db, student],
  );

  const [quiz, setQuiz] = useState<PracticeItem[] | null>(null);
  const [subject, setSubject] = useState<string | null>(null);

  if (!student) return null;

  function start(subj: string, length: Length) {
    const count = length === 0 ? practiceCountFor(db, subj) : length;
    const items = practiceQuizFor(db, subj, count);
    if (!items.length) return;
    setSubject(subj);
    setQuiz(items);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-2 hover:text-ink">
        <Icon.ArrowLeft className="h-4 w-4" /> Home
      </Link>

      {quiz && subject ? (
        <PracticeRunner
          key={subject + quiz.length + quiz[0]?.id}
          subject={subject}
          quiz={quiz}
          onRestart={() => start(subject, quiz.length as Length)}
          onExit={() => {
            setQuiz(null);
            setSubject(null);
          }}
        />
      ) : subjects.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={<Icon.Layers />}
          title="No practice sets yet"
          message="There aren't any practice questions for your subjects right now. Check back soon — your teacher can add them."
        />
      ) : (
        <SubjectPicker subjects={subjects} countFor={(s) => practiceCountFor(db, s)} onStart={start} />
      )}

      {/* Refresh keeps the pool current if a teacher adds practice questions mid-session. */}
      {!quiz && (
        <button
          onClick={() => store.load()}
          className="mt-8 inline-flex items-center gap-1.5 text-xs font-semibold text-ink-3 hover:text-ink-2"
        >
          <Icon.Refresh className="h-3.5 w-3.5" /> Refresh practice sets
        </button>
      )}
    </div>
  );
}

function SubjectPicker({
  subjects,
  countFor,
  onStart,
}: {
  subjects: string[];
  countFor: (subject: string) => number;
  onStart: (subject: string, length: Length) => void;
}) {
  const [selected, setSelected] = useState<string | null>(subjects[0] ?? null);
  const [length, setLength] = useState<Length>(5);

  const available = selected ? countFor(selected) : 0;
  const lengths: { value: Length; label: string }[] = [
    { value: 5, label: "5" },
    { value: 10, label: "10" },
    { value: 0, label: "All" },
  ];

  return (
    <div className="mt-4">
      <header className="animate-fade-up">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">Practice</h1>
        <p className="mt-1 text-sm text-ink-2">
          Instant-feedback self-test. Nothing here is graded or recorded — just pick a subject and go.
        </p>
      </header>

      <h2 className="mb-2.5 mt-6 text-sm font-bold uppercase tracking-wide text-ink-2">Choose a subject</h2>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {subjects.map((s) => {
          const active = s === selected;
          return (
            <button
              key={s}
              onClick={() => setSelected(s)}
              className={cn(
                "flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left transition-colors",
                active
                  ? "border-brand bg-brand-soft"
                  : "border-border-strong bg-surface hover:border-brand/50 hover:bg-surface-2",
              )}
              aria-pressed={active}
            >
              <span className="font-semibold text-ink">{s}</span>
              <Badge tone="neutral">{countFor(s)} Qs</Badge>
            </button>
          );
        })}
      </div>

      <h2 className="mb-2.5 mt-6 text-sm font-bold uppercase tracking-wide text-ink-2">How many questions</h2>
      <div className="inline-flex rounded-md border border-border-strong bg-surface p-1">
        {lengths.map((l) => {
          const active = l.value === length;
          const n = l.value === 0 ? available : Math.min(l.value, available);
          return (
            <button
              key={l.label}
              onClick={() => setLength(l.value)}
              className={cn(
                "min-w-[64px] rounded px-3 py-2 text-sm font-semibold transition-colors",
                active ? "bg-brand text-on-brand" : "text-ink-2 hover:bg-surface-2",
              )}
              aria-pressed={active}
            >
              {l.label}
              {l.value !== 0 && n < l.value && available > 0 ? ` (${n})` : ""}
            </button>
          );
        })}
      </div>

      <Button
        className="mt-6 w-full"
        disabled={!selected || available === 0}
        onClick={() => selected && onStart(selected, length)}
      >
        Start practice
        <Icon.ChevronRight className="h-[18px] w-[18px]" />
      </Button>
    </div>
  );
}

function PracticeRunner({
  subject,
  quiz,
  onRestart,
  onExit,
}: {
  subject: string;
  quiz: PracticeItem[];
  onRestart: () => void;
  onExit: () => void;
}) {
  const [index, setIndex] = useState(0);
  // picks[i] = chosen option index (locked once set); undefined = unanswered.
  const [picks, setPicks] = useState<(number | undefined)[]>(() => quiz.map(() => undefined));

  const q = quiz[index];
  const picked = picks[index];
  const answered = picked !== undefined;
  const isLast = index === quiz.length - 1;
  const correctCount = quiz.reduce((n, item, i) => n + (picks[i] === item.correctIndex ? 1 : 0), 0);

  function choose(optionIndex: number) {
    if (answered) return; // locked after first pick — this is the instant-feedback moment
    setPicks((prev) => {
      const next = [...prev];
      next[index] = optionIndex;
      return next;
    });
  }

  const [done, setDone] = useState(false);
  if (done) {
    const pct = Math.round((correctCount / quiz.length) * 100);
    const tone = pct >= 60 ? "success" : pct >= 50 ? "warning" : "error";
    return (
      <div className="mt-4">
        <Card ruled className="animate-fade-up p-6 text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-ink-3">{subject} · Practice</p>
          <p className="mt-3 font-mono text-4xl font-bold tabular-nums text-ink">
            {correctCount}
            <span className="text-xl text-ink-3">/{quiz.length}</span>
          </p>
          <p className="mt-1 text-sm text-ink-2">{pct}% correct</p>
          <div className="mt-4 flex justify-center">
            <Badge tone={tone}>
              {pct >= 60 ? "Strong — keep it up" : pct >= 50 ? "Getting there" : "Worth another round"}
            </Badge>
          </div>
          <p className="mt-4 text-xs text-ink-3">Practice isn&apos;t graded or recorded — nothing was submitted.</p>
        </Card>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={onRestart}>
            <Icon.Refresh className="h-[18px] w-[18px]" /> New set
          </Button>
          <Button variant="secondary" onClick={onExit}>
            Change subject
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-ink-2">
          {subject} · Question {index + 1} of {quiz.length}
        </p>
        <p className="text-sm text-ink-3 tabular">{correctCount} correct</p>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-brand transition-all"
          style={{ width: `${((index + (answered ? 1 : 0)) / quiz.length) * 100}%` }}
        />
      </div>

      <Card className="mt-4 animate-fade-up p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral">{q.topic}</Badge>
          <Pill>Practice</Pill>
        </div>
        <p className="mt-3 text-lg font-semibold leading-snug text-ink">{q.prompt}</p>

        <div className="mt-5 space-y-2.5">
          {q.options.map((opt, i) => {
            const chosen = picked === i;
            const correct = q.correctIndex === i;
            if (!answered) {
              return (
                <RadioCard
                  key={i}
                  name={q.id}
                  checked={false}
                  onChange={() => choose(i)}
                  label={opt}
                />
              );
            }
            // Answered: reveal the key. Correct row is always highlighted green;
            // a wrong pick is highlighted red.
            return (
              <div
                key={i}
                className={cn(
                  "flex items-center gap-2 rounded-md border px-4 py-3 text-[15px]",
                  correct
                    ? "border-success/50 bg-success-soft text-success"
                    : chosen
                      ? "border-error/50 bg-error-soft text-error"
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
              </div>
            );
          })}
        </div>

        {answered && (
          <div
            className={cn(
              "mt-4 rounded-md border px-3 py-2.5",
              picked === q.correctIndex ? "border-success/30 bg-success-soft/60" : "border-info/30 bg-info-soft/60",
            )}
          >
            <p className={cn("text-xs font-semibold uppercase tracking-wide", picked === q.correctIndex ? "text-success" : "text-info")}>
              {picked === q.correctIndex ? "Correct" : "Not quite"}
            </p>
            {q.explanation && <p className="mt-0.5 text-sm text-ink">{q.explanation}</p>}
          </div>
        )}
      </Card>

      <div className="mt-4 flex justify-end">
        <Button
          disabled={!answered}
          onClick={() => (isLast ? setDone(true) : setIndex((i) => i + 1))}
        >
          {isLast ? "Finish" : "Next question"}
          <Icon.ChevronRight className="h-[18px] w-[18px]" />
        </Button>
      </div>
    </div>
  );
}
