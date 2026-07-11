-- ============================================================================
-- Notification system — table, indexes, RLS, and self-scoped mutation RPCs.
--
-- Design (see the store.ts seam + existing RLS helpers):
--   * One row PER RECIPIENT. Student events fan out to one row per matching
--     student (audience='student', recipient_student_id set). Admin events are a
--     single row (audience='admin', recipient_student_id null).
--   * Creation is DEFINER-only (triggers + cron in later migrations). Clients get
--     SELECT only; every mutation goes through a SECURITY DEFINER RPC that
--     re-checks ownership — mirrors the dismiss_announcement() pattern.
--   * dedup_key + a partial unique index make cron reminders/releases idempotent.
-- ============================================================================

-- Tests gain scheduling columns. class_id/subject_id already written by store.ts;
-- add defensively so fan-out can scope by them. release_at drives auto-release.
alter table public.tests
  add column if not exists class_id   uuid references public.classes(id)  on delete set null,
  add column if not exists subject_id uuid references public.subjects(id) on delete set null,
  add column if not exists release_at timestamptz;

-- ---- Notifications ---------------------------------------------------------
create table if not exists public.notifications (
  id                    uuid primary key default gen_random_uuid(),
  audience              text not null check (audience in ('student','admin')),
  recipient_student_id  uuid references public.students(id) on delete cascade,
  cohort_id             uuid references public.cohorts(id)  on delete set null,
  subject_id            uuid references public.subjects(id) on delete set null,
  title                 text not null,
  message               text not null,
  type                  text not null,
  action_url            text,
  related_test_id       uuid references public.tests(id)       on delete set null,
  related_note_id       uuid references public.notes(id)       on delete set null,
  related_submission_id uuid references public.submissions(id) on delete set null,
  metadata              jsonb not null default '{}'::jsonb,
  is_read               boolean not null default false,
  read_at               timestamptz,
  created_at            timestamptz not null default now(),
  expires_at            timestamptz,
  dedup_key             text,
  -- A student row must name its recipient; an admin row must not.
  constraint notifications_recipient_shape check (
    (audience = 'student' and recipient_student_id is not null) or
    (audience = 'admin'   and recipient_student_id is null)
  )
);

-- Read paths: student inbox (unread first, newest first) and the admin inbox.
create index if not exists notifications_student_idx
  on public.notifications (recipient_student_id, created_at desc);
create index if not exists notifications_student_unread_idx
  on public.notifications (recipient_student_id) where is_read = false;
create index if not exists notifications_admin_idx
  on public.notifications (audience, created_at desc) where audience = 'admin';
create index if not exists notifications_related_test_idx
  on public.notifications (related_test_id);
-- Idempotency for cron-generated rows (reminders, scheduled releases).
create unique index if not exists notifications_dedup_idx
  on public.notifications (dedup_key) where dedup_key is not null;

-- ---- RLS -------------------------------------------------------------------
alter table public.notifications enable row level security;

-- A student reads only their own rows; an admin reads only admin-audience rows.
-- (No cohort/subject leak: recipient_student_id is the sole student gate.)
create policy notif_read on public.notifications for select to authenticated
  using (
    (audience = 'student' and recipient_student_id = public.current_student_id())
    or (audience = 'admin' and public.is_admin())
  );

-- No client INSERT/UPDATE/DELETE policy on purpose. Creation is DEFINER-only;
-- mutations flow through the RPCs below. SELECT is the only grant clients get.
grant select on public.notifications to authenticated;

-- Realtime evaluates RLS against the *old* row for UPDATE/DELETE, so it needs
-- every column present in the WAL — otherwise RLS-restricted clients silently
-- miss those events. FULL replica identity guarantees delivery of read/delete
-- echoes to a recipient's other open tabs.
alter table public.notifications replica identity full;

-- Expose to Supabase Realtime so the bell updates with no refresh (RLS still
-- filters every streamed row to its rightful recipient). Idempotent: skip if the
-- table is already a member (re-running the migration must not error).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    execute 'alter publication supabase_realtime add table public.notifications';
  end if;
end $$;

-- ---- Ownership predicate (shared by every mutation RPC) --------------------
create or replace function public.notif_owns(n public.notifications)
returns boolean language sql stable security invoker set search_path = public, extensions as $$
  select (n.audience = 'student' and n.recipient_student_id = public.current_student_id())
      or (n.audience = 'admin'   and public.is_admin());
$$;

-- Mark one notification read (only if the caller owns it).
create or replace function public.notif_mark_read(p_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  update public.notifications n
     set is_read = true, read_at = coalesce(read_at, now())
   where n.id = p_id and public.notif_owns(n);
end; $$;

-- Mark every unread notification the caller owns as read.
create or replace function public.notif_mark_all_read()
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_student uuid := public.current_student_id();
begin
  if public.is_admin() then
    update public.notifications set is_read = true, read_at = now()
     where audience = 'admin' and is_read = false;
  elsif v_student is not null then
    update public.notifications set is_read = true, read_at = now()
     where recipient_student_id = v_student and is_read = false;
  end if;
end; $$;

-- Delete one notification the caller owns.
create or replace function public.notif_delete(p_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  delete from public.notifications n where n.id = p_id and public.notif_owns(n);
end; $$;

-- Clear all READ notifications the caller owns (leaves unread intact).
create or replace function public.notif_clear_read()
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_student uuid := public.current_student_id();
begin
  if public.is_admin() then
    delete from public.notifications where audience = 'admin' and is_read = true;
  elsif v_student is not null then
    delete from public.notifications where recipient_student_id = v_student and is_read = true;
  end if;
end; $$;

-- These helpers must never be callable as generic writes — only via RPC.
revoke execute on function public.notif_owns(public.notifications) from public, anon, authenticated;
revoke execute on function public.notif_mark_read(uuid)     from public, anon;
revoke execute on function public.notif_mark_all_read()     from public, anon;
revoke execute on function public.notif_delete(uuid)        from public, anon;
revoke execute on function public.notif_clear_read()        from public, anon;
grant  execute on function public.notif_mark_read(uuid)     to authenticated;
grant  execute on function public.notif_mark_all_read()     to authenticated;
grant  execute on function public.notif_delete(uuid)        to authenticated;
grant  execute on function public.notif_clear_read()        to authenticated;
