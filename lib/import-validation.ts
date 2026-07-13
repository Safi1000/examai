/**
 * Pure validation for the bulk-roster CSV import (Feature 3).
 *
 * The data seam owns the writes; this module just decides — per row — whether a
 * student can be provisioned and why not. It is side-effect-free apart from the
 * temp-password generator, so it stays easy to reason about and unit-test.
 *
 * Column mapping is deliberately forgiving so an admin can export the roster
 * (lib/export.ts writes `id,username,email,cohortId,createdAt`), edit it in a
 * spreadsheet, and import it straight back — while a hand-authored file using
 * friendly headers (`username,email,cohort`) works too. The cohort column is
 * matched against a cohort *name* first (e.g. "BSCS-2026"), then its id, so both
 * an exported `cohortId` (UUID) and a human-typed cohort name resolve.
 */
import type { Cohort, Student } from "@/types";
import type { CsvRow, ParsedCsv } from "@/lib/csv-parser";

/** A row after validation, ready to preview and (if valid) import. */
export interface ValidatedRow {
  /** Source line number, for "Row N" error reporting. */
  line: number;
  username: string;
  email: string;
  /** Cohort as written in the CSV (name or id). */
  cohortInput: string;
  /** Resolved cohort id, or null when it couldn't be matched. */
  cohortId: string | null;
  /** Resolved cohort display name, for the preview table. */
  cohortName: string;
  /** Generated temp password — the student's first-sign-in credential. */
  password: string;
  /** Human-readable problems; empty when the row is importable. */
  errors: string[];
  valid: boolean;
}

export interface ValidationResult {
  rows: ValidatedRow[];
  total: number;
  validCount: number;
  errorCount: number;
  /** Required headers that were absent from the file. */
  missingColumns: string[];
}

// Accepted header spellings (compared lower-cased, non-alphanumerics stripped).
const USERNAME_KEYS = ["username", "user", "login"];
const EMAIL_KEYS = ["email", "emailaddress", "mail"];
const COHORT_KEYS = ["cohort", "cohortid", "cohortname", "class", "group"];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const USERNAME_RE = /^[a-zA-Z0-9._-]+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PW_WORDS = ["maple", "river", "amber", "delta", "lunar", "cedar", "north", "ochre", "birch", "flint"];

/** A student's initial password — a readable word + 3 digits, easy to relay. */
export function genTempPassword(): string {
  const w = PW_WORDS[Math.floor(Math.random() * PW_WORDS.length)];
  return `${w}${Math.floor(100 + Math.random() * 900)}`;
}

/** Find the actual header that matches one of the accepted spellings. */
function pickHeader(headers: string[], accepted: string[]): string | null {
  for (const h of headers) {
    if (accepted.includes(norm(h))) return h;
  }
  return null;
}

/**
 * Validate a parsed CSV against the current roster + cohorts.
 *
 * @param parsed        output of parseCsv()
 * @param students      existing students (for duplicate-username detection)
 * @param cohorts       existing cohorts (for cohort resolution/validation)
 */
export function validateImport(
  parsed: ParsedCsv,
  students: Student[],
  cohorts: Cohort[],
): ValidationResult {
  const usernameHeader = pickHeader(parsed.headers, USERNAME_KEYS);
  const emailHeader = pickHeader(parsed.headers, EMAIL_KEYS);
  const cohortHeader = pickHeader(parsed.headers, COHORT_KEYS);

  const missingColumns: string[] = [];
  if (!usernameHeader) missingColumns.push("username");
  if (!cohortHeader) missingColumns.push("cohort");

  // Lookups: existing usernames (db) and cohort-by-name / cohort-by-id.
  const existing = new Set(students.map((s) => s.username.trim().toLowerCase()));
  const cohortByName = new Map(cohorts.map((c) => [c.name.trim().toLowerCase(), c]));
  const cohortById = new Map(cohorts.map((c) => [c.id, c]));

  // Track usernames seen *within this file* to flag in-file duplicates.
  const seenInFile = new Set<string>();

  const rows: ValidatedRow[] = parsed.rows.map((raw: CsvRow) => {
    const errors: string[] = [];

    const username = usernameHeader ? (raw.cells[usernameHeader] ?? "") : "";
    const email = emailHeader ? (raw.cells[emailHeader] ?? "") : "";
    const cohortInput = cohortHeader ? (raw.cells[cohortHeader] ?? "") : "";

    // --- Username ---
    if (!username) {
      errors.push("Username is required");
    } else if (!USERNAME_RE.test(username)) {
      errors.push("Username has invalid characters (use letters, numbers, . _ -)");
    } else {
      const key = username.toLowerCase();
      if (seenInFile.has(key)) {
        errors.push("Duplicate username in file");
      } else if (existing.has(key)) {
        errors.push("Username already exists");
      }
      seenInFile.add(key);
    }

    // --- Email (optional, but must be well-formed if present) ---
    if (email && !EMAIL_RE.test(email)) {
      errors.push("Invalid email");
    }

    // --- Cohort (required, resolved by name then id) ---
    let cohort: Cohort | undefined;
    if (!cohortInput) {
      errors.push("Cohort is required");
    } else {
      cohort = cohortByName.get(cohortInput.trim().toLowerCase()) ?? cohortById.get(cohortInput.trim());
      if (!cohort) errors.push("Invalid cohort");
    }

    return {
      line: raw.line,
      username,
      email,
      cohortInput,
      cohortId: cohort?.id ?? null,
      cohortName: cohort?.name ?? cohortInput,
      password: genTempPassword(),
      errors,
      valid: errors.length === 0,
    };
  });

  const validCount = rows.filter((r) => r.valid).length;
  return {
    rows,
    total: rows.length,
    validCount,
    errorCount: rows.length - validCount,
    missingColumns,
  };
}
