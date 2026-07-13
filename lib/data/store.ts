"use client";

/**
 * ============================================================================
 * THE SINGLE DATA SEAM (Supabase-backed).
 *
 * Every read and write in the app goes through this module. It keeps an
 * in-memory cache of the database (hydrated from Supabase per session, scoped by
 * Row-Level Security) so the rest of the app can stay synchronous: components
 * read `useDatabase()` and call store actions without awaiting. Actions update
 * the cache optimistically (using client-generated UUIDs so returned ids are
 * available immediately) and persist to Supabase in the background; failures are
 * surfaced through the registered error reporter.
 *
 * Security notes:
 *  - MCQ grading runs in a Postgres trigger; answer keys live in question_keys
 *    (admin-only) and are merged into the cache from there (admin) or from the
 *    student's own released answers (student). They never load mid-test.
 *  - Privileged user provisioning goes through the `admin-users` edge function.
 * ============================================================================
 */
import { useSyncExternalStore } from "react";
import type {
  Announcement,
  Answer,
  ClassItem,
  Cohort,
  CohortColor,
  ExamLock,
  ExamViolation,
  FlagMessage,
  Note,
  NoteAssignment,
  Question,
  QuestionBankItem,
  QuestionCommon,
  QuestionFlag,
  QuestionVariant,
  AiSuggestion,
  Rubric,
  RubricCriterion,
  RubricScore,
  Student,
  SubjectItem,
  Submission,
  Test,
  TestStatus,
  ViolationType,
} from "@/types";
import type { Database } from "@/lib/data/seed";
import { supabase } from "@/lib/supabase";

/**
 * Discriminated "create" shapes. `Omit<Question, …>` collapses the variant union
 * (TS keeps only common keys), so we rebuild the union explicitly to read
 * type-specific fields (options/correctIndex/maxLength).
 */
/**
 * Character ceiling for a flag message and an admin reply. The DB enforces the
 * same limit (varchar(250) + a non-empty check) — this constant only keeps the
 * counter, the textarea and the client-side guard honest.
 */
export const FLAG_MESSAGE_MAX = 250;

type QuestionInput = Omit<QuestionCommon, "id"> & QuestionVariant;
type BankInput = Omit<QuestionCommon, "id"> & QuestionVariant & { subject: string };

function genId(): string {
  // Supabase columns are uuid; generating client-side keeps action returns sync.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // Fallback (older runtimes): RFC4122-ish.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const EMPTY: Database = {
  cohorts: [],
  students: [],
  tests: [],
  submissions: [],
  announcements: [],
  bank: [],
  classes: [],
  subjects: [],
  notes: [],
  noteAssignments: [],
  questionFlags: [],
  rubrics: [],
  flagMessages: [],
  examLocks: [],
  examViolations: [],
};

// ---------------------------------------------------------------------------
// Row <-> domain mappers (snake_case columns <-> camelCase types).
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;

const mapCohort = (r: Row, classIds: string[] = [], subjectIds: string[] = []): Cohort => ({
  id: r.id as string,
  name: r.name as string,
  color: r.color as CohortColor,
  classIds,
  subjectIds,
  createdAt: r.created_at as string,
});

const mapStudent = (r: Row, classIds: string[] = [], subjectIds: string[] = []): Student => ({
  id: r.id as string,
  username: r.username as string,
  email: (r.email as string) ?? undefined,
  cohortId: (r.cohort_id as string) ?? "",
  classIds,
  subjectIds,
  createdAt: r.created_at as string,
});

const mapClass = (r: Row): ClassItem => ({
  id: r.id as string,
  name: r.name as string,
  createdAt: r.created_at as string,
});

const mapSubject = (r: Row): SubjectItem => ({
  id: r.id as string,
  name: r.name as string,
  createdAt: r.created_at as string,
});

const mapNote = (r: Row): Note => ({
  id: r.id as string,
  title: r.title as string,
  fileUrl: r.file_url as string,
  fileType: r.file_type as string,
  fileName: r.file_name as string,
  createdAt: r.created_at as string,
});

const mapNoteAssignment = (r: Row): NoteAssignment => ({
  id: r.id as string,
  noteId: r.note_id as string,
  cohortId: r.cohort_id as string,
  classId: (r.class_id as string) ?? null,
  subjectId: (r.subject_id as string) ?? null,
  createdAt: r.created_at as string,
});

function mapQuestion(r: Row, correctIndex: number | undefined): Question {
  const base = {
    id: r.id as string,
    prompt: r.prompt as string,
    marks: r.marks as number,
    topic: r.topic as string,
    order: (r.sort_order as number) ?? 0,
  };
  if (r.type === "mcq") {
    // -1 means "withheld" — the student client has no key until results release.
    return { ...base, type: "mcq", options: (r.options as string[]) ?? [], correctIndex: correctIndex ?? -1 };
  }
  if (r.type === "text") {
    return {
      ...base,
      type: "text",
      maxLength: (r.max_length as number) ?? undefined,
      showCounter: (r.show_counter as boolean) ?? undefined,
      rubricId: (r.rubric_id as string) ?? undefined,
    };
  }
  return { ...base, type: "photo" };
}

const mapRubric = (r: Row): Rubric => ({
  id: r.id as string,
  name: r.name as string,
  criteria: ((r.criteria as RubricCriterion[]) ?? []).map((c) => ({
    id: c.id,
    label: c.label,
    description: c.description ?? undefined,
    maxPoints: c.maxPoints,
  })),
  createdAt: r.created_at as string,
});

/** Map an AI-suggestion row (admin-only table) into the domain shape. */
const mapAiSuggestion = (r: Row): AiSuggestion => ({
  scores: (r.scores as AiSuggestion["scores"]) ?? [],
  overallRationale: (r.overall_rationale as string) ?? "",
  model: r.model as string,
  at: r.created_at as string,
});

/** `aiByAnswer` maps answer row id -> suggestion (admin sessions only). */
const mapAnswer = (r: Row, aiByAnswer?: Map<string, AiSuggestion>): Answer => ({
  id: r.id as string,
  questionId: r.question_id as string,
  type: r.type as Answer["type"],
  selectedIndex: (r.selected_index as number) ?? undefined,
  text: (r.text as string) ?? undefined,
  photoDataUrl: (r.photo_url as string) ?? undefined,
  marksAwarded: (r.marks_awarded as number) ?? undefined,
  feedback: (r.feedback as string) ?? undefined,
  rubricScores: (r.rubric_scores as RubricScore[]) ?? undefined,
  aiSuggestion: aiByAnswer?.get(r.id as string),
});

const mapSubmission = (r: Row, aiByAnswer?: Map<string, AiSuggestion>): Submission => ({
  id: r.id as string,
  testId: r.test_id as string,
  studentId: r.student_id as string,
  status: r.status as Submission["status"],
  startedAt: r.started_at as string,
  submittedAt: (r.submitted_at as string) ?? undefined,
  autoSubmitted: (r.auto_submitted as boolean) ?? undefined,
  durationSeconds: (r.duration_seconds as number) ?? undefined,
  releasedAt: (r.released_at as string) ?? undefined,
  answers: ((r.answers as Row[]) ?? []).map((a) => mapAnswer(a, aiByAnswer)),
});

const mapAnnouncement = (r: Row): Announcement => ({
  id: r.id as string,
  body: r.body as string,
  pinned: r.pinned as boolean,
  cohortId: (r.cohort_id as string) ?? null,
  createdAt: r.created_at as string,
  dismissedBy: (r.dismissed_by as string[]) ?? [],
});

const mapFlagMessage = (r: Row): FlagMessage => ({
  id: r.id as string,
  flagId: r.flag_id as string,
  studentId: r.student_id as string,
  sender: r.sender as FlagMessage["sender"],
  body: r.body as string,
  createdAt: r.created_at as string,
});

const mapExamViolation = (r: Row): ExamViolation => ({
  id: r.id as string,
  studentId: r.student_id as string,
  testId: r.test_id as string,
  violationType: r.violation_type as ExamViolation["violationType"],
  metadata: (r.metadata as Record<string, unknown>) ?? {},
  createdAt: r.created_at as string,
});

const mapExamLock = (r: Row): ExamLock => ({
  id: r.id as string,
  studentId: r.student_id as string,
  testId: r.test_id as string,
  status: r.status as ExamLock["status"],
  reason: (r.reason as ExamLock["reason"]) ?? null,
  violationCount: (r.violation_count as number) ?? 0,
  lockedAt: (r.locked_at as string) ?? null,
  unlockedAt: (r.unlocked_at as string) ?? null,
  createdAt: r.created_at as string,
});

const mapQuestionFlag = (r: Row): QuestionFlag => ({
  id: r.id as string,
  submissionId: (r.submission_id as string) ?? null,
  questionId: (r.question_id as string) ?? null,
  testId: (r.test_id as string) ?? null,
  questionPrompt: (r.question_prompt as string) ?? null,
  studentId: r.student_id as string,
  reason: r.reason as QuestionFlag["reason"],
  message: r.message as string,
  adminReply: (r.admin_reply as string) ?? undefined,
  status: r.status as QuestionFlag["status"],
  createdAt: r.created_at as string,
});

function mapBank(r: Row): QuestionBankItem {
  const base = {
    id: r.id as string,
    subject: r.subject as string,
    prompt: r.prompt as string,
    marks: r.marks as number,
    topic: r.topic as string,
  };
  if (r.type === "mcq") {
    return { ...base, type: "mcq", options: (r.options as string[]) ?? [], correctIndex: (r.correct_index as number) ?? 0 };
  }
  if (r.type === "text") {
    return {
      ...base,
      type: "text",
      maxLength: (r.max_length as number) ?? undefined,
      showCounter: (r.show_counter as boolean) ?? undefined,
      rubricId: (r.rubric_id as string) ?? undefined,
    };
  }
  return { ...base, type: "photo" };
}

// Domain -> insert/update row shapes.
function questionToRow(testId: string, id: string, q: Omit<Question, "id" | "order">, order: number): Row {
  const v = q as QuestionInput;
  return {
    id,
    test_id: testId,
    type: v.type,
    prompt: v.prompt,
    marks: v.marks,
    topic: v.topic,
    options: v.type === "mcq" ? v.options : null,
    max_length: v.type === "text" ? v.maxLength ?? null : null,
    show_counter: v.type === "text" ? v.showCounter ?? null : null,
    rubric_id: v.type === "text" ? v.rubricId ?? null : null,
    sort_order: order,
  };
}

function testPatchToRow(patch: Partial<Omit<Test, "id" | "createdAt" | "questions">>): Row {
  const row: Row = {};
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.subject !== undefined) row.subject = patch.subject;
  if (patch.durationMinutes !== undefined) row.duration_minutes = patch.durationMinutes;
  if (patch.cohortId !== undefined) row.cohort_id = patch.cohortId;
  if (patch.classId !== undefined) row.class_id = patch.classId;
  if (patch.subjectId !== undefined) row.subject_id = patch.subjectId;
  if (patch.opensAt !== undefined) row.opens_at = patch.opensAt;
  if (patch.closesAt !== undefined) row.closes_at = patch.closesAt;
  if (patch.releaseAt !== undefined) row.release_at = patch.releaseAt;
  if (patch.testCode !== undefined) row.test_code = patch.testCode;
  if (patch.status !== undefined) row.status = patch.status;
  return row;
}

// ---------------------------------------------------------------------------
class Store {
  private state: Database = EMPTY;
  private listeners = new Set<() => void>();
  ready = false;
  private report: (msg: string) => void = (m) => console.error("[store]", m);
  /**
   * In-flight create-persists, keyed by the new row's id. Lets a child write
   * (e.g. a question against a just-created test) await its parent's INSERT
   * before firing, closing the optimistic parent-then-child FK race.
   */
  private pendingCreate = new Map<string, Promise<unknown>>();

  setErrorReporter(fn: (msg: string) => void) {
    this.report = fn;
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getSnapshot = () => this.state;
  getReady = () => this.ready;

  private notify() {
    this.listeners.forEach((l) => l());
  }
  private commit(mutator: (draft: Database) => void) {
    const next: Database = structuredClone(this.state);
    mutator(next);
    this.state = next;
    this.notify();
  }
  /** Fire-and-forget a Supabase write; surface failures through the reporter. */
  private run(p: PromiseLike<{ error: { message: string } | null }>, label: string) {
    Promise.resolve(p)
      .then(({ error }) => {
        if (error) this.report(`${label}: ${error.message}`);
      })
      .catch((e) => this.report(`${label}: ${String(e)}`));
  }

  /**
   * Like run(), but records the persist so child writes can await this row's
   * INSERT (keyed by the new id). Surfaces failures like run(); the entry is
   * removed once the write settles (success OR failure — a failed parent means
   * the child insert then fails and surfaces its own error, never silently).
   *
   * On failure it also invokes the caller-supplied `rollback` so the optimistic
   * cache entry committed before this call is removed — otherwise the UI keeps
   * showing a row that was never persisted. Each caller passes the removal that
   * matches its entity (e.g. filtering the new id out of its collection).
   */
  private runCreate(
    key: string,
    p: PromiseLike<{ error: { message: string } | null }>,
    label: string,
    rollback?: () => void,
  ) {
    const promise = Promise.resolve(p)
      .then(({ error }) => {
        if (error) {
          this.report(`${label}: ${error.message}`);
          rollback?.();
        }
      })
      .catch((e) => {
        this.report(`${label}: ${String(e)}`);
        rollback?.();
      })
      .finally(() => {
        if (this.pendingCreate.get(key) === promise) this.pendingCreate.delete(key);
      });
    this.pendingCreate.set(key, promise);
  }

  /** Await a parent's in-flight create (no-op if it already settled / was never tracked). */
  private async awaitCreate(key: string): Promise<void> {
    const p = this.pendingCreate.get(key);
    if (p) await p;
  }

  // ---- Lifecycle -------------------------------------------------------
  /** Hydrate the cache from Supabase (scoped by RLS for the current session). */
  async load() {
    const sb = supabase();
    const [coh, stu, tst, sub, ann, bnk, keys, cls, subj, cCls, cSubj, sCls, sSubj, nts, nAssigns, flg, rub, aiSug, lks, fmsg, viol] = await Promise.all([
      sb.from("cohorts").select("*").order("created_at"),
      sb.from("students").select("*").order("created_at"),
      sb.from("tests").select("*, questions(*)").order("created_at"),
      sb.from("submissions").select("*, answers(*)"),
      sb.from("announcements").select("*").order("created_at", { ascending: false }),
      sb.from("question_bank").select("*").order("created_at"),
      sb.from("question_keys").select("*"), // admin-only: empty for students
      sb.from("classes").select("*").order("name"),
      sb.from("subjects").select("*").order("name"),
      sb.from("cohort_classes").select("*"),
      sb.from("cohort_subjects").select("*"),
      sb.from("student_classes").select("*"),
      sb.from("student_subjects").select("*"),
      sb.from("notes").select("*").order("created_at", { ascending: false }),
      sb.from("note_assignments").select("*"),
      sb.from("question_flags").select("*").order("created_at", { ascending: false }),
      sb.from("rubrics").select("*").order("created_at"),
      sb.from("answer_ai_suggestions").select("*"), // admin-only: empty for students
      sb.from("exam_locks").select("*").order("locked_at", { ascending: false }),
      sb.from("flag_messages").select("*").order("created_at"),
      sb.from("exam_violations").select("*").order("created_at"),
    ]);

    const firstError = [coh, stu, tst, sub, ann, bnk].find((r) => r.error)?.error;
    if (firstError) this.report(`load: ${firstError.message}`);

    // AI suggestions live in an admin-only table (empty for students); attach
    // them to their answers by answer id.
    const aiByAnswer = new Map<string, AiSuggestion>();
    for (const r of (aiSug.data as Row[]) ?? []) aiByAnswer.set(r.answer_id as string, mapAiSuggestion(r));

    // Correct-option lookup: admin gets it from question_keys; a student gets it
    // only from their own released answers (RLS withholds it otherwise).
    const correctByQ = new Map<string, number>();
    for (const k of (keys.data as Row[]) ?? []) correctByQ.set(k.question_id as string, k.correct_index as number);
    for (const s of (sub.data as Row[]) ?? []) {
      if (s.status !== "released") continue;
      for (const a of (s.answers as Row[]) ?? []) {
        if (a.type === "mcq" && a.correct_index != null) correctByQ.set(a.question_id as string, a.correct_index as number);
      }
    }

    const tests: Test[] = ((tst.data as Row[]) ?? []).map((t) => ({
      id: t.id as string,
      title: t.title as string,
      subject: t.subject as string,
      durationMinutes: t.duration_minutes as number,
      cohortId: (t.cohort_id as string) ?? null,
      classId: (t.class_id as string) ?? null,
      subjectId: (t.subject_id as string) ?? null,
      opensAt: t.opens_at as string,
      closesAt: t.closes_at as string,
      releaseAt: (t.release_at as string) ?? null,
      testCode: t.test_code as string,
      status: t.status as TestStatus,
      createdAt: t.created_at as string,
      questions: ((t.questions as Row[]) ?? [])
        .map((q) => mapQuestion(q, correctByQ.get(q.id as string)))
        .sort((a, b) => a.order - b.order),
    }));

    // Build class/subject id maps for cohorts and students.
    const cohortClassMap = new Map<string, string[]>();
    const cohortSubjectMap = new Map<string, string[]>();
    for (const r of (cCls.data as Row[]) ?? []) {
      const cid = r.cohort_id as string;
      if (!cohortClassMap.has(cid)) cohortClassMap.set(cid, []);
      cohortClassMap.get(cid)!.push(r.class_id as string);
    }
    for (const r of (cSubj.data as Row[]) ?? []) {
      const cid = r.cohort_id as string;
      if (!cohortSubjectMap.has(cid)) cohortSubjectMap.set(cid, []);
      cohortSubjectMap.get(cid)!.push(r.subject_id as string);
    }

    const studentClassMap = new Map<string, string[]>();
    const studentSubjectMap = new Map<string, string[]>();
    for (const r of (sCls.data as Row[]) ?? []) {
      const sid = r.student_id as string;
      if (!studentClassMap.has(sid)) studentClassMap.set(sid, []);
      studentClassMap.get(sid)!.push(r.class_id as string);
    }
    for (const r of (sSubj.data as Row[]) ?? []) {
      const sid = r.student_id as string;
      if (!studentSubjectMap.has(sid)) studentSubjectMap.set(sid, []);
      studentSubjectMap.get(sid)!.push(r.subject_id as string);
    }

    this.state = {
      cohorts: ((coh.data as Row[]) ?? []).map((r) =>
        mapCohort(r, cohortClassMap.get(r.id as string) ?? [], cohortSubjectMap.get(r.id as string) ?? [])
      ),
      students: ((stu.data as Row[]) ?? []).map((r) =>
        mapStudent(r, studentClassMap.get(r.id as string) ?? [], studentSubjectMap.get(r.id as string) ?? [])
      ),
      tests,
      submissions: ((sub.data as Row[]) ?? []).map((r) => mapSubmission(r, aiByAnswer)),
      announcements: ((ann.data as Row[]) ?? []).map(mapAnnouncement),
      bank: ((bnk.data as Row[]) ?? []).map(mapBank),
      classes: ((cls.data as Row[]) ?? []).map(mapClass),
      subjects: ((subj.data as Row[]) ?? []).map(mapSubject),
      notes: ((nts.data as Row[]) ?? []).map(mapNote),
      noteAssignments: ((nAssigns.data as Row[]) ?? []).map(mapNoteAssignment),
      questionFlags: ((flg.data as Row[]) ?? []).map(mapQuestionFlag),
      rubrics: ((rub.data as Row[]) ?? []).map(mapRubric),
      examLocks: ((lks.data as Row[]) ?? []).map(mapExamLock),
      flagMessages: ((fmsg.data as Row[]) ?? []).map(mapFlagMessage),
      examViolations: ((viol.data as Row[]) ?? []).map(mapExamViolation),
    };
    this.ready = true;
    this.notify();
  }

  reset() {
    this.state = EMPTY;
    this.ready = false;
    this.notify();
  }

  // ---- Cohorts ---------------------------------------------------------
  addCohort(name: string, color: CohortColor) {
    const id = genId();
    const createdAt = new Date().toISOString();
    this.commit((d) => d.cohorts.push({ id, name, color, classIds: [], subjectIds: [], createdAt }));
    // Tracked: setCohortClasses/Subjects fire right after and insert junction
    // rows referencing this cohort — they await this INSERT first.
    this.runCreate(
      id,
      supabase().from("cohorts").insert({ id, name, color, created_at: createdAt }),
      "addCohort",
      () => this.commit((d) => { d.cohorts = d.cohorts.filter((c) => c.id !== id); }),
    );
    return id;
  }
  updateCohort(id: string, patch: Partial<Pick<Cohort, "name" | "color">>) {
    this.commit((d) => {
      const c = d.cohorts.find((x) => x.id === id);
      if (c) Object.assign(c, patch);
    });
    this.run(supabase().from("cohorts").update(patch).eq("id", id), "updateCohort");
  }
  deleteCohort(id: string, reassignToId: string) {
    this.commit((d) => {
      d.students.forEach((s) => { if (s.cohortId === id) s.cohortId = reassignToId; });
      d.tests.forEach((t) => { if (t.cohortId === id) t.cohortId = reassignToId; });
      d.announcements.forEach((a) => { if (a.cohortId === id) a.cohortId = reassignToId; });
      d.cohorts = d.cohorts.filter((c) => c.id !== id);
    });
    const sb = supabase();
    this.run(sb.from("students").update({ cohort_id: reassignToId }).eq("cohort_id", id), "deleteCohort/students");
    this.run(sb.from("tests").update({ cohort_id: reassignToId }).eq("cohort_id", id), "deleteCohort/tests");
    this.run(sb.from("announcements").update({ cohort_id: reassignToId }).eq("cohort_id", id), "deleteCohort/announcements");
    // Delete only after reassignment so the FKs never dangle.
    Promise.resolve()
      .then(() => sb.from("cohorts").delete().eq("id", id))
      .then(({ error }) => { if (error) this.report(`deleteCohort: ${error.message}`); });
  }

  setCohortClasses(cohortId: string, classIds: string[]) {
    this.commit((d) => {
      const c = d.cohorts.find((x) => x.id === cohortId);
      if (c) c.classIds = classIds;
    });
    const sb = supabase();
    void (async () => {
      try {
        await this.awaitCreate(cohortId); // parent cohort may still be persisting
        await sb.from("cohort_classes").delete().eq("cohort_id", cohortId);
        if (classIds.length) {
          const { error } = await sb.from("cohort_classes").insert(classIds.map((cid) => ({ cohort_id: cohortId, class_id: cid })));
          if (error) this.report(`setCohortClasses: ${error.message}`);
        }
      } catch (e) {
        this.report(`setCohortClasses: ${String(e)}`);
      }
    })();
  }
  setCohortSubjects(cohortId: string, subjectIds: string[]) {
    this.commit((d) => {
      const c = d.cohorts.find((x) => x.id === cohortId);
      if (c) c.subjectIds = subjectIds;
    });
    const sb = supabase();
    void (async () => {
      try {
        await this.awaitCreate(cohortId); // parent cohort may still be persisting
        await sb.from("cohort_subjects").delete().eq("cohort_id", cohortId);
        if (subjectIds.length) {
          const { error } = await sb.from("cohort_subjects").insert(subjectIds.map((sid) => ({ cohort_id: cohortId, subject_id: sid })));
          if (error) this.report(`setCohortSubjects: ${error.message}`);
        }
      } catch (e) {
        this.report(`setCohortSubjects: ${String(e)}`);
      }
    })();
  }

  // ---- Classes & Subjects (global catalogue) ---------------------------
  addClass(name: string): string {
    const id = genId();
    const createdAt = new Date().toISOString();
    this.commit((d) => d.classes.push({ id, name, createdAt }));
    this.run(supabase().from("classes").insert({ id, name, created_at: createdAt }), "addClass");
    return id;
  }
  updateClass(id: string, name: string) {
    this.commit((d) => {
      const c = d.classes.find((x) => x.id === id);
      if (c) c.name = name;
    });
    this.run(supabase().from("classes").update({ name }).eq("id", id), "updateClass");
  }
  deleteClass(id: string) {
    this.commit((d) => {
      d.classes = d.classes.filter((c) => c.id !== id);
      d.cohorts.forEach((c) => { c.classIds = c.classIds.filter((ci) => ci !== id); });
      d.students.forEach((s) => { s.classIds = s.classIds.filter((ci) => ci !== id); });
      d.noteAssignments = d.noteAssignments.filter((na) => na.classId !== id);
    });
    this.run(supabase().from("classes").delete().eq("id", id), "deleteClass");
  }
  addSubject(name: string): string {
    const id = genId();
    const createdAt = new Date().toISOString();
    this.commit((d) => d.subjects.push({ id, name, createdAt }));
    this.run(supabase().from("subjects").insert({ id, name, created_at: createdAt }), "addSubject");
    return id;
  }
  updateSubject(id: string, name: string) {
    this.commit((d) => {
      const s = d.subjects.find((x) => x.id === id);
      if (s) s.name = name;
    });
    this.run(supabase().from("subjects").update({ name }).eq("id", id), "updateSubject");
  }
  deleteSubject(id: string) {
    this.commit((d) => {
      d.subjects = d.subjects.filter((s) => s.id !== id);
      d.cohorts.forEach((c) => { c.subjectIds = c.subjectIds.filter((si) => si !== id); });
      d.students.forEach((s) => { s.subjectIds = s.subjectIds.filter((si) => si !== id); });
      d.noteAssignments = d.noteAssignments.filter((na) => na.subjectId !== id);
    });
    this.run(supabase().from("subjects").delete().eq("id", id), "deleteSubject");
  }

  // ---- Student class/subject enrolment ---------------------------------
  setStudentClasses(studentId: string, classIds: string[]) {
    this.commit((d) => {
      const s = d.students.find((x) => x.id === studentId);
      if (s) s.classIds = classIds;
    });
    const sb = supabase();
    void (async () => {
      await sb.from("student_classes").delete().eq("student_id", studentId);
      if (classIds.length) {
        const { error } = await sb.from("student_classes").insert(classIds.map((cid) => ({ student_id: studentId, class_id: cid })));
        if (error) this.report(`setStudentClasses: ${error.message}`);
      }
    })();
  }
  setStudentSubjects(studentId: string, subjectIds: string[]) {
    this.commit((d) => {
      const s = d.students.find((x) => x.id === studentId);
      if (s) s.subjectIds = subjectIds;
    });
    const sb = supabase();
    void (async () => {
      await sb.from("student_subjects").delete().eq("student_id", studentId);
      if (subjectIds.length) {
        const { error } = await sb.from("student_subjects").insert(subjectIds.map((sid) => ({ student_id: studentId, subject_id: sid })));
        if (error) this.report(`setStudentSubjects: ${error.message}`);
      }
    })();
  }

  // ---- Students (privileged: via the admin-users edge function) --------
  usernameTaken(username: string, exceptId?: string): boolean {
    return this.state.students.some(
      (s) => s.username.toLowerCase() === username.trim().toLowerCase() && s.id !== exceptId,
    );
  }
  addStudent(input: Omit<Student, "id" | "createdAt">) {
    supabase()
      .functions.invoke("admin-users", {
        body: {
          action: "create",
          username: input.username,
          email: input.email,
          cohortId: input.cohortId,
          password: input.tempPassword,
        },
      })
      .then(({ data, error }) => {
        if (error || (data as Row)?.error) {
          this.report(`addStudent: ${error?.message ?? (data as Row)?.error}`);
          return;
        }
        const row = (data as Row).student as Row;
        const student = mapStudent(row, input.classIds, input.subjectIds);
        this.commit((d) => d.students.push(student));
        if (input.classIds.length) this.setStudentClasses(student.id, input.classIds);
        if (input.subjectIds.length) this.setStudentSubjects(student.id, input.subjectIds);
      });
  }
  /**
   * Bulk roster import (Feature 3). Provisions many students through the same
   * admin-only `admin-users` edge function as addStudent — never a direct
   * insert. Uploads are chunked so a large roster doesn't hit the function's
   * request/time limits and so the caller can render real progress; created
   * rows are merged into the cache as each chunk returns. Returns a per-username
   * result list for the import summary. Async by design — the UI awaits it.
   */
  async bulkAddStudents(
    inputs: { username: string; email?: string; cohortId: string; password: string }[],
    onProgress?: (done: number, total: number) => void,
  ): Promise<{ username: string; status: "created" | "failed"; reason?: string }[]> {
    const CHUNK = 25;
    const total = inputs.length;
    const out: { username: string; status: "created" | "failed"; reason?: string }[] = [];
    let done = 0;
    onProgress?.(0, total);

    for (let i = 0; i < inputs.length; i += CHUNK) {
      const chunk = inputs.slice(i, i + CHUNK);
      try {
        const { data, error } = await supabase().functions.invoke("admin-users", {
          body: {
            action: "bulk-create",
            students: chunk.map((s) => ({
              username: s.username,
              email: s.email,
              cohortId: s.cohortId,
              password: s.password,
            })),
          },
        });
        if (error || (data as Row)?.error) {
          // Whole-chunk failure (network / function error): fail each row in it.
          const reason = error?.message ?? String((data as Row)?.error);
          for (const s of chunk) out.push({ username: s.username, status: "failed", reason });
        } else {
          const results = ((data as Row).results as Row[]) ?? [];
          for (const r of results) {
            const status = r.status as "created" | "failed";
            out.push({ username: r.username as string, status, reason: (r.reason as string) ?? undefined });
            if (status === "created" && r.student) {
              const student = mapStudent(r.student as Row);
              this.commit((d) => {
                if (!d.students.some((x) => x.id === student.id)) d.students.push(student);
              });
            }
          }
        }
      } catch (e) {
        for (const s of chunk) out.push({ username: s.username, status: "failed", reason: String(e) });
      }
      done += chunk.length;
      onProgress?.(done, total);
    }
    return out;
  }
  updateStudent(id: string, patch: Partial<Omit<Student, "id" | "createdAt">>) {
    this.commit((d) => {
      const s = d.students.find((x) => x.id === id);
      if (s) Object.assign(s, {
        username: patch.username ?? s.username,
        email: patch.email,
        cohortId: patch.cohortId ?? s.cohortId,
        classIds: patch.classIds ?? s.classIds,
        subjectIds: patch.subjectIds ?? s.subjectIds,
      });
    });
    const s = this.state.students.find((x) => x.id === id);
    supabase()
      .functions.invoke("admin-users", {
        body: {
          action: "update",
          studentId: id,
          username: patch.username ?? s?.username,
          email: patch.email,
          cohortId: patch.cohortId ?? s?.cohortId,
          password: patch.tempPassword || undefined,
        },
      })
      .then(({ data, error }) => {
        if (error || (data as Row)?.error) this.report(`updateStudent: ${error?.message ?? (data as Row)?.error}`);
      });
    if (patch.classIds !== undefined) this.setStudentClasses(id, patch.classIds);
    if (patch.subjectIds !== undefined) this.setStudentSubjects(id, patch.subjectIds);
  }
  deleteStudent(id: string) {
    this.commit((d) => {
      d.students = d.students.filter((s) => s.id !== id);
      d.submissions = d.submissions.filter((s) => s.studentId !== id);
    });
    supabase()
      .functions.invoke("admin-users", { body: { action: "delete", studentId: id } })
      .then(({ data, error }) => {
        if (error || (data as Row)?.error) this.report(`deleteStudent: ${error?.message ?? (data as Row)?.error}`);
      });
  }

  // ---- Tests + questions ----------------------------------------------
  /**
   * Create a test. AWAITED (not fire-and-forget) on purpose: callers immediately
   * insert questions that carry test_id as a foreign key, so the test row has to
   * be committed first or the questions hit questions_test_id_fkey. A failed
   * insert rolls the optimistic row back, so a "phantom" test can never linger in
   * the cache pretending to exist in the database.
   */
  async addTest(
    input: Omit<Test, "id" | "createdAt" | "questions"> & { questions?: Question[] },
  ): Promise<string | null> {
    const id = genId();
    const createdAt = new Date().toISOString();
    this.commit((d) =>
      d.tests.push({ ...input, id, questions: input.questions ?? [], createdAt }),
    );
    this.runCreate(
      id,
      supabase().from("tests").insert({
        id,
        title: input.title,
        subject: input.subject,
        duration_minutes: input.durationMinutes,
        cohort_id: input.cohortId,
        class_id: input.classId,
        subject_id: input.subjectId,
        opens_at: input.opensAt,
        closes_at: input.closesAt,
        release_at: input.releaseAt ?? null,
        test_code: input.testCode,
        status: input.status,
        created_at: createdAt,
      }),
      "addTest",
      () => this.commit((d) => { d.tests = d.tests.filter((t) => t.id !== id); }),
    );
    return id;
  }
  updateTest(id: string, patch: Partial<Omit<Test, "id" | "createdAt" | "questions">>) {
    this.commit((d) => {
      const t = d.tests.find((x) => x.id === id);
      if (t) Object.assign(t, patch);
    });
    this.run(supabase().from("tests").update(testPatchToRow(patch)).eq("id", id), "updateTest");
  }
  setTestStatus(id: string, status: TestStatus) {
    this.updateTest(id, { status });
  }
  /**
   * Permanently delete a test. This is AWAITED and VERIFIED — the previous
   * fire-and-forget version was the bug: a Supabase delete that matches zero rows
   * (e.g. RLS refuses it) returns NO error, so we removed it locally, reported
   * success, and the row came straight back on the next load.
   *
   * `.select("id")` makes the delete return what it actually removed, so a 0-row
   * delete is caught and the optimistic removal is rolled back instead of lying.
   * The DB cascades questions/submissions/violations/locks; we mirror that in the
   * cache so nothing stale is left pointing at a test that no longer exists.
   */
  async deleteTest(id: string): Promise<boolean> {
    const snapshot = this.state; // for rollback

    this.commit((d) => {
      d.tests = d.tests.filter((t) => t.id !== id);
      d.submissions = d.submissions.filter((s) => s.testId !== id);
      // Mirror the DB's cascades / set-nulls so no cached row points at a ghost.
      d.examViolations = d.examViolations.filter((v) => v.testId !== id);
      d.examLocks = d.examLocks.filter((l) => l.testId !== id);
      d.questionFlags = d.questionFlags.map((f) => (f.testId === id ? { ...f, testId: null } : f));
    });

    const { data, error } = await supabase().from("tests").delete().eq("id", id).select("id");
    if (error) {
      this.state = snapshot;
      this.notify();
      this.report(`deleteTest: ${error.message}`);
      return false;
    }
    if (!data || data.length === 0) {
      // Nothing was removed — almost always RLS refusing the delete. Never pretend.
      this.state = snapshot;
      this.notify();
      this.report("deleteTest: the database refused to delete this test (no rows removed).");
      return false;
    }
    return true;
  }

  /**
   * Cache-only refresh of one test (drives realtime; never writes back). Drops it
   * from the cache when it's gone from the server — this is what stops a student
   * from holding a deleted test and then failing a foreign key on flag/violation.
   */
  async refreshTest(testId: string) {
    const { data, error } = await supabase()
      .from("tests").select("*, questions(*)").eq("id", testId).maybeSingle();
    if (error) {
      this.report(`refreshTest: ${error.message}`);
      return;
    }
    if (!data) {
      this.commit((d) => {
        d.tests = d.tests.filter((t) => t.id !== testId);
        d.submissions = d.submissions.filter((s) => s.testId !== testId);
        d.examViolations = d.examViolations.filter((v) => v.testId !== testId);
        d.examLocks = d.examLocks.filter((l) => l.testId !== testId);
      });
      return;
    }
    const r = data as Row;
    // Keep whatever answer keys this session is already entitled to see.
    const known = new Map<string, number>();
    for (const t of this.state.tests) {
      if (t.id !== testId) continue;
      for (const q of t.questions) {
        if (q.type === "mcq" && q.correctIndex >= 0) known.set(q.id, q.correctIndex);
      }
    }
    const test: Test = {
      id: r.id as string,
      title: r.title as string,
      subject: r.subject as string,
      durationMinutes: r.duration_minutes as number,
      cohortId: (r.cohort_id as string) ?? null,
      classId: (r.class_id as string) ?? null,
      subjectId: (r.subject_id as string) ?? null,
      opensAt: r.opens_at as string,
      closesAt: r.closes_at as string,
      releaseAt: (r.release_at as string) ?? null,
      testCode: r.test_code as string,
      status: r.status as TestStatus,
      createdAt: r.created_at as string,
      questions: ((r.questions as Row[]) ?? [])
        .map((q) => mapQuestion(q, known.get(q.id as string)))
        .sort((a, b) => a.order - b.order),
    };
    this.commit((d) => {
      const i = d.tests.findIndex((t) => t.id === testId);
      if (i >= 0) d.tests[i] = test;
      else d.tests.push(test);
    });
  }

  /**
   * Does this test still exist server-side? Used to validate the foreign key
   * BEFORE inserting a flag or a violation, so we never fire an insert we know
   * will fail — and so a stale cached test is evicted the moment we notice.
   */
  private async assertTestExists(testId: string): Promise<boolean> {
    const { data, error } = await supabase()
      .from("tests").select("id").eq("id", testId).maybeSingle();
    if (error) {
      this.report(`Couldn't verify the test: ${error.message}`);
      return false;
    }
    if (!data) {
      // It's gone. Evict it so the UI stops offering a test that no longer exists.
      await this.refreshTest(testId);
      return false;
    }
    return true;
  }

  /** Does this question still exist server-side? (question_id is nullable.) */
  private async questionExists(questionId: string): Promise<boolean> {
    const { data, error } = await supabase()
      .from("questions").select("id").eq("id", questionId).maybeSingle();
    if (error) return false;
    return !!data;
  }
  addQuestion(testId: string, q: Omit<Question, "id" | "order">) {
    const id = genId();
    let order = 0;
    this.commit((d) => {
      const t = d.tests.find((x) => x.id === testId);
      if (t) {
        order = t.questions.length;
        t.questions.push({ ...q, id, order } as Question);
      }
    });
    const sb = supabase();
    const v = q as QuestionInput;
    // The key has a FK to questions(id), so it MUST be inserted after the
    // question row commits — otherwise a concurrent insert can lose the key and
    // the MCQ grades as wrong. Sequence the two writes.
    void (async () => {
      try {
        // Wait for the parent test's INSERT if it was just created and is still
        // in flight — otherwise this question's FK to tests(id) can be rejected.
        await this.awaitCreate(testId);
        const { error: qErr } = await sb.from("questions").insert(questionToRow(testId, id, q, order));
        if (qErr) return this.report(`addQuestion: ${qErr.message}`);
        if (v.type === "mcq") {
          const { error: kErr } = await sb.from("question_keys").insert({ question_id: id, correct_index: v.correctIndex });
          if (kErr) this.report(`addQuestion/key: ${kErr.message}`);
        }
      } catch (e) {
        // A thrown error (e.g. network drop) would otherwise be an unhandled
        // rejection — surface it so the optimistic add doesn't look successful.
        this.report(`addQuestion: ${String(e)}`);
      }
    })();
  }
  updateQuestion(testId: string, questionId: string, q: Omit<Question, "id" | "order">) {
    let order = 0;
    this.commit((d) => {
      const t = d.tests.find((x) => x.id === testId);
      const idx = t?.questions.findIndex((x) => x.id === questionId) ?? -1;
      if (t && idx >= 0) {
        order = t.questions[idx].order;
        t.questions[idx] = { ...q, id: questionId, order } as Question;
      }
    });
    const sb = supabase();
    const v = q as QuestionInput;
    const { id: _id, test_id: _t, sort_order: _o, ...fields } = questionToRow(testId, questionId, q, order);
    void _id; void _t; void _o;
    void (async () => {
      try {
        const { error: qErr } = await sb.from("questions").update(fields).eq("id", questionId);
        if (qErr) return this.report(`updateQuestion: ${qErr.message}`);
        if (v.type === "mcq") {
          const { error: kErr } = await sb
            .from("question_keys")
            .upsert({ question_id: questionId, correct_index: v.correctIndex });
          if (kErr) this.report(`updateQuestion/key: ${kErr.message}`);
        } else {
          const { error: kErr } = await sb.from("question_keys").delete().eq("question_id", questionId);
          if (kErr) this.report(`updateQuestion/key-clear: ${kErr.message}`);
        }
      } catch (e) {
        this.report(`updateQuestion: ${String(e)}`);
      }
    })();
  }
  deleteQuestion(testId: string, questionId: string) {
    this.commit((d) => {
      const t = d.tests.find((x) => x.id === testId);
      if (t) t.questions = t.questions.filter((q) => q.id !== questionId).map((q, i) => ({ ...q, order: i }));
    });
    // question_keys row cascades on delete.
    this.run(supabase().from("questions").delete().eq("id", questionId), "deleteQuestion");
    this.persistReorder(testId);
  }
  reorderQuestions(testId: string, orderedIds: string[]) {
    this.commit((d) => {
      const t = d.tests.find((x) => x.id === testId);
      if (!t) return;
      // Reorder is order-ONLY and must never drop a question. Emit the ids we
      // were given in their new order, then append any question still in the
      // cache that wasn't in `orderedIds` — a stale/partial drag snapshot (e.g.
      // taken just before a concurrent add or bank import) must not be able to
      // overwrite the list with an incomplete version and wipe questions.
      const remaining = new Map(t.questions.map((q) => [q.id, q]));
      const ordered: Question[] = [];
      for (const qid of orderedIds) {
        const q = remaining.get(qid);
        if (q) { ordered.push(q); remaining.delete(qid); }
      }
      for (const q of t.questions) {
        if (remaining.has(q.id)) ordered.push(q); // leftovers keep their relative order
      }
      t.questions = ordered.map((q, i) => ({ ...q, order: i }));
    });
    this.persistReorder(testId);
  }
  private persistReorder(testId: string) {
    const t = this.state.tests.find((x) => x.id === testId);
    if (!t) return;
    const sb = supabase();
    t.questions.forEach((q) => {
      this.run(sb.from("questions").update({ sort_order: q.order }).eq("id", q.id), "reorderQuestions");
    });
  }
  importBankItems(testId: string, bankIds: string[]) {
    const sb = supabase();
    const pending: { id: string; rest: Omit<Question, "id" | "order">; order: number; correctIndex?: number }[] = [];
    this.commit((d) => {
      const t = d.tests.find((x) => x.id === testId);
      if (!t) return;
      bankIds.forEach((bid) => {
        const item = d.bank.find((b) => b.id === bid);
        if (!item) return;
        const id = genId();
        const order = t.questions.length;
        const { subject: _s, id: _i, ...rest } = item;
        void _s; void _i;
        t.questions.push({ ...rest, id, order } as Question);
        pending.push({
          id,
          rest: rest as Omit<Question, "id" | "order">,
          order,
          correctIndex: item.type === "mcq" ? item.correctIndex : undefined,
        });
      });
    });
    // Persist each question, then its key (FK ordering — see addQuestion).
    void (async () => {
      try {
        // Same parent-then-child guard as addQuestion: a test created moments
        // ago may not have committed yet.
        await this.awaitCreate(testId);
        for (const p of pending) {
          const { error: qErr } = await sb.from("questions").insert(questionToRow(testId, p.id, p.rest, p.order));
          if (qErr) { this.report(`importBank: ${qErr.message}`); continue; }
          if (p.correctIndex !== undefined) {
            const { error: kErr } = await sb.from("question_keys").insert({ question_id: p.id, correct_index: p.correctIndex });
            if (kErr) this.report(`importBank/key: ${kErr.message}`);
          }
        }
      } catch (e) {
        this.report(`importBank: ${String(e)}`);
      }
    })();
  }

  // ---- Submissions -----------------------------------------------------
  async submitTest(input: {
    testId: string;
    studentId: string;
    answers: Answer[];
    startedAt: string;
    autoSubmitted: boolean;
    durationSeconds: number;
  }): Promise<string> {
    const id = genId();
    const submittedAt = new Date().toISOString();
    // Optimistic: show the submission immediately (MCQ marks fill in server-side).
    this.commit((d) => {
      d.submissions = d.submissions.filter(
        (s) => !(s.testId === input.testId && s.studentId === input.studentId),
      );
      d.submissions.push({
        id,
        testId: input.testId,
        studentId: input.studentId,
        answers: input.answers,
        status: "submitted",
        startedAt: input.startedAt,
        submittedAt,
        autoSubmitted: input.autoSubmitted,
        durationSeconds: input.durationSeconds,
      });
    });

    const sb = supabase();
    const { error: subErr } = await sb.from("submissions").insert({
      id,
      test_id: input.testId,
      student_id: input.studentId,
      status: "submitted",
      started_at: input.startedAt,
      submitted_at: submittedAt,
      auto_submitted: input.autoSubmitted,
      duration_seconds: input.durationSeconds,
    });
    if (subErr) {
      this.report(`submitTest: ${subErr.message}`);
      return id;
    }
    const rows = input.answers.map((a) => ({
      submission_id: id,
      question_id: a.questionId,
      type: a.type,
      selected_index: a.selectedIndex ?? null,
      text: a.text ?? null,
      photo_url: a.photoDataUrl ?? null,
    }));
    if (rows.length) {
      const { error: ansErr } = await sb.from("answers").insert(rows);
      if (ansErr) this.report(`submitTest/answers: ${ansErr.message}`);
    }
    return id;
  }
  /**
   * Grade one answer. For rubric-graded written answers pass `rubricScores`:
   * the per-criterion points are the source of truth and their sum overrides
   * `marksAwarded`, so the committed total always equals the criterion sum.
   */
  gradeAnswer(
    submissionId: string,
    questionId: string,
    marksAwarded: number,
    feedback?: string,
    rubricScores?: RubricScore[],
  ) {
    const marks = rubricScores ? rubricScores.reduce((s, r) => s + r.points, 0) : marksAwarded;
    this.commit((d) => {
      const ans = d.submissions.find((s) => s.id === submissionId)?.answers.find((a) => a.questionId === questionId);
      if (ans) {
        ans.marksAwarded = marks;
        if (feedback !== undefined) ans.feedback = feedback;
        if (rubricScores !== undefined) ans.rubricScores = rubricScores;
      }
    });
    const patch: Row = { marks_awarded: marks };
    if (feedback !== undefined) patch.feedback = feedback;
    if (rubricScores !== undefined) patch.rubric_scores = rubricScores;
    this.run(
      supabase().from("answers").update(patch).eq("submission_id", submissionId).eq("question_id", questionId),
      "gradeAnswer",
    );
  }

  /**
   * Ask the grade-suggest edge function for an AI grading suggestion for one
   * answer. NOT an optimistic write: the suggestion is written into the cache
   * only once it resolves, and it never touches `rubricScores`/`marksAwarded`
   * (an admin must explicitly accept it). Returns the suggestion or null.
   */
  async requestAiSuggestion(answerId: string): Promise<AiSuggestion | null> {
    const { data, error } = await supabase().functions.invoke("grade-suggest", {
      body: { answerId },
    });
    if (error || (data as Row)?.error) {
      this.report(`requestAiSuggestion: ${error?.message ?? (data as Row)?.error}`);
      return null;
    }
    const suggestion = data as AiSuggestion;
    this.commit((d) => {
      for (const s of d.submissions) {
        const a = s.answers.find((x) => x.id === answerId);
        if (a) {
          a.aiSuggestion = suggestion;
          break;
        }
      }
    });
    return suggestion;
  }
  releaseSubmission(submissionId: string) {
    const releasedAt = new Date().toISOString();
    this.commit((d) => {
      const sub = d.submissions.find((s) => s.id === submissionId);
      if (sub) { sub.status = "released"; sub.releasedAt = releasedAt; }
    });
    this.run(
      supabase().from("submissions").update({ status: "released", released_at: releasedAt }).eq("id", submissionId),
      "releaseSubmission",
    );
  }
  bulkReleaseForTest(testId: string) {
    const releasedAt = new Date().toISOString();
    this.commit((d) => {
      d.submissions
        .filter((s) => s.testId === testId && s.status === "submitted")
        .forEach((s) => { s.status = "released"; s.releasedAt = releasedAt; });
    });
    this.run(
      supabase()
        .from("submissions")
        .update({ status: "released", released_at: releasedAt })
        .eq("test_id", testId)
        .eq("status", "submitted"),
      "bulkReleaseForTest",
    );
  }
  unreleaseSubmission(submissionId: string) {
    this.commit((d) => {
      const sub = d.submissions.find((s) => s.id === submissionId);
      if (sub) { sub.status = "submitted"; sub.releasedAt = undefined; }
    });
    this.run(
      supabase().from("submissions").update({ status: "submitted", released_at: null }).eq("id", submissionId),
      "unreleaseSubmission",
    );
  }
  deleteSubmission(submissionId: string) {
    this.commit((d) => { d.submissions = d.submissions.filter((s) => s.id !== submissionId); });
    this.run(supabase().from("submissions").delete().eq("id", submissionId), "deleteSubmission");
  }
  /**
   * Cache-only refresh of one submission from the server (drives realtime sync —
   * it NEVER writes back, so it can't loop with the change feed). Upserts the row
   * with its answers when present; removes it from the cache when it's gone. This
   * is how an auto/scheduled release flips a cached "Awaiting" to "Released"
   * without a manual refresh.
   */
  async refreshSubmission(submissionId: string) {
    const { data, error } = await supabase()
      .from("submissions")
      .select("*, answers(*)")
      .eq("id", submissionId)
      .maybeSingle();
    if (error) {
      this.report(`refreshSubmission: ${error.message}`);
      return;
    }
    if (!data) {
      this.commit((d) => { d.submissions = d.submissions.filter((s) => s.id !== submissionId); });
      return;
    }
    const sub = mapSubmission(data as Row);
    this.commit((d) => {
      const i = d.submissions.findIndex((s) => s.id === submissionId);
      if (i >= 0) {
        // AI suggestions live in a separate admin-only table not fetched here;
        // carry any already in the cache over to the refreshed answers.
        const aiById = new Map(
          d.submissions[i].answers.filter((a) => a.id && a.aiSuggestion).map((a) => [a.id!, a.aiSuggestion!]),
        );
        const merged = sub.answers.map((a) =>
          a.id && aiById.has(a.id) ? { ...a, aiSuggestion: aiById.get(a.id) } : a,
        );
        // Never downgrade known answers to an empty set: a student can't read
        // their own answers until results are released (RLS hides them), so a
        // refresh of a just-submitted row returns none — keep the optimistic ones.
        d.submissions[i] = {
          ...sub,
          answers: merged.length ? merged : d.submissions[i].answers,
        };
      } else {
        d.submissions.push(sub);
      }
    });
  }

  // ---- Announcements ---------------------------------------------------
  addAnnouncement(input: Omit<Announcement, "id" | "createdAt" | "dismissedBy">) {
    const id = genId();
    const createdAt = new Date().toISOString();
    this.commit((d) => d.announcements.unshift({ ...input, id, createdAt, dismissedBy: [] }));
    this.run(
      supabase().from("announcements").insert({
        id,
        body: input.body,
        pinned: input.pinned,
        cohort_id: input.cohortId,
        created_at: createdAt,
        dismissed_by: [],
      }),
      "addAnnouncement",
    );
  }
  updateAnnouncement(id: string, patch: Partial<Pick<Announcement, "body" | "pinned" | "cohortId">>) {
    this.commit((d) => {
      const a = d.announcements.find((x) => x.id === id);
      if (a) Object.assign(a, patch);
    });
    const row: Row = {};
    if (patch.body !== undefined) row.body = patch.body;
    if (patch.pinned !== undefined) row.pinned = patch.pinned;
    if (patch.cohortId !== undefined) row.cohort_id = patch.cohortId;
    this.run(supabase().from("announcements").update(row).eq("id", id), "updateAnnouncement");
  }
  deleteAnnouncement(id: string) {
    this.commit((d) => { d.announcements = d.announcements.filter((a) => a.id !== id); });
    this.run(supabase().from("announcements").delete().eq("id", id), "deleteAnnouncement");
  }
  dismissAnnouncement(id: string, studentId: string) {
    this.commit((d) => {
      const a = d.announcements.find((x) => x.id === id);
      if (a && !a.dismissedBy.includes(studentId)) a.dismissedBy.push(studentId);
    });
    // Students can't UPDATE announcements directly — go through the RPC.
    this.run(supabase().rpc("dismiss_announcement", { p_id: id }), "dismissAnnouncement");
  }

  // ---- Question flags --------------------------------------------------
  /**
   * Student files a flag against a question. Optimistic: the row lands in the
   * cache immediately (client-generated id) and is rolled back if the insert is
   * rejected — by RLS, by the 250-char/empty check, or by a dropped network.
   * Awaited by the modal so it can show a spinner and only close on success.
   */
  async addFlag(input: {
    submissionId?: string | null;
    questionId: string;
    questionPrompt?: string | null;
    testId?: string | null;
    studentId: string;
    reason: QuestionFlag["reason"];
    message: string;
  }): Promise<string | null> {
    const message = input.message.trim();
    // Mirror of the DB constraint — never the only line of defence.
    if (!message || message.length > FLAG_MESSAGE_MAX) {
      this.report("addFlag: message must be 1–250 characters.");
      return null;
    }

    // Validate the foreign keys BEFORE inserting. A stale cached test (deleted by
    // the admin since this session loaded) is the reason flags were dying on
    // question_flags_test_id_fkey — never fire an insert we know will fail.
    if (input.testId && !(await this.assertTestExists(input.testId))) {
      this.report("This test is no longer available, so it can't be flagged.");
      return null;
    }
    // The question may legitimately have been deleted: the column is nullable and
    // the prompt is snapshotted, so fall back to null rather than break the FK.
    const questionId = (await this.questionExists(input.questionId)) ? input.questionId : null;

    const id = genId();
    const flag: QuestionFlag = {
      id,
      submissionId: input.submissionId ?? null,
      questionId,
      testId: input.testId ?? null,
      questionPrompt: input.questionPrompt ?? null,
      studentId: input.studentId,
      reason: input.reason,
      message,
      status: "open",
      createdAt: new Date().toISOString(),
    };
    this.commit((d) => d.questionFlags.unshift(flag));

    const { error } = await supabase().from("question_flags").insert({
      id,
      submission_id: flag.submissionId,
      question_id: flag.questionId,
      test_id: flag.testId,
      question_prompt: flag.questionPrompt,
      student_id: flag.studentId,
      reason: flag.reason,
      message: flag.message,
      status: "open",
      created_at: flag.createdAt,
    });
    if (error) {
      this.commit((d) => { d.questionFlags = d.questionFlags.filter((f) => f.id !== id); });
      this.report(`addFlag: ${error.message}`);
      return null;
    }
    // The opening turn is seeded by a DB trigger — pull it so the thread renders
    // immediately (Realtime would also deliver it; this just removes the wait).
    await this.refreshFlagMessagesFor(id);
    return id;
  }

  /**
   * Admin appends a reply turn to the flag's conversation. Replies are now
   * messages in a thread rather than a single overwritten column, so the whole
   * back-and-forth is preserved and both sides see it live.
   */
  async replyToFlag(flagId: string, reply: string): Promise<boolean> {
    const flag = this.state.questionFlags.find((f) => f.id === flagId);
    if (!flag) {
      this.report("replyToFlag: unknown flag.");
      return false;
    }
    return this.appendFlagMessage(flagId, flag.studentId, "admin", reply);
  }

  /** Student appends a follow-up to their own thread (RLS forbids forging 'admin'). */
  async sendFlagMessage(flagId: string, studentId: string, body: string): Promise<boolean> {
    return this.appendFlagMessage(flagId, studentId, "student", body);
  }

  /** Optimistic append; rolled back if the insert is rejected (RLS / length / network). */
  private async appendFlagMessage(
    flagId: string,
    studentId: string,
    sender: FlagMessage["sender"],
    body: string,
  ): Promise<boolean> {
    const text = body.trim();
    if (!text || text.length > FLAG_MESSAGE_MAX) {
      this.report(`Message must be 1–${FLAG_MESSAGE_MAX} characters.`);
      return false;
    }
    const id = genId();
    const msg: FlagMessage = {
      id,
      flagId,
      studentId,
      sender,
      body: text,
      createdAt: new Date().toISOString(),
    };
    this.commit((d) => d.flagMessages.push(msg));

    const { error } = await supabase().from("flag_messages").insert({
      id,
      flag_id: flagId,
      student_id: studentId,
      sender,
      body: text,
      created_at: msg.createdAt,
    });
    if (error) {
      this.commit((d) => { d.flagMessages = d.flagMessages.filter((m) => m.id !== id); });
      this.report(`sendFlagMessage: ${error.message}`);
      return false;
    }
    return true;
  }

  /** Cache-only refresh of one message (drives realtime; never writes back). */
  async refreshFlagMessage(messageId: string) {
    const { data, error } = await supabase()
      .from("flag_messages").select("*").eq("id", messageId).maybeSingle();
    if (error) { this.report(`refreshFlagMessage: ${error.message}`); return; }
    if (!data) {
      this.commit((d) => { d.flagMessages = d.flagMessages.filter((m) => m.id !== messageId); });
      return;
    }
    this.upsertFlagMessage(mapFlagMessage(data as Row));
  }

  /** Pull a flag's whole thread — the opening turn is seeded server-side on insert. */
  async refreshFlagMessagesFor(flagId: string) {
    const { data, error } = await supabase()
      .from("flag_messages").select("*").eq("flag_id", flagId).order("created_at");
    if (error) { this.report(`refreshFlagMessagesFor: ${error.message}`); return; }
    for (const r of (data as Row[]) ?? []) this.upsertFlagMessage(mapFlagMessage(r));
  }

  private upsertFlagMessage(msg: FlagMessage) {
    this.commit((d) => {
      const i = d.flagMessages.findIndex((m) => m.id === msg.id);
      if (i >= 0) d.flagMessages[i] = msg;
      else d.flagMessages.push(msg);
    });
  }

  /**
   * Permanently clear violation history (admin only — RLS enforces it). Verified
   * like deleteTest: `.select("id")` proves what was actually removed, so a delete
   * the database refuses can never look like a success. Realtime propagates the
   * removal to every other open client.
   *
   * Note this clears the AUDIT LOG only; it never touches exam_locks, so clearing
   * history does not silently unlock a locked student.
   */
  async clearViolations(where: { id?: string; studentId?: string; testId?: string }): Promise<number> {
    const snapshot = this.state;
    const match = (v: ExamViolation) =>
      (where.id === undefined || v.id === where.id) &&
      (where.studentId === undefined || v.studentId === where.studentId) &&
      (where.testId === undefined || v.testId === where.testId);

    this.commit((d) => { d.examViolations = d.examViolations.filter((v) => !match(v)); });

    let q = supabase().from("exam_violations").delete();
    if (where.id) q = q.eq("id", where.id);
    if (where.studentId) q = q.eq("student_id", where.studentId);
    if (where.testId) q = q.eq("test_id", where.testId);

    const { data, error } = await q.select("id");
    if (error) {
      this.state = snapshot;
      this.notify();
      this.report(`clearViolations: ${error.message}`);
      return 0;
    }
    return data?.length ?? 0;
  }

  /** Cache-only refresh of one violation (drives the live security report). */
  async refreshViolation(violationId: string) {
    const { data, error } = await supabase()
      .from("exam_violations").select("*").eq("id", violationId).maybeSingle();
    if (error) { this.report(`refreshViolation: ${error.message}`); return; }
    if (!data) {
      this.commit((d) => { d.examViolations = d.examViolations.filter((v) => v.id !== violationId); });
      return;
    }
    const v = mapExamViolation(data as Row);
    this.commit((d) => {
      const i = d.examViolations.findIndex((x) => x.id === v.id);
      if (i >= 0) d.examViolations[i] = v;
      else d.examViolations.push(v);
    });
  }

  /** Admin closes the issue. The student keeps read access; they can't reopen. */
  async resolveFlag(flagId: string): Promise<boolean> {
    const before = this.state.questionFlags.find((f) => f.id === flagId)?.status;
    this.commit((d) => {
      const f = d.questionFlags.find((x) => x.id === flagId);
      if (f) f.status = "resolved";
    });
    const { error } = await supabase().from("question_flags").update({ status: "resolved" }).eq("id", flagId);
    if (error) {
      this.commit((d) => {
        const f = d.questionFlags.find((x) => x.id === flagId);
        if (f && before) f.status = before;
      });
      this.report(`resolveFlag: ${error.message}`);
      return false;
    }
    return true;
  }

  /**
   * Cache-only refresh of one flag from the server (drives realtime sync — it
   * NEVER writes back, so it can't loop with the change feed). Mirrors
   * refreshSubmission: upsert when present, drop from the cache when gone.
   */
  async refreshFlag(flagId: string) {
    const { data, error } = await supabase()
      .from("question_flags")
      .select("*")
      .eq("id", flagId)
      .maybeSingle();
    if (error) {
      this.report(`refreshFlag: ${error.message}`);
      return;
    }
    if (!data) {
      this.commit((d) => { d.questionFlags = d.questionFlags.filter((f) => f.id !== flagId); });
      return;
    }
    const flag = mapQuestionFlag(data as Row);
    this.commit((d) => {
      const i = d.questionFlags.findIndex((f) => f.id === flagId);
      if (i >= 0) d.questionFlags[i] = flag;
      else d.questionFlags.unshift(flag);
    });
  }

  // ---- Exam security ---------------------------------------------------
  /**
   * Record an integrity violation. The LOCK itself is decided server-side (a
   * trigger on exam_violations counts them and writes exam_locks), so the client
   * can neither fake nor dodge it. We await the insert, then refresh this
   * student's lock so the runner locks immediately even if the realtime event is
   * slow — Realtime still delivers it to any other open tab.
   */
  async recordViolation(input: {
    studentId: string;
    testId: string;
    type: ViolationType;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    // exam_violations.test_id is NOT NULL, so a stale cached test would blow up on
    // exam_violations_test_id_fkey. Validate first; assertTestExists also evicts the
    // dead test, which bounces the runner out of an exam that no longer exists.
    if (!(await this.assertTestExists(input.testId))) {
      this.report("This test is no longer available.");
      return;
    }
    const { error } = await supabase().from("exam_violations").insert({
      student_id: input.studentId,
      test_id: input.testId,
      violation_type: input.type,
      metadata: input.metadata ?? {},
    });
    if (error) {
      this.report(`recordViolation: ${error.message}`);
      return;
    }
    await this.refreshExamLockFor(input.studentId, input.testId);
  }

  /** Admin-only (RLS enforces it): let the student back into the exam. */
  async unlockExam(lockId: string): Promise<boolean> {
    const before = this.state.examLocks.find((l) => l.id === lockId)?.status;
    const unlockedAt = new Date().toISOString();
    this.commit((d) => {
      const l = d.examLocks.find((x) => x.id === lockId);
      if (l) { l.status = "active"; l.unlockedAt = unlockedAt; }
    });
    const { error } = await supabase()
      .from("exam_locks")
      .update({ status: "active", unlocked_at: unlockedAt })
      .eq("id", lockId);
    if (error) {
      this.commit((d) => {
        const l = d.examLocks.find((x) => x.id === lockId);
        if (l && before) { l.status = before; l.unlockedAt = null; }
      });
      this.report(`unlockExam: ${error.message}`);
      return false;
    }
    return true;
  }

  /** Cache-only refresh of one lock by id (drives realtime sync; never writes back). */
  async refreshExamLock(lockId: string) {
    const { data, error } = await supabase()
      .from("exam_locks")
      .select("*")
      .eq("id", lockId)
      .maybeSingle();
    if (error) {
      this.report(`refreshExamLock: ${error.message}`);
      return;
    }
    if (!data) {
      this.commit((d) => { d.examLocks = d.examLocks.filter((l) => l.id !== lockId); });
      return;
    }
    this.upsertExamLock(mapExamLock(data as Row));
  }

  /** Cache-only refresh of the lock for one student+test (used right after a violation). */
  async refreshExamLockFor(studentId: string, testId: string) {
    const { data, error } = await supabase()
      .from("exam_locks")
      .select("*")
      .eq("student_id", studentId)
      .eq("test_id", testId)
      .maybeSingle();
    if (error) {
      this.report(`refreshExamLockFor: ${error.message}`);
      return;
    }
    if (data) this.upsertExamLock(mapExamLock(data as Row));
  }

  private upsertExamLock(lock: ExamLock) {
    this.commit((d) => {
      const i = d.examLocks.findIndex((l) => l.id === lock.id);
      if (i >= 0) d.examLocks[i] = lock;
      else d.examLocks.unshift(lock);
    });
  }

  // ---- Question bank ---------------------------------------------------
  addBankItem(item: Omit<QuestionBankItem, "id">) {
    const id = genId();
    this.commit((d) => d.bank.push({ ...item, id } as QuestionBankItem));
    this.run(supabase().from("question_bank").insert(bankToRow(id, item)), "addBankItem");
  }
  updateBankItem(id: string, item: Omit<QuestionBankItem, "id">) {
    this.commit((d) => {
      const idx = d.bank.findIndex((b) => b.id === id);
      if (idx >= 0) d.bank[idx] = { ...item, id } as QuestionBankItem;
    });
    const { id: _id, ...fields } = bankToRow(id, item);
    void _id;
    this.run(supabase().from("question_bank").update(fields).eq("id", id), "updateBankItem");
  }
  deleteBankItem(id: string) {
    this.commit((d) => { d.bank = d.bank.filter((b) => b.id !== id); });
    this.run(supabase().from("question_bank").delete().eq("id", id), "deleteBankItem");
  }

  // ---- Account ---------------------------------------------------------
  /**
   * Set the current (already-authenticated) student's password and clear the
   * force-change flag. The student is signed in with their temp password, so
   * this is a normal authenticated password update — not a reset flow. Returns
   * true on success; failures surface through the error reporter. The caller
   * flips the session flag via auth's clearMustChangePassword() on success.
   */
  async changePassword(newPassword: string): Promise<boolean> {
    const sb = supabase();
    const { error: pErr } = await sb.auth.updateUser({ password: newPassword });
    if (pErr) {
      this.report(`changePassword: ${pErr.message}`);
      return false;
    }
    // Clears must_change_password on the student's own row (RLS: RPC only).
    const { error: fErr } = await sb.rpc("clear_must_change_password");
    if (fErr) {
      this.report(`changePassword/flag: ${fErr.message}`);
      return false;
    }
    return true;
  }

  // ---- Rubrics ---------------------------------------------------------
  addRubric(name: string, criteria: RubricCriterion[]): string {
    const id = genId();
    const createdAt = new Date().toISOString();
    this.commit((d) => d.rubrics.push({ id, name, criteria, createdAt }));
    this.run(supabase().from("rubrics").insert({ id, name, criteria, created_at: createdAt }), "addRubric");
    return id;
  }
  updateRubric(id: string, patch: Partial<Pick<Rubric, "name" | "criteria">>) {
    this.commit((d) => {
      const r = d.rubrics.find((x) => x.id === id);
      if (r) Object.assign(r, patch);
    });
    const row: Row = {};
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.criteria !== undefined) row.criteria = patch.criteria;
    this.run(supabase().from("rubrics").update(row).eq("id", id), "updateRubric");
  }
  deleteRubric(id: string) {
    this.commit((d) => {
      d.rubrics = d.rubrics.filter((r) => r.id !== id);
      // Detach from any question that referenced it (FK is ON DELETE SET NULL).
      d.tests.forEach((t) =>
        t.questions.forEach((q) => {
          if (q.type === "text" && q.rubricId === id) q.rubricId = undefined;
        }),
      );
    });
    this.run(supabase().from("rubrics").delete().eq("id", id), "deleteRubric");
  }

  // ---- Notes -----------------------------------------------------------
  async addNote(title: string, fileUrl: string, fileType: string, fileName: string): Promise<string> {
    const id = genId();
    const createdAt = new Date().toISOString();
    this.commit((d) => d.notes.unshift({ id, title, fileUrl, fileType, fileName, createdAt }));
    const { error } = await supabase().from("notes").insert({
      id, title, file_url: fileUrl, file_type: fileType, file_name: fileName, created_at: createdAt,
    });
    if (error) this.report(`addNote: ${error.message}`);
    return id;
  }
  deleteNote(id: string) {
    this.commit((d) => {
      d.notes = d.notes.filter((n) => n.id !== id);
      d.noteAssignments = d.noteAssignments.filter((na) => na.noteId !== id);
    });
    this.run(supabase().from("notes").delete().eq("id", id), "deleteNote");
  }
  addNoteAssignment(noteId: string, cohortId: string, classId: string | null, subjectId: string | null) {
    const id = genId();
    const createdAt = new Date().toISOString();
    this.commit((d) => d.noteAssignments.push({ id, noteId, cohortId, classId, subjectId, createdAt }));
    this.run(
      supabase().from("note_assignments").insert({ id, note_id: noteId, cohort_id: cohortId, class_id: classId, subject_id: subjectId, created_at: createdAt }),
      "addNoteAssignment",
    );
  }
  deleteNoteAssignment(id: string) {
    this.commit((d) => { d.noteAssignments = d.noteAssignments.filter((na) => na.id !== id); });
    this.run(supabase().from("note_assignments").delete().eq("id", id), "deleteNoteAssignment");
  }
}

function bankToRow(id: string, item: Omit<QuestionBankItem, "id">): Row {
  const v = item as BankInput;
  return {
    id,
    subject: v.subject,
    type: v.type,
    prompt: v.prompt,
    marks: v.marks,
    topic: v.topic,
    options: v.type === "mcq" ? v.options : null,
    max_length: v.type === "text" ? v.maxLength ?? null : null,
    show_counter: v.type === "text" ? v.showCounter ?? null : null,
    rubric_id: v.type === "text" ? v.rubricId ?? null : null,
    correct_index: v.type === "mcq" ? v.correctIndex : null,
  };
}

// Module-level singleton (client only).
let storeSingleton: Store | null = null;
export function getStore(): Store {
  if (!storeSingleton) storeSingleton = new Store();
  return storeSingleton;
}

/** Reactive snapshot of the whole database. */
export function useDatabase(): Database {
  const store = getStore();
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

/** Whether the cache has finished its initial Supabase hydration. */
export function useDataReady(): boolean {
  const store = getStore();
  return useSyncExternalStore(store.subscribe, store.getReady, () => false);
}

/** The action surface (stable singleton). */
export function useStore(): Store {
  return getStore();
}
