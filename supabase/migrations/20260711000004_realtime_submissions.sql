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
