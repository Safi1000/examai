-- RLS helpers don't need definer rights (no recursion: the students policy keys
-- off auth.uid() directly). Switching to INVOKER removes the API-exposure warning.
create or replace function public.is_admin()
returns boolean language sql stable security invoker set search_path = public, extensions as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;

create or replace function public.current_student_id()
returns uuid language sql stable security invoker set search_path = public, extensions as $$
  select id from public.students where user_id = auth.uid() limit 1;
$$;

create or replace function public.current_student_cohort()
returns uuid language sql stable security invoker set search_path = public, extensions as $$
  select cohort_id from public.students where user_id = auth.uid() limit 1;
$$;

-- Trigger functions must stay DEFINER (they read admin-only keys / write
-- submissions) but should never be callable as RPC.
revoke execute on function public.grade_mcq() from public, anon, authenticated;
revoke execute on function public.sum_submission_marks() from public, anon, authenticated;

-- Dismissal RPC: students only.
revoke execute on function public.dismiss_announcement(uuid) from public, anon;
grant execute on function public.dismiss_announcement(uuid) to authenticated;
