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
  Note,
  NoteAssignment,
  Question,
  QuestionBankItem,
  QuestionCommon,
  QuestionVariant,
  Student,
  SubjectItem,
  Submission,
  Test,
  TestStatus,
} from "@/types";
import type { Database } from "@/lib/data/seed";
import { supabase } from "@/lib/supabase";

/**
 * Discriminated "create" shapes. `Omit<Question, …>` collapses the variant union
 * (TS keeps only common keys), so we rebuild the union explicitly to read
 * type-specific fields (options/correctIndex/maxLength).
 */
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
    };
  }
  return { ...base, type: "photo" };
}

const mapAnswer = (r: Row): Answer => ({
  questionId: r.question_id as string,
  type: r.type as Answer["type"],
  selectedIndex: (r.selected_index as number) ?? undefined,
  text: (r.text as string) ?? undefined,
  photoDataUrl: (r.photo_url as string) ?? undefined,
  marksAwarded: (r.marks_awarded as number) ?? undefined,
  feedback: (r.feedback as string) ?? undefined,
});

const mapSubmission = (r: Row): Submission => ({
  id: r.id as string,
  testId: r.test_id as string,
  studentId: r.student_id as string,
  status: r.status as Submission["status"],
  startedAt: r.started_at as string,
  submittedAt: (r.submitted_at as string) ?? undefined,
  autoSubmitted: (r.auto_submitted as boolean) ?? undefined,
  durationSeconds: (r.duration_seconds as number) ?? undefined,
  releasedAt: (r.released_at as string) ?? undefined,
  answers: ((r.answers as Row[]) ?? []).map(mapAnswer),
});

const mapAnnouncement = (r: Row): Announcement => ({
  id: r.id as string,
  body: r.body as string,
  pinned: r.pinned as boolean,
  cohortId: (r.cohort_id as string) ?? null,
  createdAt: r.created_at as string,
  dismissedBy: (r.dismissed_by as string[]) ?? [],
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

  // ---- Lifecycle -------------------------------------------------------
  /** Hydrate the cache from Supabase (scoped by RLS for the current session). */
  async load() {
    const sb = supabase();
    const [coh, stu, tst, sub, ann, bnk, keys, cls, subj, cCls, cSubj, sCls, sSubj, nts, nAssigns] = await Promise.all([
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
    ]);

    const firstError = [coh, stu, tst, sub, ann, bnk].find((r) => r.error)?.error;
    if (firstError) this.report(`load: ${firstError.message}`);

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
      submissions: ((sub.data as Row[]) ?? []).map(mapSubmission),
      announcements: ((ann.data as Row[]) ?? []).map(mapAnnouncement),
      bank: ((bnk.data as Row[]) ?? []).map(mapBank),
      classes: ((cls.data as Row[]) ?? []).map(mapClass),
      subjects: ((subj.data as Row[]) ?? []).map(mapSubject),
      notes: ((nts.data as Row[]) ?? []).map(mapNote),
      noteAssignments: ((nAssigns.data as Row[]) ?? []).map(mapNoteAssignment),
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
    this.run(supabase().from("cohorts").insert({ id, name, color, created_at: createdAt }), "addCohort");
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
      await sb.from("cohort_classes").delete().eq("cohort_id", cohortId);
      if (classIds.length) {
        const { error } = await sb.from("cohort_classes").insert(classIds.map((cid) => ({ cohort_id: cohortId, class_id: cid })));
        if (error) this.report(`setCohortClasses: ${error.message}`);
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
      await sb.from("cohort_subjects").delete().eq("cohort_id", cohortId);
      if (subjectIds.length) {
        const { error } = await sb.from("cohort_subjects").insert(subjectIds.map((sid) => ({ cohort_id: cohortId, subject_id: sid })));
        if (error) this.report(`setCohortSubjects: ${error.message}`);
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
  addTest(input: Omit<Test, "id" | "createdAt" | "questions"> & { questions?: Question[] }): string {
    const id = genId();
    const createdAt = new Date().toISOString();
    this.commit((d) =>
      d.tests.push({ ...input, id, questions: input.questions ?? [], createdAt }),
    );
    this.run(
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
  deleteTest(id: string) {
    this.commit((d) => {
      d.tests = d.tests.filter((t) => t.id !== id);
      d.submissions = d.submissions.filter((s) => s.testId !== id);
    });
    this.run(supabase().from("tests").delete().eq("id", id), "deleteTest");
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
      const { error: qErr } = await sb.from("questions").insert(questionToRow(testId, id, q, order));
      if (qErr) return this.report(`addQuestion: ${qErr.message}`);
      if (v.type === "mcq") {
        const { error: kErr } = await sb.from("question_keys").insert({ question_id: id, correct_index: v.correctIndex });
        if (kErr) this.report(`addQuestion/key: ${kErr.message}`);
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
      t.questions = orderedIds
        .map((qid, i) => {
          const q = t.questions.find((x) => x.id === qid);
          return q ? { ...q, order: i } : null;
        })
        .filter((q): q is Question => q !== null);
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
      for (const p of pending) {
        const { error: qErr } = await sb.from("questions").insert(questionToRow(testId, p.id, p.rest, p.order));
        if (qErr) { this.report(`importBank: ${qErr.message}`); continue; }
        if (p.correctIndex !== undefined) {
          const { error: kErr } = await sb.from("question_keys").insert({ question_id: p.id, correct_index: p.correctIndex });
          if (kErr) this.report(`importBank/key: ${kErr.message}`);
        }
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
  gradeAnswer(submissionId: string, questionId: string, marksAwarded: number, feedback?: string) {
    this.commit((d) => {
      const ans = d.submissions.find((s) => s.id === submissionId)?.answers.find((a) => a.questionId === questionId);
      if (ans) {
        ans.marksAwarded = marksAwarded;
        if (feedback !== undefined) ans.feedback = feedback;
      }
    });
    const patch: Row = { marks_awarded: marksAwarded };
    if (feedback !== undefined) patch.feedback = feedback;
    this.run(
      supabase().from("answers").update(patch).eq("submission_id", submissionId).eq("question_id", questionId),
      "gradeAnswer",
    );
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
        // Never downgrade known answers to an empty set: a student can't read
        // their own answers until results are released (RLS hides them), so a
        // refresh of a just-submitted row returns none — keep the optimistic ones.
        d.submissions[i] = {
          ...sub,
          answers: sub.answers.length ? sub.answers : d.submissions[i].answers,
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
