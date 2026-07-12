-- ============================================================================
-- Feature 4 — Student ↔ Admin question flagging & messaging.
--
-- A student raises a flag against a question (mid-test, before any submission
-- exists, or from the released result breakdown). An admin reads every flag,
-- replies once or many times, and resolves it.
--
-- Security shape (mirrors announcements / notifications):
--   * SELECT  — a student sees ONLY their own rows; an admin sees all.
--   * INSERT  — a student may only create a flag for themselves, always 'open',
--               never pre-filled with an admin_reply, and only against their own
--               submission when one is named.
--   * UPDATE  — admin only, and a BEFORE UPDATE guard pins every student-owned
--               column so an admin can change nothing but admin_reply/status.
--   * DELETE  — admin only.
-- Message length is enforced in the column type AND a check — never trusted from
-- the client (the 250-char counter in the UI is a courtesy, not a control).
--
-- Deleted questions: question_id/test_id/submission_id are ON DELETE SET NULL and
-- the prompt is snapshotted, so a flag against a since-deleted question still
-- renders safely for both sides.
-- ============================================================================

create table if not exists public.question_flags (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null references public.students(id)    on delete cascade,
  -- Null while the flag is raised mid-test (no submission row yet).
  submission_id   uuid references public.submissions(id) on delete set null,
  test_id         uuid references public.tests(id)       on delete set null,
  question_id     uuid references public.questions(id)   on delete set null,
  -- Snapshot of the prompt at flag time — survives question deletion.
  question_prompt text,
  reason          text not null check (reason in ('typo','ambiguous','technical','other')),
  message         varchar(250) not null check (length(btrim(message)) between 1 and 250),
  admin_reply     text check (admin_reply is null or length(btrim(admin_reply)) between 1 and 250),
  status          text not null default 'open' check (status in ('open','resolved')),
  created_at      timestamptz not null default now()
);

create index if not exists question_flags_student_idx  on public.question_flags (student_id, created_at desc);
create index if not exists question_flags_question_idx on public.question_flags (question_id);
create index if not exists question_flags_status_idx   on public.question_flags (status, created_at desc);

-- ---- RLS -------------------------------------------------------------------
alter table public.question_flags enable row level security;

-- Own flags only (student) / everything (admin). This is the single gate that
-- keeps one student's flags, messages and admin replies away from another.
drop policy if exists flags_read on public.question_flags;
create policy flags_read on public.question_flags for select to authenticated
  using (public.is_admin() or student_id = public.current_student_id());

-- A student can only file for themselves, only as 'open', never with a reply,
-- and only against a submission they own.
drop policy if exists flags_insert on public.question_flags;
create policy flags_insert on public.question_flags for insert to authenticated
  with check (
    student_id = public.current_student_id()
    and status = 'open'
    and admin_reply is null
    and (
      submission_id is null
      or exists (
        select 1 from public.submissions s
         where s.id = submission_id and s.student_id = public.current_student_id()
      )
    )
  );

-- Only an admin may reply / resolve. Students get no UPDATE path at all, so a
-- resolved (or open) flag is read-only to them.
drop policy if exists flags_update on public.question_flags;
create policy flags_update on public.question_flags for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists flags_delete on public.question_flags;
create policy flags_delete on public.question_flags for delete to authenticated
  using (public.is_admin());

-- ---- Column guard ----------------------------------------------------------
-- RLS can gate rows but not columns: an admin UPDATE could otherwise rewrite the
-- student's own words or re-point the flag at another question. Pin them.
create or replace function public.tg_question_flags_guard()
returns trigger language plpgsql security invoker set search_path = public, extensions as $$
begin
  new.id              := old.id;
  new.student_id      := old.student_id;
  new.submission_id   := old.submission_id;
  new.test_id         := old.test_id;
  new.question_id     := old.question_id;
  new.question_prompt := old.question_prompt;
  new.reason          := old.reason;
  new.message         := old.message;
  new.created_at      := old.created_at;
  return new;
end; $$;

drop trigger if exists question_flags_guard on public.question_flags;
create trigger question_flags_guard before update on public.question_flags
  for each row execute function public.tg_question_flags_guard();

-- ---- Notification fan-out --------------------------------------------------
-- New flag -> admin inbox. Reply / resolve -> that student's inbox only.
create or replace function public.tg_question_flags_notify()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  v_username text;
  v_cohort   uuid;
  v_test     text;
  v_url      text;
begin
  select s.username, s.cohort_id into v_username, v_cohort
    from public.students s where s.id = coalesce(new.student_id, old.student_id);
  select t.title into v_test from public.tests t where t.id = new.test_id;
  v_url := case when new.test_id is null then '/dashboard' else '/results/' || new.test_id::text end;

  if tg_op = 'INSERT' then
    perform public.notify_admins(
      'Question Flagged',
      format('%s flagged a question (%s)%s.',
             coalesce(v_username, 'A student'), new.reason,
             case when v_test is null then '' else format(' in "%s"', v_test) end),
      'question_flagged',
      '/admin/flags',
      v_cohort, null, new.test_id, null, new.submission_id,
      jsonb_build_object(
        'flagId', new.id, 'studentName', v_username,
        'reason', new.reason, 'message', new.message),
      null);
    return new;
  end if;

  if new.admin_reply is not null and new.admin_reply is distinct from old.admin_reply then
    insert into public.notifications (
      audience, recipient_student_id, cohort_id, title, message, type,
      action_url, related_test_id, related_submission_id, metadata)
    values (
      'student', new.student_id, v_cohort,
      'Reply to your flag',
      new.admin_reply,
      'flag_reply', v_url, new.test_id, new.submission_id,
      jsonb_build_object('flagId', new.id, 'reason', new.reason));
  end if;

  if new.status = 'resolved' and old.status is distinct from 'resolved' then
    insert into public.notifications (
      audience, recipient_student_id, cohort_id, title, message, type,
      action_url, related_test_id, related_submission_id, metadata, dedup_key)
    values (
      'student', new.student_id, v_cohort,
      'Flag resolved',
      format('Your flagged question%s has been resolved.',
             case when v_test is null then '' else format(' in "%s"', v_test) end),
      'flag_resolved', v_url, new.test_id, new.submission_id,
      jsonb_build_object('flagId', new.id, 'reason', new.reason),
      'flag_resolved:' || new.id::text)
    on conflict (dedup_key) where dedup_key is not null do nothing;
  end if;

  return new;
end; $$;

drop trigger if exists question_flags_notify_ins on public.question_flags;
drop trigger if exists question_flags_notify_upd on public.question_flags;
create trigger question_flags_notify_ins after insert on public.question_flags
  for each row execute function public.tg_question_flags_notify();
create trigger question_flags_notify_upd after update on public.question_flags
  for each row execute function public.tg_question_flags_notify();

-- Trigger functions are never callable as RPC (see harden_trigger_exposure).
revoke execute on function public.tg_question_flags_guard()  from public, anon, authenticated;
revoke execute on function public.tg_question_flags_notify() from public, anon, authenticated;

-- ---- Realtime --------------------------------------------------------------
-- FULL replica identity so UPDATE/DELETE events still carry every column for the
-- RLS check Realtime runs against the OLD row (same reasoning as notifications).
alter table public.question_flags replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'question_flags'
  ) then
    execute 'alter publication supabase_realtime add table public.question_flags';
  end if;
end $$;

-- ---- Grants (RLS still gates every row) ------------------------------------
grant select, insert, update, delete on public.question_flags to authenticated;
