/**
 * Pure selectors over the database snapshot. These approximate the row-level
 * security a real backend would enforce; TODO(rls) move scoping server-side.
 */
import type { Announcement, Student, Submission, Test, TestStats } from "@/types";
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
