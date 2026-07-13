/**
 * Pure selectors over the database snapshot. These approximate the row-level
 * security a real backend would enforce; TODO(rls) move scoping server-side.
 */
import type {
  Announcement,
  ExamLock,
  ExamViolation,
  FlagMessage,
  QuestionFlag,
  Student,
  Submission,
  Test,
  TestStats,
  ViolationType,
} from "@/types";
import type { Database } from "@/lib/data/seed";
import { awardedMarks, percent, totalMarks } from "@/lib/scoring";

export const cohortById = (db: Database, id: string | null) =>
  id ? db.cohorts.find((c) => c.id === id) ?? null : null;
export const studentById = (db: Database, id: string) => db.students.find((s) => s.id === id) ?? null;
export const testById = (db: Database, id: string) => db.tests.find((t) => t.id === id) ?? null;
export const submissionById = (db: Database, id: string) =>
  db.submissions.find((s) => s.id === id) ?? null;
export const rubricById = (db: Database, id: string | null | undefined) =>
  id ? db.rubrics.find((r) => r.id === id) ?? null : null;

export const studentsInCohort = (db: Database, cohortId: string) =>
  db.students.filter((s) => s.cohortId === cohortId);

/** Tests a student can see: cohort + class + subject match, never drafts. */
export function testsForStudent(db: Database, student: Student): Test[] {
  return db.tests.filter(
    (t) =>
      t.status !== "draft" &&
      (t.cohortId === null || t.cohortId === student.cohortId) &&
      (t.classId === null || student.classIds.includes(t.classId)) &&
      (t.subjectId === null || student.subjectIds.includes(t.subjectId)),
  );
}

/** Announcements visible to a student (cohort-scoped); pinned always shown. */
export function announcementsForStudent(db: Database, student: Student): Announcement[] {
  return db.announcements.filter(
    (a) => a.cohortId === null || a.cohortId === student.cohortId,
  );
}

export function submissionFor(db: Database, studentId: string, testId: string): Submission | null {
  return (
    db.submissions.find((s) => s.studentId === studentId && s.testId === testId) ?? null
  );
}

/**
 * Flags the signed-in student raised on one question. RLS already scopes the
 * cache to their own rows; the studentId filter keeps the selector honest.
 */
export function flagsForQuestion(db: Database, studentId: string, questionId: string): QuestionFlag[] {
  return db.questionFlags.filter((f) => f.studentId === studentId && f.questionId === questionId);
}

export function submissionsForTest(db: Database, testId: string): Submission[] {
  return db.submissions.filter((s) => s.testId === testId);
}

export function submissionsForStudent(db: Database, studentId: string): Submission[] {
  return db.submissions.filter((s) => s.studentId === studentId);
}

/** Per-test admin stats: submissions, average %, completion %. */
export function testStats(db: Database, test: Test): TestStats {
  const subs = submissionsForTest(db, test.id);
  const eligible =
    test.cohortId === null
      ? db.students.length
      : studentsInCohort(db, test.cohortId).length;
  const total = totalMarks(test);
  const graded = subs.filter((s) => s.status === "released" || s.status === "submitted");
  const averagePercent =
    graded.length > 0 && total > 0
      ? Math.round(
          (graded.reduce((sum, s) => sum + percent(awardedMarks(s), total), 0) / graded.length) * 10,
        ) / 10
      : null;
  return {
    submissionCount: subs.length,
    averagePercent,
    completionPercent: eligible > 0 ? Math.round((subs.length / eligible) * 100) : 0,
  };
}

// ---- Exam security ---------------------------------------------------------

/** The lock row for one student+test, if any (RLS already scoped the rows). */
export function examLockFor(db: Database, studentId: string, testId: string): ExamLock | null {
  return db.examLocks.find((l) => l.studentId === studentId && l.testId === testId) ?? null;
}

/** Is this student currently locked out of this test? */
export function isExamLocked(db: Database, studentId: string, testId: string): boolean {
  return examLockFor(db, studentId, testId)?.status === "locked";
}

/** Every currently-locked student, newest lock first (admin view). */
export function lockedExams(db: Database): ExamLock[] {
  return db.examLocks
    .filter((l) => l.status === "locked")
    .sort((a, b) => +new Date(b.lockedAt ?? 0) - +new Date(a.lockedAt ?? 0));
}

// ---- Flag conversations ----------------------------------------------------

/** A flag's thread, oldest → newest. */
export function messagesForFlag(db: Database, flagId: string): FlagMessage[] {
  return db.flagMessages
    .filter((m) => m.flagId === flagId)
    .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
}

// ---- Exam security history -------------------------------------------------

/** One student's violations on one test, oldest → newest (chronological timeline). */
export function violationsFor(db: Database, studentId: string, testId: string): ExamViolation[] {
  return db.examViolations
    .filter((v) => v.studentId === studentId && v.testId === testId)
    .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
}

/** Count per violation type (drives the summary badges). */
export function violationSummary(violations: ExamViolation[]): Record<ViolationType, number> {
  const out: Record<ViolationType, number> = {
    tab_switch: 0, window_blur: 0, fullscreen_exit: 0, copy: 0,
    paste: 0, cut: 0, right_click: 0, blocked_shortcut: 0,
  };
  for (const v of violations) out[v.violationType] += 1;
  return out;
}

/**
 * One security report per (student, test) that has any violation OR a lock —
 * so a locked student always appears even if their violations were purged, and a
 * student with violations appears even if they were never locked.
 */
export interface SecurityReport {
  studentId: string;
  testId: string;
  violations: ExamViolation[];
  lock: ExamLock | null;
}

export function securityReports(db: Database): SecurityReport[] {
  const keys = new Map<string, { studentId: string; testId: string }>();
  for (const v of db.examViolations) keys.set(`${v.studentId}:${v.testId}`, { studentId: v.studentId, testId: v.testId });
  for (const l of db.examLocks) keys.set(`${l.studentId}:${l.testId}`, { studentId: l.studentId, testId: l.testId });

  return [...keys.values()]
    .map(({ studentId, testId }) => ({
      studentId,
      testId,
      violations: violationsFor(db, studentId, testId),
      lock: examLockFor(db, studentId, testId),
    }))
    .sort((a, b) => {
      // Locked first, then most recent activity.
      const aLocked = a.lock?.status === "locked" ? 1 : 0;
      const bLocked = b.lock?.status === "locked" ? 1 : 0;
      if (aLocked !== bLocked) return bLocked - aLocked;
      const aAt = a.violations.at(-1)?.createdAt ?? a.lock?.lockedAt ?? 0;
      const bAt = b.violations.at(-1)?.createdAt ?? b.lock?.lockedAt ?? 0;
      return +new Date(bAt) - +new Date(aAt);
    });
}
