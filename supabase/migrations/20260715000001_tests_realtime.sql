-- ============================================================================
-- Publish `tests` to Realtime.
--
-- Why: the client hydrated tests once at login and never heard about them again.
-- When an admin deleted a test, every other session kept it in cache — a student
-- could still open it, and flagging it or tripping a violation then inserted a
-- test_id that no longer existed, failing question_flags_test_id_fkey /
-- exam_violations_test_id_fkey. Streaming test changes evicts the dead row from
-- every client instead, so the admin list, student dashboard, upcoming tests and
-- the runner all drop it with no refresh.
--
-- Schema is unchanged — this is publication membership only. RLS still decides
-- which tests each client is allowed to see.
--
-- REPLICA IDENTITY FULL so DELETE events carry enough of the old row for Realtime
-- to evaluate RLS against it (same reasoning as notifications / flags / locks).
-- ============================================================================

alter table public.tests replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tests'
  ) then
    execute 'alter publication supabase_realtime add table public.tests';
  end if;
end $$;
