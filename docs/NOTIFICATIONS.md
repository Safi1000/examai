# Notification System & Auto Result Release

In-app notifications for both dashboards + server-side scheduled result release.
All notification **creation is server-side** (Postgres triggers + pg_cron); the
client only reads its own rows (RLS) and marks-read/deletes via RPCs. This is
what makes "never rely on client-side filtering" literally true.

## What was added

**Database** (`supabase/migrations/`, apply in order):
- `20260711000001_notifications.sql` — `notifications` table, indexes, RLS
  (read-only for clients), self-scoped mutation RPCs (`notif_mark_read`,
  `notif_mark_all_read`, `notif_delete`, `notif_clear_read`), realtime
  publication, and `tests.class_id/subject_id/release_at` columns.
- `20260711000002_notification_fanout.sql` — set-based fan-out functions
  (`notify_students`, `notify_admins`, `notify_note`) + event triggers on
  `tests`, `notes`, `note_assignments`, `submissions`, `announcements`, `students`.
- `20260711000003_scheduler.sql` — `pg_cron` job (`examia-notif`, every minute)
  running reminders, test open/close events, and auto result release, with a
  `notification_log` audit table.

**App**:
- `types/index.ts` — `Notification`, `NotificationType`, `Test.releaseAt`.
- `lib/notifications/service.ts` — typed Supabase access (paging, unread count, RPCs).
- `hooks/useNotifications.ts` — live inbox: first page + unread count, Supabase
  Realtime subscription (recipient-filtered), keyset pagination, optimistic actions.
- `components/notifications/` — `NotificationBell` (in both headers),
  `NotificationPanel` (filters/search/groups/infinite-scroll/skeleton/empty/error),
  `NotificationItem`, `meta.tsx` (type → icon/tone/CTA).
- `lib/data/store.ts` — persists/loads `release_at`.
- Admin `tests/[id]` — "Release results at" date/time + timezone + validation.
- Student `results/[id]` + `components/student/ResultPending.tsx` — pending card
  with live countdown; `TestCard` shows the scheduled release date.

## Applying to the `examiatechxserve` project

1. **Enable `pg_cron`**: Supabase Dashboard → Database → Extensions → enable
   `pg_cron` (or the migration's `create extension if not exists pg_cron;` runs it
   if your role is allowed).
2. **Run the three migrations in order** — SQL editor (paste each file) or
   `supabase db push` from a linked checkout. They are safe to re-run (guards on
   triggers and the realtime publication).
3. **Realtime**: the publication line adds `notifications` to `supabase_realtime`.
   Confirm Realtime is on for the project (Dashboard → Database → Replication).

## Verifying (maps to the acceptance criteria)

- **Bell in both dashboards / persistence**: log in as a student and as the admin
  → bell shows in each header; rows persist across refresh (they live in Postgres).
- **Cohort scoping (security)**: publish a non-draft test for cohort BSCS-6A →
  only 6A students get a `notifications` row. Verify with two student logins and a
  direct `select count(*) from notifications where related_test_id = …` per cohort;
  6B/other cohorts get 0. RLS blocks cross-student reads.
- **Admin on submit**: submit a test as a student → an `audience='admin'` row
  appears with a *Review Submission* CTA.
- **Notes**: add a note assignment for a cohort → only matching students notified.
- **Reminders / open / close**: set a test's `opens_at`/`closes_at` a few minutes
  out; within a minute the cron job emits the bucket reminders and started/closed
  events. Inspect `select * from notification_log order by run_at desc`.
- **Auto release (no browser open)**: set `release_at` a minute ahead on a test
  with `submitted` submissions. With everyone logged out, cron flips them to
  `released` and the submissions trigger fires `result_released`. Manual release
  (`Release`/`Bulk release` in admin) still works and notifies the same way.
- **Realtime**: with a student logged in, insert any matching notification → the
  badge increments and the row appears with no refresh.
- **Idempotency**: `select public.run_notification_scheduler();` twice → no
  duplicate rows (dedup_key unique index).

## Notes / limits

- The app hydrates its main data cache once per session (`store.load()`). When a
  scheduled release lands while a student sits on the pending results page, the
  countdown's expiry triggers a `store.load()` to pull the released result through;
  otherwise a manual refresh shows it. The *notification* itself always arrives
  live via Realtime.
- Auto-release flips every still-`submitted` submission for the due test. If you
  need "only fully-graded" submissions, tighten the `where` in `run_auto_release()`.
- Admin notifications are a single shared `audience='admin'` stream (all admin
  sessions see the same inbox), matching the single-admin model.
