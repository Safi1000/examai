-- ---- Identity helpers (final form is SECURITY INVOKER — see the harden
-- migration; created here as DEFINER and switched there). -------------------

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;

create or replace function public.current_student_id()
returns uuid language sql stable security definer set search_path = public, extensions as $$
  select id from public.students where user_id = auth.uid() limit 1;
$$;

create or replace function public.current_student_cohort()
returns uuid language sql stable security definer set search_path = public, extensions as $$
  select cohort_id from public.students where user_id = auth.uid() limit 1;
$$;

-- ---- MCQ auto-grading. Runs server-side; the answer key never leaves the DB.
-- Mirrors lib/scoring.ts scoreMcq + grading.ts autoGradeMcq.
create or replace function public.grade_mcq()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare v_type text; v_marks int; v_key int;
begin
  select q.type, q.marks into v_type, v_marks from public.questions q where q.id = new.question_id;
  if v_type = 'mcq' then
    select correct_index into v_key from public.question_keys where question_id = new.question_id;
    new.correct_index := v_key;
    if new.selected_index is not null and new.selected_index = v_key then
      new.is_correct := true;  new.marks_awarded := v_marks;
    else
      new.is_correct := false; new.marks_awarded := 0;
    end if;
  end if;
  return new;
end; $$;

create trigger grade_mcq_before_insert
  before insert on public.answers
  for each row execute function public.grade_mcq();

-- ---- Keep submissions.total_marks authoritative (score integrity). ---------
create or replace function public.sum_submission_marks()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare v_sub uuid;
begin
  v_sub := coalesce(new.submission_id, old.submission_id);
  update public.submissions s
     set total_marks = coalesce((select sum(marks_awarded) from public.answers where submission_id = v_sub), 0)
   where s.id = v_sub;
  return null;
end; $$;

create trigger sum_marks_after_write
  after insert or update or delete on public.answers
  for each row execute function public.sum_submission_marks();

-- ---- Student announcement dismissal (no direct UPDATE granted to students).
create or replace function public.dismiss_announcement(p_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_student uuid;
begin
  v_student := public.current_student_id();
  if v_student is null then raise exception 'not a student'; end if;
  update public.announcements
     set dismissed_by = (select array(select distinct e from unnest(dismissed_by || v_student) e))
   where id = p_id;
end; $$;
