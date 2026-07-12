-- ============================================================================
-- Let reusable Question Bank items carry a rubric, so a rubric attached when
-- authoring a bank question survives being imported into a test.
--
-- Mirrors questions.rubric_id. question_bank is admin-only (see the bank_admin
-- RLS policy) so no student-facing exposure — no RLS change needed.
-- ============================================================================

alter table public.question_bank
  add column rubric_id uuid references public.rubrics(id) on delete set null;

create index on public.question_bank(rubric_id);
