"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import type { Answer, Question, Rubric, RubricScore } from "@/types";
import { useDatabase, useStore } from "@/lib/data/store";
import { submissionById, studentById, testById, rubricById } from "@/lib/data/selectors";
import { useToast } from "@/components/toast";
import { PageHeader } from "@/components/admin/PageHeader";
import { Card, Button, Badge, Pill, Textarea, EmptyState, Icon } from "@/components/ui";
import { awardedMarks, isFullyGraded, totalMarks } from "@/lib/scoring";
import { gradeSubmission } from "@/lib/grading";
import { cn } from "@/lib/cn";

export default function GradingPage() {
  const params = useParams();
  const subId = String(params.submissionId);
  const db = useDatabase();
  const store = useStore();
  const { toast } = useToast();

  const submission = submissionById(db, subId);
  const test = submission ? testById(db, submission.testId) : null;
  const student = submission ? studentById(db, submission.studentId) : null;

  if (!submission || !test || !student) {
    return (
      <div className="px-4 py-6 sm:px-6">
        <PageHeader title="Submission not found" back={{ href: "/admin/submissions", label: "Submissions" }} />
        <EmptyState icon={<Icon.Inbox />} title="This submission no longer exists" />
      </div>
    );
  }

  const total = totalMarks(test);
  const awarded = awardedMarks(submission);
  const fullyGraded = isFullyGraded(test, submission);
  const released = submission.status === "released";
  const grade = gradeSubmission(test, submission);

  return (
    <div className="px-4 py-6 sm:px-6">
      <PageHeader
        title="Grading"
        subtitle={`${student.username} · ${test.title}`}
        back={{ href: "/admin/submissions", label: "Submissions" }}
        actions={
          released ? (
            <>
              <Badge tone="success">Released</Badge>
              <Button variant="secondary" onClick={() => { store.unreleaseSubmission(subId); toast("Re-opened for grading.", "info"); }}>
                <Icon.Refresh className="h-4 w-4" /> Re-grade
              </Button>
            </>
          ) : (
            <Button disabled={!fullyGraded} onClick={() => { store.releaseSubmission(subId); toast("Result released to student.", "success"); }}>
              Release result
            </Button>
          )
        }
      />

      {/* Running total */}
      <Card ruled className="mb-5 flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">Running total</p>
          <p className="font-mono text-2xl font-bold text-ink">{awarded}<span className="text-base text-ink-3">/{total}</span></p>
        </div>
        <div className="text-right">
          <p className="font-mono text-lg font-semibold text-ink">{grade.percent}%</p>
          <p className="text-sm text-ink-2">Grade {grade.letter}</p>
        </div>
        {!fullyGraded && !released && (
          <p className="w-full rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning">
            Score every written and photo answer before releasing.
          </p>
        )}
      </Card>

      <div className="space-y-3">
        {test.questions.map((q, i) => {
          const a = submission.answers.find((x) => x.questionId === q.id);
          const rubric = q.type === "text" ? rubricById(db, q.rubricId) : null;
          return <GradeCard key={q.id} index={i} question={q} answer={a} rubric={rubric} submissionId={subId} />;
        })}
      </div>
    </div>
  );
}

function GradeCard({
  index,
  question,
  answer,
  rubric,
  submissionId,
}: {
  index: number;
  question: Question;
  answer?: Answer;
  rubric?: Rubric | null;
  submissionId: string;
}) {
  const store = useStore();
  const awarded = answer?.marksAwarded;
  const locked = question.type === "mcq";
  const useRubric = question.type === "text" && !!rubric;

  function setMarks(v: number) {
    const clamped = Math.max(0, Math.min(question.marks, v));
    store.gradeAnswer(submissionId, question.id, clamped, answer?.feedback);
  }

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-ink-3">Q{index + 1}</span>
          <Badge tone="neutral" className="uppercase">{question.type}</Badge>
          <Badge tone="brand">{question.topic}</Badge>
          <Pill>{question.marks}m</Pill>
          {locked && <span className="inline-flex items-center gap-1 text-xs text-ink-3"><Icon.Lock className="h-3 w-3" /> auto-graded</span>}
        </div>
      </div>
      <p className="mt-2 font-semibold text-ink">{question.prompt}</p>

      <div className="mt-3">
        {question.type === "mcq" && (
          <ul className="space-y-1.5">
            {question.options.map((opt, oi) => {
              const chosen = answer?.selectedIndex === oi;
              const correct = question.correctIndex === oi;
              return (
                <li key={oi} className={cn(
                  "flex items-center gap-2 rounded-md border px-3 py-2 text-sm",
                  correct ? "border-success/40 bg-success-soft text-success" : chosen ? "border-error/40 bg-error-soft text-error" : "border-border bg-surface text-ink-2",
                )}>
                  {correct ? <Icon.Check className="h-4 w-4 shrink-0" /> : chosen ? <Icon.Close className="h-4 w-4 shrink-0" /> : <span className="h-4 w-4 shrink-0" />}
                  <span>{opt}</span>
                  {chosen && <span className="ml-auto text-xs font-semibold">Student</span>}
                </li>
              );
            })}
          </ul>
        )}
        {question.type === "text" && (
          <div className="rounded-md border border-border bg-surface-2/60 p-3 text-sm text-ink">
            {answer?.text || <span className="italic text-ink-3">No answer given</span>}
          </div>
        )}
        {question.type === "photo" && (answer?.photoDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={answer.photoDataUrl} alt={`Answer to question ${index + 1}`} className="max-h-64 w-full rounded-md border border-border object-contain bg-surface-2" />
        ) : <p className="text-sm italic text-ink-3">No photo submitted</p>)}
      </div>

      {/* Scoring */}
      <div className="mt-4 border-t border-border pt-3">
        {locked ? (
          <p className="text-sm text-ink-2">Awarded <span className="font-mono font-semibold text-ink">{awarded ?? 0}/{question.marks}</span> automatically.</p>
        ) : useRubric ? (
          <RubricGrader question={question} rubric={rubric!} answer={answer} submissionId={submissionId} />
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-semibold text-ink-2">Marks</span>
              <div className="flex items-center gap-1.5">
                {Array.from({ length: question.marks + 1 }, (_, n) => (
                  <button
                    key={n}
                    onClick={() => setMarks(n)}
                    className={cn(
                      "h-9 min-w-9 rounded-md border px-2 font-mono text-sm font-semibold transition-colors",
                      awarded === n ? "border-brand bg-brand text-on-brand" : "border-border-strong bg-surface text-ink-2 hover:bg-surface-2",
                    )}
                    aria-label={`${n} marks`}
                    aria-pressed={awarded === n}
                  >
                    {n}
                  </button>
                ))}
                <span className="ml-1 text-sm text-ink-3">/ {question.marks}</span>
              </div>
            </div>
            <Textarea
              label="Feedback (optional)"
              value={answer?.feedback ?? ""}
              onChange={(e) => store.gradeAnswer(submissionId, question.id, awarded ?? 0, e.target.value)}
              placeholder="A short note for the student…"
              className="min-h-20"
            />
          </div>
        )}
      </div>
    </Card>
  );
}

/**
 * Per-criterion grading for a rubric-backed written answer. Committed scores
 * (brand-styled buttons) sum into marksAwarded. The AI suggestion is rendered in
 * a visually distinct, dismissible panel and never auto-fills — the admin must
 * click Accept (per-criterion) or Accept all.
 */
function RubricGrader({
  question,
  rubric,
  answer,
  submissionId,
}: {
  question: Question;
  rubric: Rubric;
  answer?: Answer;
  submissionId: string;
}) {
  const store = useStore();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const committed = new Map((answer?.rubricScores ?? []).map((s) => [s.criterionId, s.points]));
  const pointsFor = (criterionId: string) => committed.get(criterionId) ?? 0;
  const runningTotal = rubric.criteria.reduce((sum, c) => sum + pointsFor(c.id), 0);
  const maxTotal = rubric.criteria.reduce((sum, c) => sum + c.maxPoints, 0);

  /** Commit a new set of per-criterion scores (store re-sums into marksAwarded). */
  function commit(overrides: Record<string, number>) {
    const scores: RubricScore[] = rubric.criteria.map((c) => ({
      criterionId: c.id,
      points: c.id in overrides ? overrides[c.id] : pointsFor(c.id),
    }));
    store.gradeAnswer(submissionId, question.id, 0, answer?.feedback, scores);
  }

  const suggestion = answer?.aiSuggestion;
  const showSuggestion = !!suggestion && !dismissed;

  async function onSuggest() {
    if (!answer?.id) {
      toast("Save the submission before requesting a suggestion.", "error");
      return;
    }
    setLoading(true);
    setDismissed(false);
    const result = await store.requestAiSuggestion(answer.id);
    setLoading(false);
    if (!result) toast("Couldn't get an AI suggestion. Try again.", "error");
  }

  function acceptAll() {
    if (!suggestion) return;
    const overrides: Record<string, number> = {};
    for (const c of rubric.criteria) {
      const s = suggestion.scores.find((x) => x.criterionId === c.id);
      if (s) overrides[c.id] = Math.max(0, Math.min(c.maxPoints, s.points));
    }
    commit(overrides);
    setDismissed(true);
    toast("Applied all AI suggestions.", "success");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-ink-2">Rubric</span>
        <span className="font-mono text-sm text-ink">
          {runningTotal}<span className="text-ink-3">/{maxTotal}</span>
        </span>
      </div>

      <div className="space-y-3">
        {rubric.criteria.map((c) => {
          const current = pointsFor(c.id);
          const suggested = suggestion?.scores.find((s) => s.criterionId === c.id);
          return (
            <div key={c.id} className="rounded-md border border-border bg-surface p-3">
              <p className="text-sm font-semibold text-ink">{c.label}</p>
              {c.description && <p className="mt-0.5 text-xs text-ink-3">{c.description}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {Array.from({ length: c.maxPoints + 1 }, (_, n) => {
                  const has = answer?.rubricScores?.some((s) => s.criterionId === c.id);
                  return (
                    <button
                      key={n}
                      onClick={() => commit({ [c.id]: n })}
                      className={cn(
                        "h-9 min-w-9 rounded-md border px-2 font-mono text-sm font-semibold transition-colors",
                        has && current === n
                          ? "border-brand bg-brand text-on-brand"
                          : "border-border-strong bg-surface text-ink-2 hover:bg-surface-2",
                      )}
                      aria-label={`${n} points for ${c.label}`}
                      aria-pressed={!!has && current === n}
                    >
                      {n}
                    </button>
                  );
                })}
                <span className="ml-1 text-sm text-ink-3">/ {c.maxPoints}</span>
                {showSuggestion && suggested && (
                  <button
                    onClick={() => commit({ [c.id]: Math.max(0, Math.min(c.maxPoints, suggested.points)) })}
                    className="ml-auto inline-flex items-center gap-1 rounded-md border border-info/40 bg-info-soft px-2.5 py-1.5 text-xs font-semibold text-info transition-opacity hover:opacity-80"
                  >
                    <Icon.Check className="h-3.5 w-3.5" /> Accept {suggested.points}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* AI suggestion controls */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" loading={loading} onClick={onSuggest} disabled={loading}>
          <Icon.Award className="h-4 w-4" /> {suggestion ? "Re-run suggestion" : "Suggest grades"}
        </Button>
        {suggestion && dismissed && (
          <Button variant="ghost" size="sm" onClick={() => setDismissed(false)}>
            Show AI suggestion
          </Button>
        )}
      </div>

      {/* AI suggestion panel — visually distinct (info/dashed), dismissible */}
      {showSuggestion && suggestion && (
        <div className="rounded-md border border-dashed border-info/50 bg-info-soft/40 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <Icon.Award className="h-4 w-4 text-info" />
              <span className="text-xs font-bold uppercase tracking-wide text-info">AI suggestion</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button onClick={acceptAll} className="rounded-md bg-info px-2.5 py-1.5 text-xs font-semibold text-on-brand transition-opacity hover:opacity-90">
                Accept all
              </button>
              <button onClick={() => setDismissed(true)} className="flex h-7 w-7 items-center justify-center rounded text-info hover:bg-info/10" aria-label="Dismiss suggestion">
                <Icon.Close className="h-4 w-4" />
              </button>
            </div>
          </div>
          {suggestion.overallRationale && (
            <p className="mt-2 text-sm text-ink">{suggestion.overallRationale}</p>
          )}
          <ul className="mt-2.5 space-y-1.5">
            {rubric.criteria.map((c) => {
              const s = suggestion.scores.find((x) => x.criterionId === c.id);
              if (!s) return null;
              return (
                <li key={c.id} className="text-xs text-ink-2">
                  <span className="font-semibold text-ink">{c.label}: </span>
                  <span className="font-mono text-info">{s.points}/{c.maxPoints}</span>
                  {s.rationale && <span className="text-ink-3"> — {s.rationale}</span>}
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-[11px] text-ink-3">
            Suggested by {suggestion.model}. Nothing is applied until you accept it.
          </p>
        </div>
      )}

      <Textarea
        label="Feedback (optional)"
        value={answer?.feedback ?? ""}
        onChange={(e) => store.gradeAnswer(submissionId, question.id, answer?.marksAwarded ?? 0, e.target.value, answer?.rubricScores)}
        placeholder="A short note for the student…"
        className="min-h-20"
      />
    </div>
  );
}
