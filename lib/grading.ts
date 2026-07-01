/**
 * Pure grade-letter + auto-grading helpers.
 */
import type { Answer, Submission, Test } from "@/types";
import { awardedMarks, scoreMcq, totalMarks } from "@/lib/scoring";

export type GradeLetter = "A*" | "A" | "B" | "C" | "D" | "E" | "U";

/** Grade bands. A 100% result must return A*. */
export function gradeLetter(percent: number): GradeLetter {
  if (percent >= 92) return "A*";
  if (percent >= 85) return "A";
  if (percent >= 75) return "B";
  if (percent >= 65) return "C";
  if (percent >= 60) return "D";
  if (percent >= 50) return "E";
  return "U";
}

export const GRADE_ORDER: GradeLetter[] = ["A*", "A", "B", "C", "D", "E", "U"];

/** Semantic role for a grade, reused by badges and the distribution chart. */
export function gradeRole(letter: GradeLetter): "success" | "warning" | "error" {
  if (letter === "A*" || letter === "A" || letter === "B") return "success";
  if (letter === "C" || letter === "D" || letter === "E") return "warning";
  return "error";
}

/**
 * Auto-grade every MCQ on a submission; text/photo are left untouched for
 * manual scoring. Returns a new answers array (pure).
 */
export function autoGradeMcq(test: Test, answers: Answer[]): Answer[] {
  return answers.map((a) => {
    const q = test.questions.find((x) => x.id === a.questionId);
    if (!q || q.type !== "mcq") return a;
    return { ...a, marksAwarded: scoreMcq(q, a) };
  });
}

/** A test where every question is an MCQ — eligible for bulk release. */
export function isAllMcq(test: Test): boolean {
  return test.questions.length > 0 && test.questions.every((q) => q.type === "mcq");
}

export interface GradeResult {
  awarded: number;
  total: number;
  percent: number;
  letter: GradeLetter;
}

export function gradeSubmission(test: Test, submission: Submission): GradeResult {
  const total = totalMarks(test);
  const awarded = awardedMarks(submission);
  const pct = total > 0 ? (awarded / total) * 100 : 0;
  return {
    awarded,
    total,
    percent: Math.round(pct * 10) / 10,
    letter: gradeLetter(pct),
  };
}
