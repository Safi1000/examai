-- ============================================================================
-- Exam Security & Locking.
--
-- A student's client reports integrity violations (tab switch, blur, fullscreen
-- exit, copy/paste/cut, right-click, blocked shortcut). Every violation is
-- appended to exam_violations. A DEFINER trigger counts them and, once the
-- threshold is reached, locks that (student, test) pair in exam_locks.
--
-- Security shape (mirrors question_flags / notifications):
--   * exam_violations — student INSERTs only for THEMSELVES; reads own rows,
--     admin reads all. No student UPDATE/DELETE.
--   * exam_locks      — NO client INSERT path at all (only the DEFINER trigger
--     writes it). SELECT: own rows / admin all. UPDATE (unlock): ADMIN ONLY.
--     So a student can never modify their own exam status.
--   * The lock is enforced in the BACKEND, not the UI: the submissions INSERT
--     policy refuses a locked student, so a tampered client still cannot submit.
--
-- Threshold is configurable via exam_lock_threshold() (defaults to 1 = lock on
-- the first violation). Change that one function to require more.
-- ============================================================================

-- ---- Configurable threshold ------------------------------------------------
create or replace function public.exam_lock_threshold()
returns integer language sql immutable set search_path = public, extensions as $$
  select 1;  -- lock on the FIRST violation; raise this to be more lenient
$$;

-- ---- Violations (append-only audit log) ------------------------------------
create table if not exists public.exam_violations (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references public.students(id) on delete cascade,
  test_id        uuid not null references public.tests(id)    on delete cascade,
  violation_type text not null check (violation_type in (
    'tab_switch','window_blur','fullscreen_exit','copy','paste','cut','right_click','blocked_shortcut'
  )),
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);
create index if not exists exam_violations_student_test_idx
  on public.exam_violations (student_id, test_id, created_at desc);
create index if not exists exam_violations_test_idx on public.exam_violations (test_id);

-- ---- Lock state (one row per student+test) ---------------------------------
create table if not exists public.exam_locks (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null references public.students(id) on delete cascade,
  test_id         uuid not null references public.tests(id)    on delete cascade,
  status          text not null default 'locked' check (status in ('locked','active')),
  reason          text,               -- the violation_type that tripped the lock
  violation_count integer not null default 0,
  locked_at       timestamptz,
  unlocked_at     timestamptz,
  unlocked_by     uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (student_id, test_id)
);
create index if not exists exam_locks_status_idx on public.exam_locks (status, locked_at desc);
create index if not exists exam_locks_student_idx on public.exam_locks (student_id);

-- ---- Is the CURRENT student locked out of this test? ------------------------
-- This is the real enforcement point (the submissions INSERT policy calls it), so
-- it must FAIL CLOSED. DEFINER means it always sees exam_locks regardless of RLS
-- — an RLS change can never silently turn the gate off. It leaks nothing: it only
-- ever reports on the caller's own lock (current_student_id() is resolved inside).
create or replace function public.student_exam_locked(p_test uuid)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1 from public.exam_locks l
     where l.test_id = p_test
       and l.student_id = public.current_student_id()
       and l.status = 'locked'
  );
$$;

-- ---- Violation -> lock -------------------------------------------------------
create or replace function public.tg_exam_violation_lock()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare v_count int;
begin
  select count(*) into v_count
    from public.exam_violations
   where student_id = new.student_id and test_id = new.test_id;

  if v_count >= public.exam_lock_threshold() then
    insert into public.exam_locks (student_id, test_id, status, reason, violation_count, locked_at)
    values (new.student_id, new.test_id, 'locked', new.violation_type, v_count, now())
    on conflict (student_id, test_id) do update
      set status          = 'locked',
          reason          = excluded.reason,
          violation_count = excluded.violation_count,
          locked_at       = now(),
          unlocked_at     = null,
          unlocked_by     = null;
  end if;
  return new;
end; $$;

drop trigger if exists exam_violation_lock on public.exam_violations;
create trigger exam_violation_lock after insert on public.exam_violations
  for each row execute function public.tg_exam_violation_lock();

-- ---- Identity guard: a lock can never be re-pointed at another student ------
create or replace function public.tg_exam_locks_guard()
returns trigger language plpgsql security invoker set search_path = public, extensions as $$
begin
  new.id         := old.id;
  new.student_id := old.student_id;
  new.test_id    := old.test_id;
  new.created_at := old.created_at;
  return new;
end; $$;

drop trigger if exists exam_locks_guard on public.exam_locks;
create trigger exam_locks_guard before update on public.exam_locks
  for each row execute function public.tg_exam_locks_guard();

-- ---- Notifications: admin on lock, that student on unlock -------------------
create or replace function public.tg_exam_locks_notify()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  v_username text;
  v_cohort   uuid;
  v_test     text;
  v_newly_locked boolean;
  v_unlocked     boolean;
begin
  select s.username, s.cohort_id into v_username, v_cohort
    from public.students s where s.id = new.student_id;
  select t.title into v_test from public.tests t where t.id = new.test_id;

  v_newly_locked := new.status = 'locked'
    and (tg_op = 'INSERT' or old.status is distinct from 'locked');
  v_unlocked := tg_op = 'UPDATE'
    and new.status = 'active' and old.status is distinct from 'active';

  if v_newly_locked then
    perform public.notify_admins(
      'Exam Locked',
      format('%s was locked out of "%s" (%s).',
             coalesce(v_username, 'A student'), coalesce(v_test, 'a test'), new.reason),
      'exam_locked', '/admin/security',
      v_cohort, null, new.test_id, null, null,
      jsonb_build_object(
        'lockId', new.id, 'studentName', v_username,
        'reason', new.reason, 'violationCount', new.violation_count),
      null);
  end if;

  if v_unlocked then
    insert into public.notifications (
      audience, recipient_student_id, cohort_id, title, message, type,
      action_url, related_test_id, metadata)
    values (
      'student', new.student_id, v_cohort,
      'Exam Unlocked',
      format('Your teacher has unlocked "%s". You can continue.', coalesce(v_test, 'your exam')),
      'exam_unlocked', '/test/' || new.test_id::text, new.test_id,
      jsonb_build_object('lockId', new.id));
  end if;

  return new;
end; $$;

drop trigger if exists exam_locks_notify_ins on public.exam_locks;
drop trigger if exists exam_locks_notify_upd on public.exam_locks;
create trigger exam_locks_notify_ins after insert on public.exam_locks
  for each row execute function public.tg_exam_locks_notify();
create trigger exam_locks_notify_upd after update on public.exam_locks
  for each row execute function public.tg_exam_locks_notify();

-- ---- RLS -------------------------------------------------------------------
alter table public.exam_violations enable row level security;
alter table public.exam_locks      enable row level security;

-- Violations: a student may only log against THEMSELVES; reads own, admin all.
drop policy if exists violations_read on public.exam_violations;
create policy violations_read on public.exam_violations for select to authenticated
  using (public.is_admin() or student_id = public.current_student_id());

drop policy if exists violations_insert on public.exam_violations;
create policy violations_insert on public.exam_violations for insert to authenticated
  with check (public.is_admin() or student_id = public.current_student_id());

drop policy if exists violations_delete on public.exam_violations;
create policy violations_delete on public.exam_violations for delete to authenticated
  using (public.is_admin());

-- Locks: read own / all (admin). NO insert policy — only the DEFINER trigger
-- creates locks. UPDATE (i.e. unlock) is ADMIN-ONLY: a student can never change
-- their own exam status.
drop policy if exists locks_read on public.exam_locks;
create policy locks_read on public.exam_locks for select to authenticated
  using (public.is_admin() or student_id = public.current_student_id());

drop policy if exists locks_update on public.exam_locks;
create policy locks_update on public.exam_locks for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists locks_delete on public.exam_locks;
create policy locks_delete on public.exam_locks for delete to authenticated
  using (public.is_admin());

-- ---- BACKEND ENFORCEMENT ----------------------------------------------------
-- The lock is not a UI suggestion: a locked student is refused at the database.
-- Even a tampered client cannot create a submission while locked.
drop policy if exists subs_insert on public.submissions;
create policy subs_insert on public.submissions for insert to authenticated
  with check (
    public.is_admin()
    or (
      student_id = public.current_student_id()
      and not public.student_exam_locked(test_id)
    )
  );

-- ---- Realtime ---------------------------------------------------------------
-- FULL replica identity so UPDATE events carry every column for the RLS check
-- Realtime runs against the OLD row (same reasoning as notifications/flags).
alter table public.exam_locks replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'exam_locks'
  ) then
    execute 'alter publication supabase_realtime add table public.exam_locks';
  end if;
end $$;

-- ---- Grants (RLS still gates every row) ------------------------------------
grant select, insert on public.exam_violations to authenticated;
grant select, update, delete on public.exam_locks to authenticated;
grant execute on function public.student_exam_locked(uuid) to authenticated;
grant execute on function public.exam_lock_threshold() to authenticated;

-- Trigger functions are never callable as RPC.
revoke execute on function public.tg_exam_violation_lock() from public, anon, authenticated;
revoke execute on function public.tg_exam_locks_guard()    from public, anon, authenticated;
revoke execute on function public.tg_exam_locks_notify()   from public, anon, authenticated;
