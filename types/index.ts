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
  | {
      type: "text";
      maxLength?: number;
      showCounter?: boolean;
      /** Optional reusable rubric this written question is graded against. */
      rubricId?: string;
    }
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
  /** Answer row id — present once loaded from the server (used by AI grading). */
  id?: string;
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
  /**
   * Human-committed per-criterion breakdown for rubric-graded written answers.
   * Always sums into `marksAwarded`. Visible to the student once released.
   */
  rubricScores?: RubricScore[];
  /**
   * AI-generated grading suggestion. NEVER auto-committed — an admin must
   * explicitly accept it into `rubricScores`. Admin-only: never reaches a
   * student client (stored in a separate admin-only table).
   */
  aiSuggestion?: AiSuggestion;
}

// ----------------------------------------------------------------------------
// 6b. Rubrics + AI grading assist (written answers)
// ----------------------------------------------------------------------------

/**
 * A single rubric criterion: a CONCEPT the student must demonstrate, not a
 * model answer to string-match. `description` guides the AI's judgment.
 */
export interface RubricCriterion {
  id: string;
  label: string;
  description?: string;
  maxPoints: number;
}

/** A reusable rubric — attach the same one to many written questions. */
export interface Rubric {
  id: string;
  name: string;
  criteria: RubricCriterion[];
  createdAt: string;
}

/** One human-committed criterion score on an answer. */
export interface RubricScore {
  criterionId: string;
  points: number;
}

/** One AI-suggested criterion score, with the model's reasoning. */
export interface AiCriterionScore {
  criterionId: string;
  points: number;
  rationale: string;
}

/** The AI grading suggestion returned by the grade-suggest edge function. */
export interface AiSuggestion {
  scores: AiCriterionScore[];
  overallRationale: string;
  model: string;
  at: string; // ISO
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
// 7b. Question flags (student ↔ admin messaging about a question)
// ----------------------------------------------------------------------------

export type FlagReason = "typo" | "ambiguous" | "technical" | "other";

export type FlagStatus = "open" | "resolved";

/**
 * A student's report of a problem with a question. Raised mid-test (before a
 * submission row exists — hence the nullable submissionId) or from the released
 * result breakdown. The admin is the only party who can reply or resolve; RLS
 * scopes reads to the owning student (see the question_flags migration).
 */
export interface QuestionFlag {
  id: string;
  /** null when the flag was raised during the test, before submitting. */
  submissionId: string | null;
  /** null if the question has since been deleted — questionPrompt still shows. */
  questionId: string | null;
  /** null if the test has since been deleted. */
  testId: string | null;
  /** Prompt snapshotted at flag time, so a deleted question still renders. */
  questionPrompt: string | null;
  studentId: string;
  reason: FlagReason;
  message: string; // <= 250 chars (enforced in the editor and the DB)
  adminReply?: string;
  status: FlagStatus;
  createdAt: string;
}

/** Who wrote a turn in a flag conversation. */
export type FlagSender = "student" | "admin";

/**
 * One turn in a flag's conversation. question_flags is the thread header; these
 * are its ordered messages (the opening student turn is seeded server-side).
 * A student may only ever append their own 'student' turns — RLS forbids forging
 * an 'admin' reply or editing any message.
 */
export interface FlagMessage {
  id: string;
  flagId: string;
  studentId: string;
  sender: FlagSender;
  body: string; // <= 250 chars (enforced in the editor and the DB)
  createdAt: string;
}

// ----------------------------------------------------------------------------
// 10. Exam security — integrity violations and exam locking
// ----------------------------------------------------------------------------

/** Every integrity breach the runner watches for. */
export type ViolationType =
  | "tab_switch"
  | "window_blur"
  | "fullscreen_exit"
  | "copy"
  | "paste"
  | "cut"
  | "right_click"
  | "blocked_shortcut";

/** Append-only audit row: one per detected violation. */
export interface ExamViolation {
  id: string;
  studentId: string;
  testId: string;
  violationType: ViolationType;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export type ExamLockStatus = "locked" | "active";

/**
 * A student's exam status for one test. Created ONLY server-side (a trigger on
 * exam_violations); students have no write path at all — only an admin can flip
 * it back to "active". The submissions INSERT policy refuses a locked student,
 * so the lock holds even against a tampered client.
 */
export interface ExamLock {
  id: string;
  studentId: string;
  testId: string;
  status: ExamLockStatus;
  /** The violation type that tripped the lock. */
  reason: ViolationType | null;
  violationCount: number;
  lockedAt: string | null;
  unlockedAt: string | null;
  createdAt: string;
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
  | "exam_locked"
  | "exam_unlocked"
  | "question_flagged"
  | "flag_reply"
  | "flag_resolved"
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
