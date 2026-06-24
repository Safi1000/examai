-- Enable RLS everywhere.
alter table public.cohorts        enable row level security;
alter table public.students       enable row level security;
alter table public.tests          enable row level security;
alter table public.questions      enable row level security;
alter table public.question_keys  enable row level security;
alter table public.submissions    enable row level security;
alter table public.answers        enable row level security;
alter table public.announcements  enable row level security;
alter table public.question_bank  enable row level security;

-- COHORTS: any authenticated user may read; only admin writes.
create policy cohorts_read   on public.cohorts for select to authenticated using (true);
create policy cohorts_write  on public.cohorts for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- STUDENTS: admin sees all; a student sees only their own row. Admin writes.
create policy students_read  on public.students for select to authenticated using (public.is_admin() or user_id = auth.uid());
create policy students_write on public.students for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- TESTS: admin sees all; students see non-draft tests for their cohort or open-to-all.
create policy tests_read  on public.tests for select to authenticated
  using (public.is_admin() or (status <> 'draft' and (cohort_id is null or cohort_id = public.current_student_cohort())));
create policy tests_write on public.tests for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- QUESTIONS: visible if the parent test is visible. No key column here.
create policy questions_read on public.questions for select to authenticated
  using (
    public.is_admin() or exists (
      select 1 from public.tests t
      where t.id = questions.test_id and t.status <> 'draft'
        and (t.cohort_id is null or t.cohort_id = public.current_student_cohort())
    )
  );
create policy questions_write on public.questions for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- QUESTION KEYS: admin only (the grading trigger reads them via SECURITY DEFINER).
create policy keys_admin on public.question_keys for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- SUBMISSIONS: admin all; student reads/creates only their own.
create policy subs_read   on public.submissions for select to authenticated using (public.is_admin() or student_id = public.current_student_id());
create policy subs_insert on public.submissions for insert to authenticated with check (public.is_admin() or student_id = public.current_student_id());
create policy subs_update on public.submissions for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy subs_delete on public.submissions for delete to authenticated using (public.is_admin());

-- ANSWERS: admin all; student reads own answers ONLY once the submission is
-- released (this is what keeps correct_index hidden during/after the test until
-- the teacher releases). Student may insert answers into their own submission.
create policy ans_read on public.answers for select to authenticated
  using (
    public.is_admin() or exists (
      select 1 from public.submissions s
      where s.id = answers.submission_id and s.student_id = public.current_student_id() and s.status = 'released'
    )
  );
create policy ans_insert on public.answers for insert to authenticated
  with check (
    public.is_admin() or exists (
      select 1 from public.submissions s
      where s.id = submission_id and s.student_id = public.current_student_id()
    )
  );
create policy ans_update on public.answers for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy ans_delete on public.answers for delete to authenticated using (public.is_admin());

-- ANNOUNCEMENTS: admin all; students see cohort-scoped or global. Dismissal via RPC.
create policy ann_read  on public.announcements for select to authenticated using (public.is_admin() or cohort_id is null or cohort_id = public.current_student_cohort());
create policy ann_write on public.announcements for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- QUESTION BANK: admin only.
create policy bank_admin on public.question_bank for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Grants (RLS still gates every row). Authenticated only; anon needs nothing.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on function public.dismiss_announcement(uuid) to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.current_student_id() to authenticated;
grant execute on function public.current_student_cohort() to authenticated;
