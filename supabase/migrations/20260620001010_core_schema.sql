-- Examia core schema. Mirrors types/index.ts; answer keys live in a separate,
-- admin-only table so they never reach a student client. See store.ts seam.

create extension if not exists pgcrypto with schema extensions;

-- 1. Cohorts -----------------------------------------------------------------
create table public.cohorts (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  color       smallint not null check (color between 1 and 12),
  created_at  timestamptz not null default now()
);

-- 2. Students (linked to a Supabase Auth user) -------------------------------
create table public.students (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid unique references auth.users(id) on delete set null,
  username    text not null unique,
  email       text,
  cohort_id   uuid references public.cohorts(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- 4. Tests -------------------------------------------------------------------
create table public.tests (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  subject          text not null,
  duration_minutes int  not null check (duration_minutes >= 1),
  cohort_id        uuid references public.cohorts(id) on delete set null, -- null = all cohorts
  opens_at         timestamptz not null,
  closes_at        timestamptz not null,
  test_code        text not null unique,
  status           text not null default 'draft' check (status in ('draft','active','closed')),
  created_at       timestamptz not null default now()
);

-- 3. Questions (embedded in a test). Answer key is NOT here. -----------------
create table public.questions (
  id           uuid primary key default gen_random_uuid(),
  test_id      uuid not null references public.tests(id) on delete cascade,
  type         text not null check (type in ('mcq','text','photo')),
  prompt       text not null,
  marks        int  not null check (marks >= 0),
  topic        text not null,
  options      jsonb,            -- mcq only: array of 4 strings
  max_length   int,              -- text only
  show_counter boolean,          -- text only
  sort_order   int  not null default 0,
  created_at   timestamptz not null default now()
);

-- 3b. Answer keys — admin-only, consumed by the grading trigger. -------------
create table public.question_keys (
  question_id   uuid primary key references public.questions(id) on delete cascade,
  correct_index int not null
);

-- 5. Submissions -------------------------------------------------------------
create table public.submissions (
  id               uuid primary key default gen_random_uuid(),
  test_id          uuid not null references public.tests(id) on delete cascade,
  student_id       uuid not null references public.students(id) on delete cascade,
  status           text not null default 'submitted' check (status in ('in_progress','submitted','released')),
  started_at       timestamptz not null,
  submitted_at     timestamptz,
  auto_submitted   boolean default false,
  duration_seconds int,
  total_marks      int,          -- maintained by sum_submission_marks() trigger
  released_at      timestamptz,
  created_at       timestamptz not null default now(),
  unique (test_id, student_id)
);

-- 6. Answers -----------------------------------------------------------------
create table public.answers (
  id             uuid primary key default gen_random_uuid(),
  submission_id  uuid not null references public.submissions(id) on delete cascade,
  question_id    uuid not null references public.questions(id) on delete cascade,
  type           text not null check (type in ('mcq','text','photo')),
  selected_index int,            -- mcq
  text           text,           -- text answer
  photo_url      text,           -- photo answer (Cloudinary secure_url)
  marks_awarded  int,            -- null until graded (mcq auto-set by trigger)
  is_correct     boolean,        -- mcq only
  correct_index  int,            -- mcq key copied in by trigger; visible to student only once released
  feedback       text,
  created_at     timestamptz not null default now(),
  unique (submission_id, question_id)
);

-- 7. Announcements -----------------------------------------------------------
create table public.announcements (
  id            uuid primary key default gen_random_uuid(),
  body          text not null,
  pinned        boolean not null default false,
  cohort_id     uuid references public.cohorts(id) on delete cascade, -- null = all cohorts
  dismissed_by  uuid[] not null default '{}',
  created_at    timestamptz not null default now()
);

-- 8. Question bank (admin-only; carries its own key inline) ------------------
create table public.question_bank (
  id            uuid primary key default gen_random_uuid(),
  subject       text not null,
  type          text not null check (type in ('mcq','text','photo')),
  prompt        text not null,
  marks         int  not null check (marks >= 0),
  topic         text not null,
  options       jsonb,
  max_length    int,
  show_counter  boolean,
  correct_index int,
  created_at    timestamptz not null default now()
);

-- Indexes --------------------------------------------------------------------
create index on public.students(user_id);
create index on public.students(cohort_id);
create index on public.tests(cohort_id);
create index on public.questions(test_id);
create index on public.submissions(test_id);
create index on public.submissions(student_id);
create index on public.answers(submission_id);
