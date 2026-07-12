-- ============================================================================
-- Force password change on first login.
--
-- New students are created by an admin with a temporary password; they must set
-- their own password before using the app. We track this with a single boolean
-- on the students row. A student clears it ONLY via a SECURITY DEFINER RPC
-- (mirroring dismiss_announcement) — never a direct UPDATE — so no broad write
-- access to the students table is opened up.
-- ============================================================================

alter table public.students
  add column must_change_password boolean not null default true;

-- Existing students already have working passwords they chose/were given before
-- this feature — don't force them through the dialog. Only students created
-- AFTER this migration (via the admin-users edge function, which sets the flag
-- explicitly) start out flagged.
update public.students set must_change_password = false;

-- Let a student flip ONLY their own flag to false, and nothing else. Students
-- have no direct UPDATE policy on students (writes stay admin-only); this RPC is
-- the single, column-scoped exception, exactly like dismiss_announcement.
create or replace function public.clear_must_change_password()
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_student uuid;
begin
  v_student := public.current_student_id();
  if v_student is null then raise exception 'not a student'; end if;
  update public.students set must_change_password = false where id = v_student;
end; $$;

-- Students only (never anon).
revoke execute on function public.clear_must_change_password() from public, anon;
grant execute on function public.clear_must_change_password() to authenticated;
