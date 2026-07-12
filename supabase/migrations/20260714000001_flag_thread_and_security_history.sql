-- ============================================================================
-- Flag conversations (two-way, live) + exam security history.
--
-- question_flags could only hold ONE student message and ONE admin_reply, so a
-- back-and-forth was impossible. This adds flag_messages: an ordered thread per
-- flag. question_flags stays the thread HEADER (who/which question/reason/status)
-- — no data is duplicated and every existing row is backfilled into the thread.
--
-- Security shape (unchanged model):
--   * A student reads/writes ONLY their own thread; they may never author an
--     'admin' message, edit one, or touch violation history.
--   * Only an admin may reply, and only an admin may update/delete a message.
--   * student_id is carried on the message so RLS and the Realtime channel filter
--     can scope rows without a join (same trick the other tables use).
-- ============================================================================

create table if not exists public.flag_messages (
  id         uuid primary key default gen_random_uuid(),
  flag_id    uuid not null references public.question_flags(id) on delete cascade,
  -- Denormalised from the parent flag: lets RLS + the realtime filter scope by
  -- student without a join. Pinned by the guard trigger below.
  student_id uuid not null references public.students(id) on delete cascade,
  sender     text not null check (sender in ('student','admin')),
  body       varchar(250) not null check (length(btrim(body)) between 1 and 250),
  created_at timestamptz not null default now()
);

create index if not exists flag_messages_flag_idx    on public.flag_messages (flag_id, created_at);
create index if not exists flag_messages_student_idx on public.flag_messages (student_id, created_at desc);

-- ---- Backfill: no history is lost -------------------------------------------
-- The original message becomes the opening student turn; an existing admin_reply
-- becomes the first admin turn (ordered just after it).
insert into public.flag_messages (flag_id, student_id, sender, body, created_at)
select f.id, f.student_id, 'student', f.message, f.created_at
  from public.question_flags f
 where not exists (
   select 1 from public.flag_messages m where m.flag_id = f.id and m.sender = 'student'
 );

insert into public.flag_messages (flag_id, student_id, sender, body, created_at)
select f.id, f.student_id, 'admin', f.admin_reply, f.created_at + interval '1 second'
  from public.question_flags f
 where f.admin_reply is not null
   and btrim(f.admin_reply) <> ''
   and not exists (
     select 1 from public.flag_messages m where m.flag_id = f.id and m.sender = 'admin'
   );

-- ---- New flag => its opening message is created server-side ------------------
-- Keeps the client's addFlag() unchanged: it still inserts one question_flags row
-- and the thread seeds itself, so the two can never disagree.
create or replace function public.tg_question_flags_seed_message()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  insert into public.flag_messages (flag_id, student_id, sender, body, created_at)
  values (new.id, new.student_id, 'student', new.message, new.created_at);
  return new;
end; $$;

drop trigger if exists question_flags_seed_message on public.question_flags;
create trigger question_flags_seed_message after insert on public.question_flags
  for each row execute function public.tg_question_flags_seed_message();

-- ---- Identity guard: a message can never be re-pointed or re-attributed ------
create or replace function public.tg_flag_messages_guard()
returns trigger language plpgsql security invoker set search_path = public, extensions as $$
begin
  new.id         := old.id;
  new.flag_id    := old.flag_id;
  new.student_id := old.student_id;
  new.sender     := old.sender;
  new.created_at := old.created_at;
  return new;
end; $$;

drop trigger if exists flag_messages_guard on public.flag_messages;
create trigger flag_messages_guard before update on public.flag_messages
  for each row execute function public.tg_flag_messages_guard();

-- ---- Notifications complement the live chat (they're not the only channel) ---
-- The opening message is skipped: question_flags' own INSERT trigger already told
-- the admin about the new flag, so this can't double-notify.
create or replace function public.tg_flag_messages_notify()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  v_count    int;
  v_username text;
  v_cohort   uuid;
  v_test     uuid;
  v_title    text;
  v_url      text;
begin
  select count(*) into v_count from public.flag_messages where flag_id = new.flag_id;

  select s.username, s.cohort_id into v_username, v_cohort
    from public.students s where s.id = new.student_id;
  select f.test_id into v_test from public.question_flags f where f.id = new.flag_id;
  select t.title into v_title from public.tests t where t.id = v_test;
  v_url := case when v_test is null then '/dashboard' else '/results/' || v_test::text end;

  if new.sender = 'admin' then
    insert into public.notifications (
      audience, recipient_student_id, cohort_id, title, message, type,
      action_url, related_test_id, metadata)
    values (
      'student', new.student_id, v_cohort,
      'Reply to your flag', new.body, 'flag_reply', v_url, v_test,
      jsonb_build_object('flagId', new.flag_id, 'messageId', new.id));
    return new;
  end if;

  -- Student follow-up (not the opening turn) -> back to the admin queue.
  if v_count > 1 then
    perform public.notify_admins(
      'New message on a flag',
      format('%s replied%s.', coalesce(v_username, 'A student'),
             case when v_title is null then '' else format(' about "%s"', v_title) end),
      'question_flagged', '/admin/flags',
      v_cohort, null, v_test, null, null,
      jsonb_build_object('flagId', new.flag_id, 'messageId', new.id,
                         'studentName', v_username, 'message', new.body),
      null);
  end if;

  return new;
end; $$;

drop trigger if exists flag_messages_notify on public.flag_messages;
create trigger flag_messages_notify after insert on public.flag_messages
  for each row execute function public.tg_flag_messages_notify();

-- ---- RLS -------------------------------------------------------------------
alter table public.flag_messages enable row level security;

drop policy if exists flag_messages_read on public.flag_messages;
create policy flag_messages_read on public.flag_messages for select to authenticated
  using (public.is_admin() or student_id = public.current_student_id());

-- A student may only append to their OWN thread, and only AS a student. Only an
-- admin may author an 'admin' turn — so a student can never forge a teacher reply.
drop policy if exists flag_messages_insert on public.flag_messages;
create policy flag_messages_insert on public.flag_messages for insert to authenticated
  with check (
    (public.is_admin() and sender = 'admin')
    or (
      sender = 'student'
      and student_id = public.current_student_id()
      and exists (
        select 1 from public.question_flags f
         where f.id = flag_id and f.student_id = public.current_student_id()
      )
    )
  );

-- Nobody but an admin may rewrite history (students can't edit teacher replies —
-- or their own words).
drop policy if exists flag_messages_update on public.flag_messages;
create policy flag_messages_update on public.flag_messages for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists flag_messages_delete on public.flag_messages;
create policy flag_messages_delete on public.flag_messages for delete to authenticated
  using (public.is_admin());

-- ---- Realtime ---------------------------------------------------------------
-- flag_messages: drives the live two-way chat.
-- exam_violations: drives the teacher's security report updating as breaches land.
alter table public.flag_messages   replica identity full;
alter table public.exam_violations replica identity full;

do $$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname='supabase_realtime' and schemaname='public' and tablename='flag_messages') then
    execute 'alter publication supabase_realtime add table public.flag_messages';
  end if;
  if not exists (select 1 from pg_publication_tables
                  where pubname='supabase_realtime' and schemaname='public' and tablename='exam_violations') then
    execute 'alter publication supabase_realtime add table public.exam_violations';
  end if;
end $$;

-- ---- Grants (RLS still gates every row) ------------------------------------
grant select, insert on public.flag_messages to authenticated;
grant update, delete on public.flag_messages to authenticated; -- admin-only via RLS

revoke execute on function public.tg_question_flags_seed_message() from public, anon, authenticated;
revoke execute on function public.tg_flag_messages_guard()         from public, anon, authenticated;
revoke execute on function public.tg_flag_messages_notify()        from public, anon, authenticated;
