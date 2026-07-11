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
