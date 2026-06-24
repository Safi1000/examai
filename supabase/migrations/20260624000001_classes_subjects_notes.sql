-- ============================================================================
-- Classes, Subjects, Notes, and Note Assignments
-- ============================================================================

-- Global class catalogue (IGCSE/O-Levels, A-Levels AS, A-Levels A2, + custom)
create table public.classes (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  created_at timestamptz not null default now()
);

-- Global subject catalogue (Business Studies, Economics, Accounting, + custom)
create table public.subjects (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  created_at timestamptz not null default now()
);

-- Cohort ↔ Class membership (a cohort teaches these classes)
create table public.cohort_classes (
  cohort_id uuid not null references public.cohorts(id) on delete cascade,
  class_id  uuid not null references public.classes(id) on delete cascade,
  primary key (cohort_id, class_id)
);

-- Cohort ↔ Subject membership
create table public.cohort_subjects (
  cohort_id  uuid not null references public.cohorts(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  primary key (cohort_id, subject_id)
);

-- Student ↔ Class enrolment
create table public.student_classes (
  student_id uuid not null references public.students(id) on delete cascade,
  class_id   uuid not null references public.classes(id) on delete cascade,
  primary key (student_id, class_id)
);

-- Student ↔ Subject enrolment
create table public.student_subjects (
  student_id uuid not null references public.students(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  primary key (student_id, subject_id)
);

-- Uploaded notes (Cloudinary raw asset metadata)
create table public.notes (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  file_url   text not null,
  file_type  text not null,
  file_name  text not null,
  created_at timestamptz not null default now()
);

-- Note assignment rules: cohort required, class + subject optional
-- Access: student must be in the cohort AND (if class set) enrolled in class
-- AND (if subject set) enrolled in subject.
create table public.note_assignments (
  id         uuid primary key default gen_random_uuid(),
  note_id    uuid not null references public.notes(id) on delete cascade,
  cohort_id  uuid not null references public.cohorts(id) on delete cascade,
  class_id   uuid references public.classes(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Indexes
create index on public.cohort_classes(cohort_id);
create index on public.cohort_subjects(cohort_id);
create index on public.student_classes(student_id);
create index on public.student_subjects(student_id);
create index on public.note_assignments(note_id);
create index on public.note_assignments(cohort_id);

-- ---- Seed: predefined classes and subjects ---------------------------------
insert into public.classes (name) values
  ('IGCSE/O-Levels'),
  ('A-Levels (AS)'),
  ('A-Levels (A2)');

insert into public.subjects (name) values
  ('Business Studies'),
  ('Economics'),
  ('Accounting');

-- ============================================================================
-- RLS
-- ============================================================================
alter table public.classes          enable row level security;
alter table public.subjects         enable row level security;
alter table public.cohort_classes   enable row level security;
alter table public.cohort_subjects  enable row level security;
alter table public.student_classes  enable row level security;
alter table public.student_subjects enable row level security;
alter table public.notes            enable row level security;
alter table public.note_assignments enable row level security;

-- Classes & subjects: any authenticated user may read; only admin writes.
create policy classes_read  on public.classes  for select to authenticated using (true);
create policy classes_write on public.classes  for all    to authenticated using (public.is_admin()) with check (public.is_admin());

create policy subjects_read  on public.subjects for select to authenticated using (true);
create policy subjects_write on public.subjects for all   to authenticated using (public.is_admin()) with check (public.is_admin());

-- Cohort junction tables: any authenticated user may read; admin writes.
create policy cc_read  on public.cohort_classes  for select to authenticated using (true);
create policy cc_write on public.cohort_classes  for all   to authenticated using (public.is_admin()) with check (public.is_admin());

create policy cs_read  on public.cohort_subjects for select to authenticated using (true);
create policy cs_write on public.cohort_subjects for all   to authenticated using (public.is_admin()) with check (public.is_admin());

-- Student junction tables: admin sees all; student sees own rows only.
create policy sc_read   on public.student_classes  for select to authenticated
  using (public.is_admin() or student_id = public.current_student_id());
create policy sc_write  on public.student_classes  for all   to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy ss_read   on public.student_subjects for select to authenticated
  using (public.is_admin() or student_id = public.current_student_id());
create policy ss_write  on public.student_subjects for all   to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---- Note access helper ----------------------------------------------------
create or replace function public.student_can_access_note_assignment(
  p_cohort_id  uuid,
  p_class_id   uuid,
  p_subject_id uuid
) returns boolean language sql stable security definer set search_path = public, extensions as $$
  select
    public.current_student_cohort() = p_cohort_id
    and (p_class_id is null or exists (
      select 1 from public.student_classes sc
      where sc.student_id = public.current_student_id() and sc.class_id = p_class_id
    ))
    and (p_subject_id is null or exists (
      select 1 from public.student_subjects ss
      where ss.student_id = public.current_student_id() and ss.subject_id = p_subject_id
    ));
$$;

-- Notes: admin all; student sees notes they have at least one valid assignment for.
create policy notes_read  on public.notes for select to authenticated
  using (
    public.is_admin() or
    id in (
      select na.note_id from public.note_assignments na
      where public.student_can_access_note_assignment(na.cohort_id, na.class_id, na.subject_id)
    )
  );
create policy notes_write on public.notes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Note assignments: admin all; student sees assignments they can satisfy.
create policy na_read  on public.note_assignments for select to authenticated
  using (
    public.is_admin() or
    public.student_can_access_note_assignment(cohort_id, class_id, subject_id)
  );
create policy na_write on public.note_assignments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Grants
grant select, insert, update, delete on public.classes          to authenticated;
grant select, insert, update, delete on public.subjects         to authenticated;
grant select, insert, update, delete on public.cohort_classes   to authenticated;
grant select, insert, update, delete on public.cohort_subjects  to authenticated;
grant select, insert, update, delete on public.student_classes  to authenticated;
grant select, insert, update, delete on public.student_subjects to authenticated;
grant select, insert, update, delete on public.notes            to authenticated;
grant select, insert, update, delete on public.note_assignments to authenticated;
grant execute on function public.student_can_access_note_assignment(uuid, uuid, uuid) to authenticated;
