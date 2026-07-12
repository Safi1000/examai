-- ============================================================================
-- Rubrics + AI Grading Assist for written answers.
--
-- A rubric criterion is a CONCEPT the student must demonstrate (not a model
-- answer). Human-committed per-criterion scores live on the answer (release-
-- gated by the existing ans_read policy). The AI suggestion is sensitive and
-- NEVER reaches a student client — it lives in a separate admin-only table,
-- mirroring how question_keys isolates answer keys.
-- ============================================================================

-- 1. Rubrics. Criteria stored as inline JSONB (matches questions.options). ----
create table public.rubrics (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  -- array of { id, label, description?, maxPoints }
  criteria   jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- 2. A written question may be graded against a reusable rubric. -------------
alter table public.questions
  add column rubric_id uuid references public.rubrics(id) on delete set null;

-- 3. Human-committed per-criterion breakdown on the answer. ------------------
--    array of { criterionId, points }. Sums into marks_awarded (client-side).
--    Read access inherits the release-gated ans_read policy on answers.
alter table public.answers
  add column rubric_scores jsonb;

-- 4. AI suggestions — admin-only, one row per answer (like question_keys). ----
create table public.answer_ai_suggestions (
  answer_id         uuid primary key references public.answers(id) on delete cascade,
  -- array of { criterionId, points, rationale }
  scores            jsonb not null default '[]'::jsonb,
  overall_rationale text not null default '',
  model             text not null,
  created_at        timestamptz not null default now()
);

create index on public.questions(rubric_id);

-- ---- RLS -------------------------------------------------------------------
alter table public.rubrics                enable row level security;
alter table public.answer_ai_suggestions  enable row level security;

-- RUBRICS: admin reads/writes everything. A student may read a rubric ONLY
-- when they have a RELEASED submission whose answer belongs to a question that
-- references that rubric. This keeps rubric internals (incl. criterion
-- descriptions) hidden before release and from other students' submissions.
create policy rubrics_read on public.rubrics for select to authenticated
  using (
    public.is_admin() or exists (
      select 1
      from public.questions q
      join public.answers a     on a.question_id = q.id
      join public.submissions s on s.id = a.submission_id
      where q.rubric_id = rubrics.id
        and s.student_id = public.current_student_id()
        and s.status = 'released'
    )
  );
create policy rubrics_write on public.rubrics for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- AI SUGGESTIONS: admin only. Students NEVER read these under any status.
create policy ai_suggest_admin on public.answer_ai_suggestions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Grants (RLS still gates every row).
grant select, insert, update, delete on public.rubrics               to authenticated;
grant select, insert, update, delete on public.answer_ai_suggestions to authenticated;
