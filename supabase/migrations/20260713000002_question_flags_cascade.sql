-- ============================================================================
-- BUG 1 — deleting a test (or question/submission) that has a flag fails with
-- "question_flags_*_fkey violates foreign key constraint".
--
-- Root cause is NOT a missing ON DELETE action: test_id/question_id/submission_id
-- were declared ON DELETE SET NULL. The problem is the tg_question_flags_guard
-- BEFORE UPDATE trigger, which pins those columns (new.test_id := old.test_id …)
-- to protect a student's flag from admin tampering. When Postgres deletes a
-- parent it issues the referential SET NULL as an UPDATE, the guard immediately
-- re-pins the column back to the (now being-deleted) parent id, and the FK check
-- then fails.
--
-- Fix: switch these three FKs to ON DELETE CASCADE. Deleting the parent then
-- issues a DELETE of the flag row (a DELETE never fires the BEFORE UPDATE guard),
-- which resolves the violation. A flag has no meaning without its parent context,
-- so cascading the delete is the right semantics.
--
-- NOTE: this supersedes the "snapshot the prompt so a flag survives deletion via
-- SET NULL" intent noted in 20260712000001_question_flags.sql — with CASCADE the
-- flag is removed with its parent rather than preserved. student_id was already
-- ON DELETE CASCADE and is left unchanged.
-- ============================================================================

alter table public.question_flags
  drop constraint question_flags_test_id_fkey,
  add  constraint question_flags_test_id_fkey
    foreign key (test_id) references public.tests(id) on delete cascade;

alter table public.question_flags
  drop constraint question_flags_question_id_fkey,
  add  constraint question_flags_question_id_fkey
    foreign key (question_id) references public.questions(id) on delete cascade;

alter table public.question_flags
  drop constraint question_flags_submission_id_fkey,
  add  constraint question_flags_submission_id_fkey
    foreign key (submission_id) references public.submissions(id) on delete cascade;
