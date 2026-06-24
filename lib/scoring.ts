/**
 * Pure scoring + mastery-banding helpers. No side effects — trivially testable.
 */
import type { Answer, Question, Submission, Test } from "@/types";

export type MasteryBand = "mastery" | "weak" | "critical";

/** Spec banding: >60% mastery, 50–60% weak, <50% critical. */
export function masteryBand(percent: number): MasteryBand {
  if (percent > 60) return "mastery";
  if (percent >= 50) return "weak";
  return "critical";
}

/** Maps a band to the semantic role token name used for color. */
export function bandRole(band: MasteryBand): "success" | "warning" | "error" {
  return band === "mastery" ? "success" : band === "weak" ? "warning" : "error";
}

export function clampPercent(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

export function percent(awarded: number, total: number): number {
  if (total <= 0) return 0;
  return clampPercent((awarded / total) * 100);
}

/** Total marks available on a test. */
export function totalMarks(test: Test): number {
  return test.questions.reduce((sum, q) => sum + q.marks, 0);
}

/** Sum of marks awarded across answers (treats ungraded as 0). */
export function awardedMarks(submission: Submission): number {
  return submission.answers.reduce((sum, a) => sum + (a.marksAwarded ?? 0), 0);
}

/** True once every answer on the test has a numeric marksAwarded. */
export function isFullyGraded(test: Test, submission: Submission): boolean {
  return test.questions.every((q) => {
    const a = submission.answers.find((x) => x.questionId === q.id);
    return a != null && typeof a.marksAwarded === "number";
  });
}

/** Per-topic mastery aggregated across a set of graded submissions. */
export interface TopicMastery {
  topic: string;
  awarded: number;
  available: number;
  percent: number;
  band: MasteryBand;
}

export function topicMastery(
  tests: Test[],
  submissions: Submission[],
): TopicMastery[] {
  const testById = new Map(tests.map((t) => [t.id, t]));
  const acc = new Map<string, { awarded: number; available: number }>();

  for (const sub of submissions) {
    const test = testById.get(sub.testId);
    if (!test) continue;
    for (const q of test.questions) {
      const ans = sub.answers.find((a) => a.questionId === q.id);
      if (!ans || typeof ans.marksAwarded !== "number") continue;
      const bucket = acc.get(q.topic) ?? { awarded: 0, available: 0 };
      bucket.awarded += ans.marksAwarded;
      bucket.available += q.marks;
      acc.set(q.topic, bucket);
    }
  }

  return Array.from(acc.entries())
    .map(([topic, { awarded, available }]) => {
      const p = percent(awarded, available);
      return { topic, awarded, available, percent: p, band: masteryBand(p) };
    })
    .sort((a, b) => a.percent - b.percent);
}

/** Auto-score an MCQ answer against the (server-owned) key. */
export function scoreMcq(question: Question, answer: Answer | undefined): number {
  if (question.type !== "mcq" || !answer) return 0;
  return answer.selectedIndex === question.correctIndex ? question.marks : 0;
}
