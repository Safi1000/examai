-- Trigger functions must never be callable as RPC (they only run via triggers,
-- which don't require EXECUTE). Revoking removes the exposed /rest/v1/rpc
-- endpoints flagged by the security advisor. No effect on trigger firing.
revoke execute on function public.tg_tests_notify()         from public, anon, authenticated;
revoke execute on function public.tg_tests_deleted()        from public, anon, authenticated;
revoke execute on function public.tg_note_assignment_ins()  from public, anon, authenticated;
revoke execute on function public.tg_notes_upd()            from public, anon, authenticated;
revoke execute on function public.tg_notes_del()            from public, anon, authenticated;
revoke execute on function public.tg_submissions_notify()   from public, anon, authenticated;
revoke execute on function public.tg_announcements_notify() from public, anon, authenticated;
revoke execute on function public.tg_students_notify()      from public, anon, authenticated;
