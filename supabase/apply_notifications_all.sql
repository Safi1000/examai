-- ============================================================================
-- Examia notifications + auto-release + status/reminder fixes — COMBINED SCRIPT
-- Enable pg_cron first (Database > Extensions). Safe to re-run.
-- Regenerated 2026-07-11T16:15:48Z.
-- ============================================================================

-- >>> 20260711000001_notifications.sql
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

-- >>> 20260711000002_notification_fanout.sql
-- ============================================================================
-- Server-side notification fan-out. All creation happens here (DEFINER), never
-- from a client — this is what makes "never rely on client-side filtering" true.
--
-- Scoping mirrors the app's own rules:
--   * tests  -> testsForStudent (cohort + optional class + optional subject)
--   * notes  -> student_can_access_note_assignment (cohort + optional class/subj)
-- Every fan-out is a single set-based INSERT ... SELECT (no loops, no N+1).
-- ============================================================================

-- ---- Generic student fan-out ----------------------------------------------
-- Inserts one row per student matching (cohort, class, subject). NULL scope
-- widens (null cohort = all students; null class/subject = no extra filter).
create or replace function public.notify_students(
  p_cohort uuid, p_class uuid, p_subject uuid,
  p_title text, p_message text, p_type text, p_action_url text,
  p_test uuid, p_note uuid, p_submission uuid,
  p_metadata jsonb default '{}'::jsonb,
  p_dedup_prefix text default null
) returns integer
language plpgsql security definer set search_path = public, extensions as $$
declare v_count int;
begin
  insert into public.notifications (
    audience, recipient_student_id, cohort_id, subject_id,
    title, message, type, action_url,
    related_test_id, related_note_id, related_submission_id, metadata, dedup_key
  )
  select 'student', s.id, s.cohort_id, p_subject,
         p_title, p_message, p_type, p_action_url,
         p_test, p_note, p_submission, coalesce(p_metadata, '{}'::jsonb),
         case when p_dedup_prefix is null then null
              else p_dedup_prefix || ':' || s.id::text end
    from public.students s
   where (p_cohort  is null or s.cohort_id = p_cohort)
     and (p_class   is null or exists (
            select 1 from public.student_classes sc
             where sc.student_id = s.id and sc.class_id = p_class))
     and (p_subject is null or exists (
            select 1 from public.student_subjects ss
             where ss.student_id = s.id and ss.subject_id = p_subject))
  on conflict (dedup_key) where dedup_key is not null do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end; $$;

-- ---- Single admin-audience notification -----------------------------------
create or replace function public.notify_admins(
  p_title text, p_message text, p_type text, p_action_url text,
  p_cohort uuid, p_subject uuid, p_test uuid, p_note uuid, p_submission uuid,
  p_metadata jsonb default '{}'::jsonb, p_dedup text default null
) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  insert into public.notifications (
    audience, recipient_student_id, cohort_id, subject_id,
    title, message, type, action_url,
    related_test_id, related_note_id, related_submission_id, metadata, dedup_key
  ) values (
    'admin', null, p_cohort, p_subject,
    p_title, p_message, p_type, p_action_url,
    p_test, p_note, p_submission, coalesce(p_metadata, '{}'::jsonb), p_dedup
  )
  on conflict (dedup_key) where dedup_key is not null do nothing;
end; $$;

-- ---- Note fan-out (distinct students across all of a note's assignments) ----
create or replace function public.notify_note(
  p_note uuid, p_title text, p_message text, p_type text
) returns integer
language plpgsql security definer set search_path = public, extensions as $$
declare v_count int;
begin
  insert into public.notifications (
    audience, recipient_student_id, cohort_id, subject_id,
    title, message, type, action_url, related_note_id, metadata
  )
  select distinct on (s.id)
         'student', s.id, s.cohort_id, na.subject_id,
         p_title, p_message, p_type, '/notes', p_note, '{}'::jsonb
    from public.note_assignments na
    join public.students s on s.cohort_id = na.cohort_id
   where na.note_id = p_note
     and (na.class_id is null or exists (
            select 1 from public.student_classes sc
             where sc.student_id = s.id and sc.class_id = na.class_id))
     and (na.subject_id is null or exists (
            select 1 from public.student_subjects ss
             where ss.student_id = s.id and ss.subject_id = na.subject_id))
   order by s.id;
  get diagnostics v_count = row_count;
  return v_count;
end; $$;

revoke execute on function public.notify_students(uuid,uuid,uuid,text,text,text,text,uuid,uuid,uuid,jsonb,text) from public, anon, authenticated;
revoke execute on function public.notify_admins(text,text,text,text,uuid,uuid,uuid,uuid,uuid,jsonb,text) from public, anon, authenticated;
revoke execute on function public.notify_note(uuid,text,text,text) from public, anon, authenticated;

-- ============================================================================
-- Event triggers
-- ============================================================================

-- ---- TESTS -----------------------------------------------------------------
create or replace function public.tg_tests_notify()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  v_meta jsonb;
  v_published boolean;
  v_closed boolean;
  v_content_changed boolean;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      v_meta := jsonb_build_object(
        'subject', new.subject, 'opensAt', new.opens_at, 'closesAt', new.closes_at,
        'durationMinutes', new.duration_minutes, 'testCode', new.test_code);
      perform public.notify_students(
        new.cohort_id, new.class_id, new.subject_id,
        'New Test Posted',
        format('A new test "%s" has been posted.', new.title),
        'test_posted', '/test/' || new.id::text,
        new.id, null, null, v_meta, null);
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    v_published := old.status = 'draft' and new.status <> 'draft';
    v_closed    := new.status = 'closed' and old.status <> 'closed';
    v_content_changed := new.status <> 'draft' and not v_published and (
         old.title            is distinct from new.title
      or old.subject          is distinct from new.subject
      or old.opens_at         is distinct from new.opens_at
      or old.closes_at        is distinct from new.closes_at
      or old.duration_minutes is distinct from new.duration_minutes
      or old.cohort_id        is distinct from new.cohort_id
      or old.class_id         is distinct from new.class_id
      or old.subject_id       is distinct from new.subject_id);

    v_meta := jsonb_build_object(
      'subject', new.subject, 'opensAt', new.opens_at, 'closesAt', new.closes_at,
      'durationMinutes', new.duration_minutes, 'testCode', new.test_code);

    if v_published then
      perform public.notify_students(
        new.cohort_id, new.class_id, new.subject_id,
        'New Test Posted',
        format('A new test "%s" has been posted.', new.title),
        'test_posted', '/test/' || new.id::text, new.id, null, null, v_meta, null);
    elsif v_closed then
      -- Same dedup key the cron time-based close uses, so only one fires.
      perform public.notify_students(
        new.cohort_id, new.class_id, new.subject_id,
        'Test Closed',
        format('The submission window for "%s" has closed.', new.title),
        'test_closed', null, new.id, null, null, v_meta, 'test_closed:' || new.id::text);
    elsif v_content_changed then
      perform public.notify_students(
        new.cohort_id, new.class_id, new.subject_id,
        'Test Updated',
        format('The test "%s" has been updated.', new.title),
        'test_updated', '/test/' || new.id::text, new.id, null, null, v_meta, null);
    end if;
    return new;
  end if;

  return new;
end; $$;

create or replace function public.tg_tests_deleted()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if old.status <> 'draft' then
    perform public.notify_students(
      old.cohort_id, old.class_id, old.subject_id,
      'Test Cancelled',
      format('The scheduled test "%s" has been cancelled.', old.title),
      'test_deleted', null, old.id, null, null,
      jsonb_build_object('title', old.title, 'testCode', old.test_code), null);
  end if;
  return old;
end; $$;

drop trigger if exists tests_notify_ins on public.tests;
drop trigger if exists tests_notify_upd on public.tests;
drop trigger if exists tests_notify_del on public.tests;
create trigger tests_notify_ins after insert on public.tests
  for each row execute function public.tg_tests_notify();
create trigger tests_notify_upd after update on public.tests
  for each row execute function public.tg_tests_notify();
-- BEFORE DELETE: the row (and its assignments) still exist so related_test_id
-- resolves; the FK's ON DELETE SET NULL clears it as the delete completes.
create trigger tests_notify_del before delete on public.tests
  for each row execute function public.tg_tests_deleted();

-- ---- NOTES -----------------------------------------------------------------
-- New assignment => students who just gained access learn of the note.
create or replace function public.tg_note_assignment_ins()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare v_title text;
begin
  select title into v_title from public.notes where id = new.note_id;
  perform public.notify_students(
    new.cohort_id, new.class_id, new.subject_id,
    'New Notes Uploaded',
    format('New study material "%s" is now available.', coalesce(v_title, 'Untitled')),
    'notes_uploaded', '/notes', null, new.note_id, null, '{}'::jsonb, null);
  return new;
end; $$;

create or replace function public.tg_notes_upd()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if old.title is distinct from new.title or old.file_url is distinct from new.file_url then
    perform public.notify_note(new.id, 'Study Material Updated',
      format('The notes "%s" have been updated.', new.title), 'notes_updated');
  end if;
  return new;
end; $$;

create or replace function public.tg_notes_del()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public.notify_note(old.id, 'Study Material Removed',
    format('The notes "%s" have been removed.', old.title), 'notes_deleted');
  return old;
end; $$;

drop trigger if exists note_assign_notify_ins on public.note_assignments;
drop trigger if exists notes_notify_upd on public.notes;
drop trigger if exists notes_notify_del on public.notes;
create trigger note_assign_notify_ins after insert on public.note_assignments
  for each row execute function public.tg_note_assignment_ins();
create trigger notes_notify_upd after update on public.notes
  for each row execute function public.tg_notes_upd();
create trigger notes_notify_del before delete on public.notes
  for each row execute function public.tg_notes_del();

-- ---- SUBMISSIONS -----------------------------------------------------------
create or replace function public.tg_submissions_notify()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  v_student_name text;
  v_test_title text;
  v_cohort_name text;
  v_is_late boolean;
begin
  if tg_op = 'INSERT' then
    select s.username, c.name, t.title,
           (new.submitted_at is not null and t.closes_at is not null and new.submitted_at > t.closes_at)
      into v_student_name, v_cohort_name, v_test_title, v_is_late
      from public.students s
      left join public.cohorts c on c.id = s.cohort_id
      cross join lateral (select title, closes_at from public.tests where id = new.test_id) t
     where s.id = new.student_id;

    perform public.notify_admins(
      case when v_is_late then 'Late Submission' else 'Test Submitted' end,
      format('%s submitted "%s".', coalesce(v_student_name, 'A student'), coalesce(v_test_title, 'a test')),
      case when v_is_late then 'late_submission' else 'test_submitted' end,
      '/admin/grading/' || new.id::text,
      (select cohort_id from public.students where id = new.student_id), null,
      new.test_id, null, new.id,
      jsonb_build_object(
        'studentName', v_student_name, 'testTitle', v_test_title,
        'cohort', v_cohort_name, 'submittedAt', new.submitted_at, 'late', coalesce(v_is_late,false)),
      null);
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status is distinct from 'released' and new.status = 'released' then
    select title into v_test_title from public.tests where id = new.test_id;
    insert into public.notifications (
      audience, recipient_student_id, cohort_id, title, message, type,
      action_url, related_test_id, related_submission_id, metadata, dedup_key)
    select 'student', new.student_id, s.cohort_id,
           'Result Released',
           format('Your result for "%s" has been released.', coalesce(v_test_title,'your test')),
           'result_released', '/results/' || new.test_id::text, new.test_id, new.id,
           jsonb_build_object('totalMarks', new.total_marks),
           'result_released:' || new.id::text
      from public.students s where s.id = new.student_id
    on conflict (dedup_key) where dedup_key is not null do nothing;
    return new;
  end if;

  return new;
end; $$;

drop trigger if exists submissions_notify_ins on public.submissions;
drop trigger if exists submissions_notify_upd on public.submissions;
create trigger submissions_notify_ins after insert on public.submissions
  for each row execute function public.tg_submissions_notify();
create trigger submissions_notify_upd after update on public.submissions
  for each row execute function public.tg_submissions_notify();

-- ---- ANNOUNCEMENTS ---------------------------------------------------------
create or replace function public.tg_announcements_notify()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public.notify_students(
    new.cohort_id, null, null,
    'Announcement', new.body, 'announcement', null,
    null, null, null,
    jsonb_build_object('pinned', new.pinned), null);
  return new;
end; $$;

drop trigger if exists announcements_notify_ins on public.announcements;
create trigger announcements_notify_ins after insert on public.announcements
  for each row execute function public.tg_announcements_notify();

-- ---- STUDENTS (enrolment / cohort change) ----------------------------------
create or replace function public.tg_students_notify()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare v_cohort_name text;
begin
  if tg_op = 'INSERT' and new.cohort_id is not null then
    select name into v_cohort_name from public.cohorts where id = new.cohort_id;
    insert into public.notifications (audience, recipient_student_id, cohort_id, title, message, type, metadata)
    values ('student', new.id, new.cohort_id, 'Welcome',
            format('You have been added to %s.', coalesce(v_cohort_name, 'your cohort')),
            'cohort_enrollment', '{}'::jsonb);
    return new;
  end if;

  if tg_op = 'UPDATE' and old.cohort_id is distinct from new.cohort_id and new.cohort_id is not null then
    select name into v_cohort_name from public.cohorts where id = new.cohort_id;
    insert into public.notifications (audience, recipient_student_id, cohort_id, title, message, type, metadata)
    values ('student', new.id, new.cohort_id, 'Cohort Updated',
            format('You have been moved to %s.', coalesce(v_cohort_name, 'a new cohort')),
            'cohort_changed', '{}'::jsonb);
    return new;
  end if;

  return new;
end; $$;

drop trigger if exists students_notify_ins on public.students;
drop trigger if exists students_notify_upd on public.students;
create trigger students_notify_ins after insert on public.students
  for each row execute function public.tg_students_notify();
create trigger students_notify_upd after update on public.students
  for each row execute function public.tg_students_notify();

-- >>> 20260711000003_scheduler.sql
-- ============================================================================
-- Server-side scheduler (pg_cron). Runs every minute with NO browser/user
-- required. Generates time-based reminders, test open/close events, and
-- automatic result release. Idempotent via the notifications.dedup_key unique
-- index — a late/duplicate cron run never double-sends.
--
-- NOTE: pg_cron must be enabled on the project (Supabase: Database > Extensions,
-- or `create extension pg_cron`). If your platform pins it to the `cron` schema,
-- the create-extension line is a no-op and cron.schedule still resolves.
-- ============================================================================

create extension if not exists pg_cron;

-- Execution audit trail.
create table if not exists public.notification_log (
  id       bigint generated always as identity primary key,
  run_at   timestamptz not null default now(),
  job      text not null,
  affected integer not null default 0,
  detail   jsonb not null default '{}'::jsonb
);
alter table public.notification_log enable row level security;
create policy notiflog_admin on public.notification_log for select to authenticated using (public.is_admin());
grant select on public.notification_log to authenticated;

-- One bucket of a "starts/closes in N" reminder. Edge-triggered with a 10-min
-- catch-up window so a delayed cron run still fires; dedup keeps it once.
create or replace function public.emit_time_reminders()
returns integer
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_total int := 0;
  v_n int;
  r text[];
  -- label, seconds-before, human phrase
  opens_buckets constant text[][] := array[
    array['24h','86400','starts in 24 hours'],
    array['1h','3600','starts in 1 hour'],
    array['30m','1800','starts in 30 minutes'],
    array['15m','900','starts in 15 minutes'],
    array['5m','300','starts in 5 minutes']
  ];
  closes_buckets constant text[][] := array[
    array['30m','1800','closes in 30 minutes'],
    array['15m','900','closes in 15 minutes'],
    array['10m','600','closes in 10 minutes'],
    array['5m','300','closes in 5 minutes'],
    array['1m','60','closes in 1 minute']
  ];
begin
  -- Opens-soon reminders.
  foreach r slice 1 in array opens_buckets loop
    select coalesce(sum(cnt), 0) into v_n from (
      select public.notify_students(
        t.cohort_id, t.class_id, t.subject_id,
        'Test Reminder',
        format('Your test "%s" %s.', t.title, r[3]),
        'test_reminder', '/test/' || t.id::text, t.id, null, null,
        jsonb_build_object('bucket', r[1], 'kind', 'opens', 'opensAt', t.opens_at),
        'test_open_' || r[1] || ':' || t.id::text) as cnt
        from public.tests t
       where t.status <> 'draft'
         and t.opens_at > now()
         and now() >= t.opens_at - make_interval(secs => r[2]::int)
         and now() <  t.opens_at - make_interval(secs => r[2]::int) + interval '10 minutes'
    ) s;
    v_total := v_total + v_n;
  end loop;

  -- Closing-soon reminders (only while the window is actually open).
  foreach r slice 1 in array closes_buckets loop
    select coalesce(sum(cnt), 0) into v_n from (
      select public.notify_students(
        t.cohort_id, t.class_id, t.subject_id,
        'Submission Closing',
        format('Your submission for "%s" %s.', t.title, r[3]),
        'test_closing', '/test/' || t.id::text, t.id, null, null,
        jsonb_build_object('bucket', r[1], 'kind', 'closes', 'closesAt', t.closes_at),
        'test_close_' || r[1] || ':' || t.id::text) as cnt
        from public.tests t
       where t.status <> 'draft'
         and t.opens_at <= now() and t.closes_at > now()
         and now() >= t.closes_at - make_interval(secs => r[2]::int)
         and now() <  t.closes_at - make_interval(secs => r[2]::int) + interval '10 minutes'
    ) s;
    v_total := v_total + v_n;
  end loop;

  return v_total;
end; $$;

-- Test started / closed transitions (time-based). Manual status flips are
-- covered by the tests UPDATE trigger; test_closed shares a dedup key so the two
-- paths never double-send.
create or replace function public.emit_test_transitions()
returns integer
language plpgsql security definer set search_path = public, extensions as $$
declare v_total int := 0; v_n int;
begin
  select coalesce(sum(cnt),0) into v_n from (
    select public.notify_students(
      t.cohort_id, t.class_id, t.subject_id,
      'Test Started',
      format('Your test "%s" has started.', t.title),
      'test_started', '/test/' || t.id::text, t.id, null, null,
      jsonb_build_object('opensAt', t.opens_at),
      'test_started:' || t.id::text) as cnt
      from public.tests t
     where t.status <> 'draft'
       and now() >= t.opens_at and now() < t.opens_at + interval '10 minutes'
  ) s;
  v_total := v_total + v_n;

  select coalesce(sum(cnt),0) into v_n from (
    select public.notify_students(
      t.cohort_id, t.class_id, t.subject_id,
      'Test Closed',
      format('The submission window for "%s" has closed.', t.title),
      'test_closed', null, t.id, null, null,
      jsonb_build_object('closesAt', t.closes_at),
      'test_closed:' || t.id::text) as cnt
      from public.tests t
     where t.status <> 'draft'
       and now() >= t.closes_at and now() < t.closes_at + interval '10 minutes'
  ) s;
  v_total := v_total + v_n;

  return v_total;
end; $$;

-- Automatic result release: any test whose release_at has passed gets its still-
-- 'submitted' submissions flipped to 'released'. The submissions UPDATE trigger
-- then fires the per-student result_released notification. Only 'submitted' rows
-- change, so re-running never double-releases. Manual release is untouched.
create or replace function public.run_auto_release()
returns integer
language plpgsql security definer set search_path = public, extensions as $$
declare v_released int := 0;
begin
  with due as (
    select id from public.tests
     where release_at is not null and release_at <= now()
  ),
  upd as (
    update public.submissions s
       set status = 'released', released_at = now()
      from due
     where s.test_id = due.id and s.status = 'submitted'
    returning s.id
  )
  select count(*) into v_released from upd;
  return v_released;
end; $$;

-- The one-minute entrypoint pg_cron calls. Logs each sub-job's affected count.
create or replace function public.run_notification_scheduler()
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_reminders int; v_transitions int; v_released int;
begin
  v_reminders   := public.emit_time_reminders();
  v_transitions := public.emit_test_transitions();
  v_released    := public.run_auto_release();

  insert into public.notification_log (job, affected, detail)
  values ('scheduler', v_reminders + v_transitions + v_released,
          jsonb_build_object('reminders', v_reminders,
                             'transitions', v_transitions,
                             'released', v_released));
end; $$;

revoke execute on function public.emit_time_reminders()          from public, anon, authenticated;
revoke execute on function public.emit_test_transitions()        from public, anon, authenticated;
revoke execute on function public.run_auto_release()             from public, anon, authenticated;
revoke execute on function public.run_notification_scheduler()   from public, anon, authenticated;

-- Schedule once (idempotent: drop any prior definition first).
do $$
begin
  perform cron.unschedule('examia-notif');
exception when others then null;
end $$;
select cron.schedule('examia-notif', '* * * * *', $$select public.run_notification_scheduler();$$);

-- >>> 20260711000004_realtime_submissions.sql
-- ============================================================================
-- Enable Supabase Realtime on submissions so the admin submissions/roster views
-- and the student dashboard update live (submit, status change, result release)
-- without a manual refresh. RLS still scopes every streamed row (admin: all;
-- student: own). No schema/data change — publication membership only.
--
-- REPLICA IDENTITY FULL lets Realtime evaluate RLS against the old row for
-- UPDATE/DELETE, so filtered (student) channels receive those events reliably.
-- ============================================================================

alter table public.submissions replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'submissions'
  ) then
    execute 'alter publication supabase_realtime add table public.submissions';
  end if;
end $$;

-- >>> 20260711000005_status_and_reminders.sql
-- ============================================================================
-- Bug fixes: automatic status ('cancelled' state) + smarter closing reminders.
--
--  * tests.status gains 'cancelled' (manual override). Effective scheduled/open/
--    closed is derived client-side from the schedule; the DB stays the source of
--    truth for the *lifecycle* state (draft / active / closed / cancelled).
--  * Time-based notifications now key off status = 'active' (schedule-driven)
--    only, so manually closed/cancelled tests never emit reminders.
--  * Closing reminders are rescheduled to 24h/1h/30m/15m/5m and each bucket is
--    only sent when it actually falls inside the open→close window (so a 5-minute
--    test never spams, and nothing fires at/after close). Idempotent via dedup.
-- ============================================================================

-- 1. Allow the 'cancelled' lifecycle state.
alter table public.tests drop constraint if exists tests_status_check;
alter table public.tests add constraint tests_status_check
  check (status in ('draft', 'active', 'closed', 'cancelled'));

-- 2. Reminders. Opens buckets unchanged (now gated to schedule-driven tests);
--    closing buckets reworked so each only fires when there's genuinely that much
--    time before close (bucket time must land after opensAt), never after close,
--    with a tight catch-up window so a late run can't show a stale "in N minutes".
create or replace function public.emit_time_reminders()
returns integer
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_total int := 0;
  v_n int;
  r text[];
  opens_buckets constant text[][] := array[
    array['24h','86400','starts in 24 hours'],
    array['1h','3600','starts in 1 hour'],
    array['30m','1800','starts in 30 minutes'],
    array['15m','900','starts in 15 minutes'],
    array['5m','300','starts in 5 minutes']
  ];
  closes_buckets constant text[][] := array[
    array['24h','86400','closes in 24 hours'],
    array['1h','3600','closes in 1 hour'],
    array['30m','1800','closes in 30 minutes'],
    array['15m','900','closes in 15 minutes'],
    array['5m','300','closes in 5 minutes']
  ];
begin
  -- Opens-soon reminders (schedule-driven tests only).
  foreach r slice 1 in array opens_buckets loop
    select coalesce(sum(cnt), 0) into v_n from (
      select public.notify_students(
        t.cohort_id, t.class_id, t.subject_id,
        'Test Reminder',
        format('Your test "%s" %s.', t.title, r[3]),
        'test_reminder', '/test/' || t.id::text, t.id, null, null,
        jsonb_build_object('bucket', r[1], 'kind', 'opens', 'opensAt', t.opens_at),
        'test_open_' || r[1] || ':' || t.id::text) as cnt
        from public.tests t
       where t.status = 'active'
         and t.opens_at > now()
         and now() >= t.opens_at - make_interval(secs => r[2]::int)
         and now() <  t.opens_at - make_interval(secs => r[2]::int) + interval '2 minutes'
    ) s;
    v_total := v_total + v_n;
  end loop;

  -- Closing-soon reminders. A bucket is emitted only if the reminder instant
  -- (closesAt - bucket) is strictly after opensAt — i.e. the test window is long
  -- enough for that reminder to be meaningful. Short tests are naturally skipped:
  --   5-min window  -> no bucket (closesAt-5m == opensAt, not after it)
  --   10-min window -> 5m only, 20-min -> 15m+5m, 45-min -> 30m+15m+5m, etc.
  foreach r slice 1 in array closes_buckets loop
    select coalesce(sum(cnt), 0) into v_n from (
      select public.notify_students(
        t.cohort_id, t.class_id, t.subject_id,
        'Submission Closing',
        format('Your submission for "%s" %s.', t.title, r[3]),
        'test_closing', '/test/' || t.id::text, t.id, null, null,
        jsonb_build_object('bucket', r[1], 'kind', 'closes', 'closesAt', t.closes_at),
        'test_close_' || r[1] || ':' || t.id::text) as cnt
        from public.tests t
       where t.status = 'active'
         and t.opens_at <= now() and t.closes_at > now()
         and t.closes_at - make_interval(secs => r[2]::int) > t.opens_at
         and now() >= t.closes_at - make_interval(secs => r[2]::int)
         and now() <  t.closes_at - make_interval(secs => r[2]::int) + interval '2 minutes'
    ) s;
    v_total := v_total + v_n;
  end loop;

  return v_total;
end; $$;

-- 3. Started / closed transitions — schedule-driven tests only.
create or replace function public.emit_test_transitions()
returns integer
language plpgsql security definer set search_path = public, extensions as $$
declare v_total int := 0; v_n int;
begin
  select coalesce(sum(cnt),0) into v_n from (
    select public.notify_students(
      t.cohort_id, t.class_id, t.subject_id,
      'Test Started',
      format('Your test "%s" has started.', t.title),
      'test_started', '/test/' || t.id::text, t.id, null, null,
      jsonb_build_object('opensAt', t.opens_at),
      'test_started:' || t.id::text) as cnt
      from public.tests t
     where t.status = 'active'
       and now() >= t.opens_at and now() < t.opens_at + interval '10 minutes'
  ) s;
  v_total := v_total + v_n;

  select coalesce(sum(cnt),0) into v_n from (
    select public.notify_students(
      t.cohort_id, t.class_id, t.subject_id,
      'Test Closed',
      format('The submission window for "%s" has closed.', t.title),
      'test_closed', null, t.id, null, null,
      jsonb_build_object('closesAt', t.closes_at),
      'test_closed:' || t.id::text) as cnt
      from public.tests t
     where t.status = 'active'
       and now() >= t.closes_at and now() < t.closes_at + interval '10 minutes'
  ) s;
  v_total := v_total + v_n;

  return v_total;
end; $$;

-- 4. Tests trigger — publish / update / close / (new) cancel notifications.
create or replace function public.tg_tests_notify()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  v_meta jsonb;
  v_published boolean;
  v_closed boolean;
  v_cancelled boolean;
  v_content_changed boolean;
begin
  if tg_op = 'INSERT' then
    if new.status = 'active' then
      v_meta := jsonb_build_object(
        'subject', new.subject, 'opensAt', new.opens_at, 'closesAt', new.closes_at,
        'durationMinutes', new.duration_minutes, 'testCode', new.test_code);
      perform public.notify_students(
        new.cohort_id, new.class_id, new.subject_id,
        'New Test Posted',
        format('A new test "%s" has been posted.', new.title),
        'test_posted', '/test/' || new.id::text, new.id, null, null, v_meta, null);
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    v_published := old.status = 'draft' and new.status = 'active';
    v_cancelled := new.status = 'cancelled' and old.status is distinct from 'cancelled';
    v_closed    := new.status = 'closed' and old.status is distinct from 'closed';
    v_content_changed := new.status = 'active' and not v_published and (
         old.title            is distinct from new.title
      or old.subject          is distinct from new.subject
      or old.opens_at         is distinct from new.opens_at
      or old.closes_at        is distinct from new.closes_at
      or old.duration_minutes is distinct from new.duration_minutes
      or old.cohort_id        is distinct from new.cohort_id
      or old.class_id         is distinct from new.class_id
      or old.subject_id       is distinct from new.subject_id);

    v_meta := jsonb_build_object(
      'subject', new.subject, 'opensAt', new.opens_at, 'closesAt', new.closes_at,
      'durationMinutes', new.duration_minutes, 'testCode', new.test_code);

    if v_published then
      perform public.notify_students(
        new.cohort_id, new.class_id, new.subject_id,
        'New Test Posted',
        format('A new test "%s" has been posted.', new.title),
        'test_posted', '/test/' || new.id::text, new.id, null, null, v_meta, null);
    elsif v_cancelled then
      perform public.notify_students(
        new.cohort_id, new.class_id, new.subject_id,
        'Test Cancelled',
        format('The scheduled test "%s" has been cancelled.', new.title),
        'test_deleted', null, new.id, null, null, v_meta, 'test_cancelled:' || new.id::text);
    elsif v_closed then
      perform public.notify_students(
        new.cohort_id, new.class_id, new.subject_id,
        'Test Closed',
        format('The submission window for "%s" has closed.', new.title),
        'test_closed', null, new.id, null, null, v_meta, 'test_closed:' || new.id::text);
    elsif v_content_changed then
      perform public.notify_students(
        new.cohort_id, new.class_id, new.subject_id,
        'Test Updated',
        format('The test "%s" has been updated.', new.title),
        'test_updated', '/test/' || new.id::text, new.id, null, null, v_meta, null);
    end if;
    return new;
  end if;

  return new;
end; $$;

-- >>> 20260711000006_harden_trigger_exposure.sql
-- Trigger functions must never be callable as RPC (they only run via triggers,
-- which don't require EXECUTE). Revoking removes the exposed /rest/v1/rpc
-- endpoints flagged by the security advisor. No effect on trigger firing.
revoke execute on function public.tg_tests_notify()         from public, anon, authenticated;
revoke execute on function public.tg_tests_deleted()        from public, anon, authenticated;
revoke execute on function public.tg_note_assignment_ins()  from public, anon, authenticated;
revoke execute on function public.tg_notes_upd()            from public, anon, authenticated;
revoke execute on function public.tg_notes_del()            from public, anon, authenticated;
revoke execute on function public.tg_submissions_notify()   from public, anon, authenticated;
revoke execute on function public.tg_announcements_notify() from public, anon, authenticated;
revoke execute on function public.tg_students_notify()      from public, anon, authenticated;

