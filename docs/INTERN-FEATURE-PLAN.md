# Examia — Intern Feature Handoff

**Audience:** incoming interns picking up Examia (exam & cohort portal).
**Goal:** ship a set of new features without breaking the existing architecture.
**Read this whole doc before writing any code.** The "Ground rules" section is not optional — it's how the codebase stays consistent.

---

## 1. What Examia is (2-minute orientation)

A mobile-first exam & cohort-management portal. Two roles:

- **Student** — logs in (no self-signup), sees a cohort-filtered dashboard, takes timed tests (MCQ / written / photo), sees released results and a progress dashboard.
- **Admin** — hidden login, manages tests + questions, grades submissions, runs cohorts/roster/announcements, views analytics, exports data.

Stack: **Next.js (App Router) · React · TypeScript (strict) · Tailwind · Supabase (Postgres + Auth + RLS + Edge Functions) · Cloudinary (photo upload)**.

### The one thing you must internalize: the data seam

**Every read and write goes through `lib/data/store.ts`.** Nothing else talks to Supabase directly.

- The store keeps an **in-memory cache** hydrated from Supabase once per session (`store.load()`), scoped by Row-Level Security.
- Components read the cache **synchronously** via `useDatabase()` and call actions (`useStore()`) **without `await`**.
- Actions update the cache **optimistically** with a client-generated UUID (`genId()`), then persist to Supabase in the background. Failures surface through the error reporter.
- Pure logic (`lib/scoring.ts`, `lib/time.ts`, grading helpers) is **side-effect-free** — keep it that way; it's the testable core.

If you understand `store.ts`, `types/index.ts`, and the `supabase/migrations/` folder, you understand the app.

### Where things live

```
app/(student)/…        student routes (dashboard, test runner, results, progress)
app/(admin)/admin/…    admin routes (hidden login + console)
components/ui/          reusable primitives (Button, Modal, Table, Input, …)
components/charts/      hand-rolled SVG charts (NO chart library — match this)
components/student/     components/admin/   feature components
lib/data/store.ts       ← the data seam (all Supabase I/O)
lib/data/selectors.ts   derived reads (filtering, stats)
lib/scoring.ts, time.ts pure logic
types/index.ts          the domain model (8 core entities)
supabase/migrations/    SQL schema, triggers, RLS policies
supabase/functions/     privileged edge functions (service-role work)
app/globals.css         design tokens (CSS vars) — mirrored in lib/tokens.ts
```

---

## 2. Ground rules (read twice)

1. **This is NOT the Next.js you already know.** The repo vendors a pinned Next with breaking changes. **Before writing any routing / server / config code, read the relevant guide in `node_modules/next/dist/docs/`.** Heed deprecation notices. (This rule is in `AGENTS.md` at the repo root — it's real.)
2. **All data access goes through `lib/data/store.ts`.** Never call `supabase()` from a component. Add a new store action instead, following the existing pattern (optimistic `commit()` + background `run()`).
3. **Never ship answer keys to a student client.** MCQ correct answers live in the admin-only `question_keys` table and are graded by a Postgres **trigger**. A student's client sees `correctIndex: -1` until results are released. Any new "correct answer" data follows this exact pattern — server-side table, RLS-locked, revealed only on release.
4. **Design tokens only — no hard-coded hex.** Colors/spacing/type come from CSS custom properties in `app/globals.css`. If you need a component color, use an existing token. Swapping the token block should restyle the whole app.
5. **Match the existing style:** hand-rolled SVG for charts (no chart lib), `components/ui/` primitives for everything, strict TypeScript (no `any` leaks — the store uses typed `Row` mappers, follow them).
6. **Every schema change is a new migration file** in `supabase/migrations/` (timestamped), plus matching **RLS policies**. Never edit an old migration.
7. **Mobile-first.** Design for a phone screen, enhance up. Test at 375px wide.
8. **Branch per feature, open a PR.** Keep PRs small — one feature each. Run `npm run build` before pushing.

### Anatomy of a store action (copy this shape)

```ts
addThing(input: Omit<Thing, "id" | "createdAt">) {
  const id = genId();                       // client UUID → returns sync
  const createdAt = new Date().toISOString();
  this.commit((d) => d.things.push({ ...input, id, createdAt }));   // optimistic cache update
  this.run(                                 // background persist; errors → reporter
    supabase().from("things").insert({ id, /* snake_case cols */ created_at: createdAt }),
    "addThing",
  );
  return id;
}
```

Add the new entity to `types/index.ts`, to the `Database` shape in `lib/data/seed.ts`, to the `EMPTY` object and the `load()` hydration in `store.ts`, and write a row↔domain mapper (snake_case ↔ camelCase) like the existing `mapCohort` / `mapStudent`.

---

## 3. Features to build

Ordered roughly easiest → hardest. Each has: **why**, **data model**, **store work**, **UI**, **security**, **effort**, and **acceptance criteria**. Pick them up in order unless told otherwise — the early ones teach the patterns you'll need for the later ones.

Effort key: **S** = 1–2 days · **M** = 3–5 days · **L** = 1–2 weeks (for one intern).

---

### Feature 1 — PDF result report / certificate  · Effort: S

**Why:** `@react-pdf/renderer` is *already a dependency* and unused. A downloadable branded result report (and a completion certificate) is high-visibility value for almost no new infrastructure. Great first task to learn the codebase.

**Data model:** none. Reads existing `Submission` + `Test`.

**Store work:** none. This is pure read + render.

**UI / implementation:**
- On the student **results page** (`app/(student)/results/[id]/page.tsx`), add a "Download report" button, shown only when `submission.status === "released"`.
- Build a `components/pdf/ResultReport.tsx` using `@react-pdf/renderer` `Document`/`Page`/`View`/`Text`. Include: student name, test title, per-question breakdown (prompt, their answer, marks awarded / max, feedback), total score + percent.
- Render with `pdf(<ResultReport … />).toBlob()` on click and trigger a download. Keep the PDF's colors pulled from `lib/tokens.ts` so it matches the "Almanac" identity.
- Optional stretch: a `Certificate.tsx` for students above a pass threshold.

**Security:** none new — only renders data the student can already see.

**Acceptance criteria:**
- Button appears only for released submissions.
- PDF opens with correct per-question data and totals matching the on-screen results.
- Colors/fonts match the app tokens; renders correctly on mobile Safari + Chrome.

---

### Feature 2 — Practice mode (ungraded self-assessment)  · Effort: M

**Why:** Big engagement lever, minimal new infra. Reuses the test runner and the existing question bank. Lets students self-test with instant feedback and no stakes.

**Data model:**
- No new score-bearing tables required for v1. Practice sessions can live client-side (localStorage) so nothing hits the graded pipeline.
- If you want persistence/analytics later, add a `practice_attempts` table — but **v1 should not**. Ship small.

**Store / logic:**
- Reuse `lib/scoring.ts` for instant scoring of MCQ (answer key is available for practice because you'll build practice **only from bank items the student is allowed to see** — see security note).
- Add a selector that pulls bank items by the student's `subjectIds` / `classIds`.

**UI:**
- New route `app/(student)/practice/page.tsx`: pick a subject/topic → generates a short quiz from the bank.
- Reuse `components/student/QuestionView.tsx` in an "instant feedback" mode: after answering an MCQ, immediately show right/wrong + explanation. No countdown, no submission record.

**Security (important):** practice **must not** leak keys for real graded questions. Safest v1: practice pulls from a **dedicated pool of practice questions** (add an `is_practice` flag or a separate `practice_bank`), whose keys RLS *does* allow students to read. Do **not** reuse the RLS rules of graded `question_keys`. Confirm the approach with the lead before writing the migration.

**Effort note:** the risk here is entirely in the security boundary, not the UI. Design that first.

**Acceptance criteria:**
- Student can start a practice quiz filtered to their subjects.
- Instant per-question feedback; no `Submission` row is created.
- Network inspection confirms no graded-question answer keys are ever sent to the client.

---

### Feature 3 — Bulk roster import (CSV)  · Effort: M

**Why:** The app already exports CSV/JSON (`lib/export.ts`); importing students in bulk is the missing other half and a real admin time-saver. Teaches you the **edge-function** path (student provisioning is privileged).

**Data model:** none new — creates `Student` rows.

**Store / backend:**
- Student creation is privileged: it goes through the **`admin-users` edge function** (`supabase/functions/admin-users`), not a direct insert (see `store.addStudent`). For bulk import, either (a) loop `addStudent` client-side, or (b) add a `"bulk-create"` action to the edge function that provisions many auth users in one call (preferred for large rosters — fewer round-trips, atomic-ish error reporting).
- Parse CSV client-side (no new dependency — write a small parser, or confirm before adding `papaparse`). Validate: unique usernames (`store.usernameTaken`), valid cohort, well-formed rows. Show a preview table with per-row validation before committing.

**UI:**
- On the roster page (`app/(admin)/admin/roster/page.tsx`), add "Import CSV": file picker → parsed preview with error highlighting → confirm → progress → summary (created / skipped / failed).

**Security:** all creation stays behind the admin-only edge function, which already verifies the caller is an admin. Never insert into `students`/auth from the client.

**Acceptance criteria:**
- Malformed / duplicate rows are flagged in the preview and skipped, not silently dropped.
- Successful rows create working student logins (they can log in with the temp password).
- Clear summary after import.

---

### Feature 4 — Student ↔ admin question flagging & messaging  · Effort: M

**Why:** Builds trust. During or after a test a student can flag a question ("typo", "ambiguous", "image won't load"); admin sees flags and can reply. Low schema cost, high perceived value.

**Data model:** new entity in `types/index.ts`:
```ts
export interface QuestionFlag {
  id: string;
  submissionId: string;   // or testId + studentId
  questionId: string;
  studentId: string;
  reason: "typo" | "ambiguous" | "technical" | "other";
  message: string;        // <= 250 chars, match announcement limit
  adminReply?: string;
  status: "open" | "resolved";
  createdAt: string;
}
```
New migration: `flags` table + RLS (student can INSERT/SELECT **their own**; admin can SELECT all + UPDATE the reply/status). Mirror the announcement RLS structure.

**Store work:** `addFlag`, `replyToFlag`, `resolveFlag` — standard optimistic pattern. Add `flags` to `Database`, `EMPTY`, `load()`, and a mapper.

**UI:**
- Student: a small "flag" affordance on `QuestionView` (in-test) and on the results breakdown (post-test).
- Admin: a "Flags" list (new route or a panel in submissions) with reply + resolve.

**Security:** RLS is the whole game here — a student must only ever read their own flags. Write the policies before the UI and test them with two different student sessions.

**Acceptance criteria:**
- Student A cannot see Student B's flags (verify via RLS, not just UI).
- Admin sees all flags, can reply, student sees the reply.
- 250-char limit enforced in the editor (reuse the announcement pattern).

---

### Feature 5 — Lightweight integrity signals in the test runner  · Effort: M

**Why:** It's an exam tool. Not full lockdown/proctoring (explicitly out of scope), just **honest signals** surfaced to the admin: tab-blur count, focus-loss, paste events, and optional fullscreen prompt.

**Data model:** extend `Submission` (new migration adds nullable columns; update the mapper):
```ts
integrity?: {
  blurCount: number;
  pasteCount: number;
  leftFullscreen: number;
};
```

**Store / logic:**
- A new hook `hooks/useIntegritySignals.ts` that listens to `visibilitychange`, `blur`, `paste`, and fullscreen-change while the runner is mounted, tallying counts in a ref.
- On submit, include the tally in the `submitTest` payload (extend the action + the `answers`/`submissions` insert).

**UI:**
- Student: subtle, honest notice at test start ("This test records tab switches"). No spyware vibes — transparency is the point.
- Admin: show the counts on the submission/grading view as small badges ("3 tab switches").

**Security / ethics:** these are *signals*, not proof, and must be presented as such to the admin. Do **not** block/auto-fail on them. No keystroke logging, no screen capture, no webcam — those are out of scope and out of bounds.

**Acceptance criteria:**
- Counts increment correctly (test by alt-tabbing / pasting).
- Counts persist on the submission and render on the admin view.
- Student is clearly informed before the test starts.

---

### Feature 6 — Scheduled auto-release of results + notifications  · Effort: M–L

**Why:** Today an admin releases results manually. Let them schedule a release time; optionally notify students ("results are out"). Teaches you server-side scheduling.

**Data model:** add `releaseAt?: string` to `Test` (nullable column + mapper). Optionally a `notifications` table.

**Backend:**
- Auto-release needs a **server-side scheduler**, because the client-side optimistic store can't fire when nobody's looking. Use a **Supabase scheduled function / `pg_cron`** job that flips `submitted → released` for tests whose `releaseAt` has passed. This is the key learning: some things *cannot* live in the client store.
- Notifications v1 = in-app only (a `notifications` table + a bell in the header). Email/push is a later stretch and needs a provider decision — don't add it without sign-off.

**UI:**
- Admin: a "Release at" datetime on the test scheduling form (next to `opensAt`/`closesAt`).
- Student: a notification bell showing unread items.

**Security:** the cron job runs with elevated privilege server-side; make sure it only touches releasable submissions. RLS still governs what the student reads.

**Acceptance criteria:**
- Setting a release time auto-releases at that time without an admin present (verify with a near-future time).
- Students see a notification when their results release.
- Manual release still works alongside scheduled release.

---

### Feature 7 — Rubric-based grading for written answers  · Effort: L

**Why:** Written grading today is a single score box. Rubrics (named criteria, each with points) make grading consistent, faster, and explainable. Foundation for Feature 8.

**Data model:**
- `Rubric` (reusable): `{ id, name, criteria: { id, label, maxPoints }[] }`.
- Per-answer rubric scores stored on the answer/grade (new columns or a `rubric_scores` table).
- New migration + RLS (admin-only write; student reads only the released breakdown).

**Store work:** rubric CRUD actions; extend `gradeAnswer` to accept per-criterion scores and sum them into `marksAwarded`.

**UI:**
- Admin: a rubric builder (reuse `components/ui/` primitives + Modal), attachable to a written question. Grading screen (`app/(admin)/admin/grading/[submissionId]/page.tsx`) shows the criteria with point inputs and a running total (there's already a running-total pattern there — extend it).
- Student results: show the per-criterion breakdown on release.

**Acceptance criteria:**
- A rubric can be created once and reused across questions.
- Per-criterion scores sum to the answer's `marksAwarded`.
- Released results show the criterion breakdown to the student.

---

### Feature 8 — AI grading assist for written answers  · Effort: L  (do LAST)

**Why:** The single biggest admin time-sink. A "suggest score + rationale" button that a human accepts or overrides. **Assist, never autonomous.** Build this last — it depends on the edge-function pattern (F3), the security discipline (F4/F5), and ideally rubrics (F7).

**Data model:** store the suggestion separately from the human grade so they're never confused: `Answer.aiSuggestion?: { score: number; rationale: string; model: string; at: string }`. The authoritative `marksAwarded` is still set by a human.

**Backend (critical):**
- Grading uses the **answer key / rubric, which must never reach the client**. So the AI call happens in a **Supabase edge function** (like `admin-users`) that: verifies the caller is admin, reads the key/rubric server-side, calls the model, returns only `{ score, rationale }`.
- **Use the latest Claude model** for grading. Before writing any Anthropic API code, **invoke the `claude-api` skill / read its reference** for the correct model id, request shape, and params — do not hand-write model ids from memory.
- Keep the prompt grounded: pass the question, the rubric/model answer, and the student's text; ask for a score within the max and a short rationale. Return structured JSON.

**UI:**
- Admin grading screen: a "Suggest grade" button per written answer → shows the AI's score + rationale in a clearly-labeled, dismissible panel. Admin clicks "Accept" (fills the score box) or ignores it. The suggestion is visually distinct from the committed grade.

**Security / policy:**
- The model call is **admin-triggered only**, server-side, key stays server-side.
- Never auto-commit an AI score. A human always confirms.
- Log which grades were AI-assisted (for transparency / later audit).

**Acceptance criteria:**
- Suggestion is generated server-side; the answer key is never present in any client network payload.
- Admin must explicitly accept; nothing is graded without a human action.
- Suggested vs. committed grade are visually distinct and separately stored.

---

## 4. Suggested sequencing for a 2–3 intern team

| Order | Feature | Why this slot |
|------|---------|---------------|
| 1 | **F1 PDF report** | Onboarding task — learn the read path, tokens, results page. |
| 2 | **F3 CSV import** | Learn the edge-function / privileged path. |
| 3 | **F4 Flagging** | Learn to add an entity end-to-end (types → migration → RLS → store → UI). |
| 4 | **F5 Integrity signals** | Learn hooks + extending an existing action. |
| 5 | **F2 Practice mode** | Now you can reason about the RLS/key boundary safely. |
| 6 | **F6 Scheduling** | Learn server-side (cron) work that can't live in the store. |
| 7 | **F7 Rubrics** → **F8 AI assist** | The two hardest, in dependency order. |

Do **F1–F4 before F8.** F8 assumes you're fluent in the edge-function + RLS patterns; it's the wrong place to learn them.

---

## 5. Definition of done (every feature)

- [ ] Types added to `types/index.ts`; `Database`/`EMPTY`/`load()`/mapper updated if a new entity.
- [ ] Schema change = a **new** timestamped migration + **RLS policies**, tested with a non-admin session.
- [ ] All data access goes through a **store action** (optimistic `commit` + background `run`). No `supabase()` in components.
- [ ] No hard-coded colors — **tokens only**. No new chart library — hand-rolled SVG.
- [ ] Works at **375px** wide; keyboard-accessible; text clears WCAG AA.
- [ ] **No answer key or rubric ever reaches a student client** (verify in the network tab).
- [ ] `npm run build` passes; feature branch + small PR; screenshots in the PR.
- [ ] Read the relevant `node_modules/next/dist/docs/` guide before any routing/server change.

---

## 6. Getting set up

```bash
npm install --legacy-peer-deps    # the vendored Next pin needs this flag
cp .env.example .env.local        # fill in Supabase + Cloudinary values (ask the lead)
npm run dev                       # http://localhost:3000
npm run build                     # must pass before every PR
```

Demo logins: student `amelia` / `study123`; admin via the invisible hotspot at the **bottom** of `/login` (or `/admin`), password `admin2026`.

**When in doubt, read `store.ts` and copy the nearest existing action. The patterns are already there — your job is to extend them, not invent new ones.**
