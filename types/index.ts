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

/**
 * Stored lifecycle state.
 *  - draft     : not published (hidden from students)
 *  - active    : published & schedule-driven — the *effective* status (scheduled
 *                / open / closed) is derived from opensAt/closesAt at read time
 *  - closed    : manually force-closed early (overrides the schedule)
 *  - cancelled : manually cancelled by an admin (overrides the schedule)
 * See `effectiveTestStatus()` in lib/time.ts for the derived display status.
 */
export type TestStatus = "draft" | "active" | "closed" | "cancelled";

export interface Test {
  id: string;
  title: string;
  subject: string;
  durationMinutes: number;
  /** null = open to all cohorts. */
  cohortId: string | null;
  /** null = open to all classes within the cohort. */
  classId: string | null;
  /** null = open to all subjects within the cohort. */
  subjectId: string | null;
  opensAt: string; // ISO
  closesAt: string; // ISO
  /** When results auto-release. null = manual release only. Stored UTC. */
  releaseAt?: string | null;
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

// ----------------------------------------------------------------------------
// 9. Notifications
// ----------------------------------------------------------------------------

/** Which inbox a notification belongs to. */
export type NotificationAudience = "student" | "admin";

/**
 * Event taxonomy. The DB stores a free-text `type`; the UI maps these known
 * values to an icon/tone and falls back gracefully for anything new.
 */
export type NotificationType =
  | "test_posted"
  | "test_updated"
  | "test_deleted"
  | "test_reminder"
  | "test_started"
  | "test_closing"
  | "test_closed"
  | "test_submitted"
  | "late_submission"
  | "notes_uploaded"
  | "notes_updated"
  | "notes_deleted"
  | "result_graded"
  | "result_released"
  | "announcement"
  | "cohort_enrollment"
  | "cohort_changed"
  | "integrity_report"
  | "grade_updated"
  | "system";

/**
 * A single delivered notification (one row per recipient). Mirrors the
 * `notifications` table; created only server-side (triggers + cron) and read
 * scoped by RLS. `metadata` carries event-specific extras (subject, times, …).
 */
export interface Notification {
  id: string;
  audience: NotificationAudience;
  /** Present on student-audience rows; null on admin rows. */
  recipientStudentId: string | null;
  cohortId: string | null;
  subjectId: string | null;
  title: string;
  message: string;
  type: NotificationType | (string & {});
  actionUrl: string | null;
  relatedTestId: string | null;
  relatedNoteId: string | null;
  relatedSubmissionId: string | null;
  metadata: Record<string, unknown>;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
  expiresAt: string | null;
}
