-- ============================================================================
-- Practice mode (Feature 2) — a dedicated, ungraded self-assessment pool.
--
-- SECURITY BOUNDARY (the whole point of this table):
--   Graded answer keys live in `question_keys` / `question_bank`, both admin-only
--   (see the bank_admin / keys_admin RLS policies) — a student never reads them,
--   and `answers.correct_index` is exposed only after a submission is released.
--
--   Practice questions are DIFFERENT: they are never used for a graded
--   submission, so their `correct_index` is intentionally student-readable. That
--   lets the client score practice instantly without ever touching — or widening
--   the exposure of — any graded key. This is a SEPARATE table with its own RLS,
--   so the graded pipeline's policies are left completely untouched.
-- ============================================================================

create table public.practice_questions (
  id            uuid primary key default gen_random_uuid(),
  subject       text not null,
  topic         text not null,
  prompt        text not null,
  marks         int  not null default 1 check (marks >= 0),
  options       jsonb not null,               -- array of option strings (MCQ-only for v1)
  correct_index int  not null,                -- intentionally student-readable (ungraded)
  explanation   text,                         -- shown after the student answers
  created_at    timestamptz not null default now()
);

create index on public.practice_questions(subject);

alter table public.practice_questions enable row level security;

-- Any authenticated user may READ practice questions (keys included — ungraded).
create policy practice_read
  on public.practice_questions for select to authenticated using (true);

-- Only an admin may create / edit / delete them.
create policy practice_write
  on public.practice_questions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- New table needs its own grant (the schema-wide grant in the core migration
-- only covered tables that existed then). RLS above still gates every row.
grant select, insert, update, delete on public.practice_questions to authenticated;

-- ---- Starter pool ----------------------------------------------------------
-- A small seed so the feature is demoable the moment this migration is applied.
insert into public.practice_questions (subject, topic, prompt, options, correct_index, explanation) values
  ('Mathematics', 'Algebra', 'Solve for x: 4x - 3 = 17', '["x = 3","x = 4","x = 5","x = 6"]', 2, '4x = 20, so x = 5.'),
  ('Mathematics', 'Algebra', 'Expand (x + 4)(x - 1)', '["x² + 3x - 4","x² - 3x - 4","x² + 5x - 4","x² - 4"]', 0, 'x·x + x·(-1) + 4·x + 4·(-1) = x² + 3x - 4.'),
  ('Mathematics', 'Geometry', 'The interior angles of a triangle sum to:', '["90°","180°","270°","360°"]', 1, 'Every triangle''s interior angles total 180°.'),
  ('Mathematics', 'Number Theory', 'Which of these is a prime number?', '["21","27","29","33"]', 2, '29 has no divisors other than 1 and itself.'),
  ('Physics', 'Forces', 'The SI unit of force is the:', '["Joule","Watt","Newton","Pascal"]', 2, 'Force is measured in newtons (N).'),
  ('Physics', 'Energy', 'Kinetic energy depends on mass and:', '["colour","velocity","temperature","volume"]', 1, 'KE = ½mv² — it depends on mass and velocity.'),
  ('Physics', 'Motion', 'Which quantity is a vector?', '["Speed","Distance","Velocity","Time"]', 2, 'Velocity has both magnitude and direction; the others are scalars.'),
  ('Biology', 'Cells', 'Which organelle is the ''powerhouse'' of the cell?', '["Nucleus","Mitochondrion","Ribosome","Golgi body"]', 1, 'Mitochondria release energy through respiration.'),
  ('Biology', 'Genetics', 'A section of DNA coding for a protein is a:', '["cell","gene","tissue","organ"]', 1, 'A gene is a length of DNA that codes for a protein.'),
  ('Biology', 'Cells', 'Plant cells contain which structure animal cells lack?', '["Cell membrane","Cytoplasm","Cell wall","Nucleus"]', 2, 'Only plant cells have a rigid cellulose cell wall.'),
  ('English', 'Grammar', 'Choose the correct sentence:', '["She don''t like tea.","She doesn''t likes tea.","She doesn''t like tea.","She not like tea."]', 2, 'After doesn''t, the verb stays in its base form: like.'),
  ('English', 'Vocabulary', 'Which word is a synonym of ''rapid''?', '["slow","swift","heavy","calm"]', 1, 'Swift means fast — a synonym of rapid.'),
  ('English', 'Grammar', 'Identify the adverb: ''He ran quickly to school.''', '["ran","quickly","school","He"]', 1, 'Quickly describes how he ran, so it is an adverb.'),
  ('Computer Science', 'Complexity', 'Big-O of binary search on a sorted array is:', '["O(n)","O(log n)","O(n²)","O(1)"]', 1, 'Each step halves the search space → O(log n).'),
  ('Computer Science', 'Complexity', 'Which sort has worst-case O(n²)?', '["Merge sort","Bubble sort","Heap sort","Counting sort"]', 1, 'Bubble sort compares every pair in the worst case → O(n²).');
