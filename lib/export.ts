/**
 * Export helpers (pure). The data seam owns the data; these just shape it.
 */
import type { Database } from "@/lib/data/seed";
import { awardedMarks } from "@/lib/scoring";

export type EntityKey =
  | "cohorts"
  | "students"
  | "tests"
  | "submissions"
  | "announcements"
  | "bank";

export const ENTITY_LABEL: Record<EntityKey, string> = {
  cohorts: "Cohorts",
  students: "Students",
  tests: "Tests",
  submissions: "Submissions",
  announcements: "Announcements",
  bank: "Question bank",
};

/** Entities that make sense as flat CSV tables. */
export const TABULAR: EntityKey[] = ["cohorts", "students", "submissions"];

export function buildExport(db: Database, selected: EntityKey[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of selected) {
    if (key === "bank") out["question_bank"] = db.bank;
    else out[key] = db[key];
  }
  return out;
}

export function entityCount(db: Database, key: EntityKey): number {
  if (key === "bank") return db.bank.length;
  return db[key].length;
}

/** Flatten an entity into CSV-friendly rows. */
export function entityRows(db: Database, key: EntityKey): Record<string, string | number>[] {
  switch (key) {
    case "cohorts":
      return db.cohorts.map((c) => ({ id: c.id, name: c.name, color: c.color, createdAt: c.createdAt }));
    case "students":
      return db.students.map((s) => ({ id: s.id, username: s.username, email: s.email ?? "", cohortId: s.cohortId, createdAt: s.createdAt }));
    case "submissions":
      return db.submissions.map((s) => ({
        id: s.id,
        testId: s.testId,
        studentId: s.studentId,
        status: s.status,
        autoSubmitted: s.autoSubmitted ? "yes" : "no",
        submittedAt: s.submittedAt ?? "",
        durationSeconds: s.durationSeconds ?? 0,
        marksAwarded: awardedMarks(s),
      }));
    default:
      return [];
  }
}

export function toCsv(rows: Record<string, string | number>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))];
  return lines.join("\n");
}

export function exportFilename(slug: string, dateIso: string, ext: string): string {
  const date = dateIso.slice(0, 10); // YYYY-MM-DD
  return `${slug}-export-${date}.${ext}`;
}
