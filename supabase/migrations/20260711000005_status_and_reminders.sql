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
