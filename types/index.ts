/**
 * Domain model — the 8 core entities plus the supporting shapes the UI needs.
 * Every component is typed against these. Strict mode is on.
 */

// ----------------------------------------------------------------------------
// 1. Cohorts
// ----------------------------------------------------------------------------

/** Index into the cohort-dot tokens (--color-cohort-1..12). */
export type CohortColor = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export interface Cohort {
  id: string;
  name: string;
  color: CohortColor;
  /** IDs of classes offered within this cohort. */
  classIds: string[];
  /** IDs of subjects offered within this cohort. */
  subjectIds: string[];
  createdAt: string; // ISO
}

// ----------------------------------------------------------------------------
// 2. Students
// ----------------------------------------------------------------------------

export interface Student {
  id: string;
  username: string;
  email?: string;
  cohortId: string;
  /** IDs of classes the student is enrolled in. */
  classIds: string[];
  /** IDs of subjects the student is enrolled in. */
  subjectIds: string[];
  /**
   * Initial password, used only when the admin creates/edits a student (the
   * Edge Function provisions the Supabase Auth user with it). Never loaded back
   * from the server — auth owns the credential after that.
   */
  tempPassword?: string;
  createdAt: string;
}

// ----------------------------------------------------------------------------
// 2b. Classes and Subjects (global catalogues)
// ----------------------------------------------------------------------------

export interface ClassItem {
  id: string;
  name: string;
  createdAt: string;
}

export interface SubjectItem {
  id: string;
  name: string;
  createdAt: string;
}

// ----------------------------------------------------------------------------
// 2c. Notes (uploaded resource files)
// ----------------------------------------------------------------------------

export interface Note {
  id: string;
  title: string;
  fileUrl: string;
  fileType: string;
  fileName: string;
  createdAt: string;
}

export interface NoteAssignment {
  id: string;
  noteId: string;
  /** Cohort the note is assigned to (required). */
  cohortId: string;
  /** If set, only students enrolled in this class within the cohort see the note. */
  classId: string | null;
  /** If set, only students enrolled in this subject (and class if also set) see the note. */
  subjectId: string | null;
  createdAt: string;
}

// ----------------------------------------------------------------------------
// 3. + 8. Questions and the reusable question bank
// ----------------------------------------------------------------------------

export type QuestionType = "mcq" | "text" | "photo";

/** Type-specific payload, discriminated on `type`. */
export type QuestionVariant =
  | {
      type: "mcq";
      options: string[]; // exactly 4 in the UI
      /** TODO(security): answer key belongs server-side, never shipped to students. */
      correctIndex: number;
    }
  | { type: "text"; maxLength?: number; showCounter?: boolean }
  | { type: "photo" };

export interface QuestionCommon {
  id: string;
  prompt: string;
  marks: number;
  topic: string;
}

/** A question as embedded in a test (carries display order). */
export type Question = QuestionCommon & QuestionVariant & { order: number };

/** A reusable bank question (carries subject, no order until imported). */
export type QuestionBankItem = QuestionCommon & QuestionVariant & { subject: string };

// ----------------------------------------------------------------------------
// 4. Tests
// ----------------------------------------------------------------------------

export type TestStatus = "draft" | "active" | "closed";

export interface Test {
  id: string;
  title: string;
  subject: string;
  durationMinutes: number;
  /** null = open to all cohorts. */
  cohortId: string | null;
  opensAt: string; // ISO
  closesAt: string; // ISO
  testCode: string;
  status: TestStatus;
  questions: Question[];
  createdAt: string;
}

// ----------------------------------------------------------------------------
// 5. + 6. Submissions and answers
// ----------------------------------------------------------------------------

export interface Answer {
  questionId: string;
  type: QuestionType;
  /** MCQ selection. */
  selectedIndex?: number;
  /** Text answer body. */
  text?: string;
  /** Mock: a data URL. TODO(cloudinary): replace with uploaded asset URL. */
  photoDataUrl?: string;
  /** Grading — undefined until scored. */
  marksAwarded?: number;
  feedback?: string;
}

export type SubmissionStatus = "in_progress" | "submitted" | "released";

export interface Submission {
  id: string;
  testId: string;
  studentId: string;
  answers: Answer[];
  status: SubmissionStatus;
  startedAt: string;
  submittedAt?: string;
  autoSubmitted?: boolean;
  durationSeconds?: number;
  releasedAt?: string;
}

// ----------------------------------------------------------------------------
// 7. Announcements
// ----------------------------------------------------------------------------

export interface Announcement {
  id: string;
  body: string; // <= 250 chars (enforced in the editor)
  pinned: boolean;
  /** null = visible to all cohorts. */
  cohortId: string | null;
  createdAt: string;
  /** studentIds that dismissed an unpinned announcement (mock persistence). */
  dismissedBy: string[];
}

// ----------------------------------------------------------------------------
// Supporting shapes (auth, drafts) — not entities, but needed by the UI.
// ----------------------------------------------------------------------------

export type Role = "student" | "admin";

export interface Session {
  role: Role;
  studentId?: string; // present when role === "student"
}

/** Autosaved test-runner draft (survives refresh; per student+test). */
export interface Draft {
  testId: string;
  studentId: string;
  answers: Answer[];
  currentIndex: number;
  startedAt: string;
  savedAt: string;
}

/** Per-test derived statistics for admin lists. */
export interface TestStats {
  submissionCount: number;
  averagePercent: number | null;
  completionPercent: number;
}
