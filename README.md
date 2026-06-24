# Examia — Exam & Cohort Portal

A production-grade, **mobile-first** exam and cohort-management portal for
`{{COMPANY_NAME}}` (configured to **Meridian Academy**). Built with Next.js
App Router, React, TypeScript, and Tailwind CSS.

> Developed by **Techxserve**.

---

## The visual identity — "Almanac"

The product wears a wholly custom identity, derived through the design skill's
two-pass process. The idea: **exams live on paper**, so the interface is a warm,
tactile paper surface with deep botanical-ink color and a modern grotesque type
system — calm, human, and trustworthy.

- **Type** — Bricolage Grotesque (display) · Hanken Grotesk (body) · Spline Sans
  Mono (codes, timers, IDs, timestamps)
- **Color** — petrol-teal primary, moss success, ochre warning, madder-brick
  error, ink-blue info, over a warm-paper neutral ramp. Six distinct cohort dots
  (pine, indigo, coral, gold, olive, slate). **Zero purple/pink, no AI-cliché
  gradients.**
- **Light theme**, a deliberate choice for a daylight testing tool. All text
  clears **WCAG AA (4.5:1)**.
- **Signature** — an exam-booklet ruled margin, mono "test code" chips, and a
  prominent countdown that bands color (and pulses) as time drains.

Everything is expressed through **design tokens** (CSS custom properties +
Tailwind theme in `app/globals.css`, mirrored for JS in `lib/tokens.ts`). No
component hard-codes a hex value — **swap the token block and the whole app
restyles.**

## Demo credentials

| Role    | How to reach it                                                             | Credentials           |
| ------- | -------------------------------------------------------------------------- | --------------------- |
| Student | `/login`                                                                   | `amelia` / `study123` |
| Admin   | tap the invisible hotspot at the **bottom** of `/login`, or go to `/admin` | password `admin2026`  |

## Feature scope

**Student** — login with lockout (no self-signup); cohort-filtered dashboard with
pinned + dismissible announcements; timed test runner (MCQ / written / photo)
with a live countdown, draft autosave that survives refresh, and auto-submit on
time/close; submitted screen; released results with a full per-question
breakdown; a progress dashboard (SVG score trend + banded topic mastery).

**Admin** — hidden login with escalating brute-force lockout (5 → 30s, 60s, … cap
10 min) and a 30-minute idle timeout; tests CRUD + scheduling; in-test question
management with drag/▲▼ reorder and bank import; a reusable question bank
(search, multi-select import, bulk add); per-question grading with running
total, individual + bulk-release (all-MCQ) and re-grade; submissions list;
cohort management (with forced reassign on delete); student roster + per-student
analytics; announcements (≤250 chars, pin/unpin, dismissed-by counts); a
cohort-filterable analytics dashboard (grade distribution, per-test averages,
topic weakness, click-through leaderboard); and JSON/CSV data export.

## Architecture

```
app/(student)/…     student route group (dashboard, runner, results, progress)
app/(admin)/admin/… admin route group (hidden login + console)
components/ui/       dumb, reusable primitives (Button, Modal, Table, …)
components/charts/   hand-rolled SVG charts (no chart library)
components/student/  components/admin/   feature components
lib/                 tokens, pure logic (grading, scoring, time), config, export
lib/data/            the single data seam — typed seed + localStorage store
hooks/               useCountdown, useDraftAutosave, useSessionTimeout,
                     useLockout, useMediaQuery, useDismissibleAnnouncements
types/               the 8 domain entities
```

### One data seam, Supabase-backed

Every read/write goes through **`lib/data/store.ts`**. It keeps an in-memory
cache hydrated from Supabase per session (scoped by Row-Level Security) so
components stay synchronous — they call `useDatabase()` / store actions without
awaiting, while actions update the cache optimistically (client-generated UUIDs)
and persist in the background. Pure logic (`lib/grading.ts`, `lib/scoring.ts`,
`lib/time.ts`) stays side-effect-free and unit-testable.

Backend pieces:

- **Auth** — Supabase Auth (`lib/auth-context.tsx`). Students log in by username
  (mapped to a synthetic `username@students.examia.local` email); the admin signs
  into `NEXT_PUBLIC_ADMIN_EMAIL` and carries an `admin` role claim.
- **Schema / RLS / triggers** — `supabase/migrations/` (8 tables). MCQ grading
  runs in a Postgres trigger; answer keys live in an admin-only `question_keys`
  table and never reach a student client. RLS scopes tests/announcements by
  cohort and submissions/answers by ownership (answers only become readable once
  released).
- **Privileged user provisioning** — the `admin-users` edge function
  (`supabase/functions/`) creates/updates/deletes student auth users with the
  service role, after verifying the caller is an admin.
- **Photo upload** — Cloudinary unsigned upload (`lib/cloudinary.ts`); the
  returned `secure_url` is stored on the answer.

## Develop

```bash
npm install --legacy-peer-deps   # the vendored Next pin needs this flag
cp .env.example .env.local       # then fill in Supabase + Cloudinary values
npm run dev                      # http://localhost:3000
npm run build                    # production build
```

Required env (see `.env.example`): `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_CLOUDINARY_CLOUD`,
`NEXT_PUBLIC_CLOUDINARY_PRESET`, `NEXT_PUBLIC_ADMIN_EMAIL`.

## Out of scope

Per the brief: student self-signup, AI grading of written answers, plagiarism
detection, messaging, proctoring, print/offline. Server-side security mechanisms
exist only as typed seams + TODOs, never implemented client-side.
