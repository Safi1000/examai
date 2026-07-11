-- ============================================================================
-- Post-apply verification for the notification system.
-- Run in the Supabase SQL editor AFTER apply_notifications_all.sql.
-- Every check prints a row; the `ok` column should be true.
-- ============================================================================

-- 1. Table + new test columns exist.
select 'notifications table' as check,
       to_regclass('public.notifications') is not null as ok;
select 'tests.release_at column' as check,
       exists (select 1 from information_schema.columns
               where table_schema='public' and table_name='tests' and column_name='release_at') as ok;

-- 2. RLS is ON and the read policy exists; no client write policy exists.
select 'RLS enabled on notifications' as check, relrowsecurity as ok
  from pg_class where oid = 'public.notifications'::regclass;
select 'read policy present' as check,
       exists (select 1 from pg_policies where tablename='notifications' and policyname='notif_read') as ok;
select 'no client write policy' as check,
       not exists (select 1 from pg_policies where tablename='notifications'
                   and cmd in ('INSERT','UPDATE','DELETE')) as ok;

-- 3. Mutation RPCs + fan-out functions exist.
select 'mutation RPCs (4)' as check,
       count(*) = 4 as ok
  from pg_proc where proname in ('notif_mark_read','notif_mark_all_read','notif_delete','notif_clear_read');
select 'fan-out functions (3)' as check,
       count(*) = 3 as ok
  from pg_proc where proname in ('notify_students','notify_admins','notify_note');

-- 4. Event triggers are attached.
select 'event triggers' as check, count(*) >= 8 as ok, count(*) as found
  from pg_trigger
 where not tgisinternal
   and tgrelid in ('public.tests'::regclass,'public.notes'::regclass,'public.note_assignments'::regclass,
                   'public.submissions'::regclass,'public.announcements'::regclass,'public.students'::regclass)
   and tgname like '%notify%' or tgname like '%_notify_%';

-- 5. Realtime publication includes notifications.
select 'in supabase_realtime publication' as check,
       exists (select 1 from pg_publication_tables
               where pubname='supabase_realtime' and schemaname='public' and tablename='notifications') as ok;

-- 6. Dedup unique index present (idempotency guarantee).
select 'dedup unique index' as check,
       exists (select 1 from pg_indexes where tablename='notifications' and indexname='notifications_dedup_idx') as ok;

-- 7. pg_cron job scheduled.
select 'cron job examia-notif' as check,
       exists (select 1 from cron.job where jobname='examia-notif') as ok;

-- 8. Scheduler runs cleanly and is idempotent (run twice, expect no error; a
--    second immediate run should insert 0 duplicate reminder rows).
select public.run_notification_scheduler();
select public.run_notification_scheduler();
select 'scheduler logged runs' as check, count(*) >= 2 as ok
  from public.notification_log where job='scheduler';

-- 9. Cohort-scoping smoke test (READ-ONLY count; expects fan-out to be scoped).
--    After you post a real test for one cohort, compare per-cohort counts:
-- select c.name, count(n.*) from public.cohorts c
--   left join public.notifications n on n.cohort_id = c.id and n.type='test_posted'
--   group by c.name order by c.name;
