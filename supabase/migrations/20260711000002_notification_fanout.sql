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
