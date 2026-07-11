"use client";

/**
 * Notification data access — a thin, typed layer over the Supabase client.
 *
 * Notifications live OUTSIDE the big useDatabase() snapshot: they page and
 * stream, so folding them into that cache would re-clone the whole DB on every
 * push. Reads are scoped by RLS (a student only ever sees their own rows; an
 * admin only admin-audience rows). All mutations go through SECURITY DEFINER
 * RPCs that re-check ownership — clients have no direct write grant.
 */
import type { Notification, NotificationAudience } from "@/types";
import { supabase } from "@/lib/supabase";

export const NOTIF_PAGE_SIZE = 20;

type Row = Record<string, unknown>;

export function mapNotification(r: Row): Notification {
  return {
    id: r.id as string,
    audience: r.audience as NotificationAudience,
    recipientStudentId: (r.recipient_student_id as string) ?? null,
    cohortId: (r.cohort_id as string) ?? null,
    subjectId: (r.subject_id as string) ?? null,
    title: r.title as string,
    message: r.message as string,
    type: r.type as Notification["type"],
    actionUrl: (r.action_url as string) ?? null,
    relatedTestId: (r.related_test_id as string) ?? null,
    relatedNoteId: (r.related_note_id as string) ?? null,
    relatedSubmissionId: (r.related_submission_id as string) ?? null,
    metadata: (r.metadata as Record<string, unknown>) ?? {},
    isRead: (r.is_read as boolean) ?? false,
    readAt: (r.read_at as string) ?? null,
    createdAt: r.created_at as string,
    expiresAt: (r.expires_at as string) ?? null,
  };
}

/**
 * One page of notifications, newest first. Keyset-paginated on created_at:
 * pass the oldest `createdAt` you already hold as `before` to get the next page.
 * RLS does the recipient filtering, so we never send a user id from the client.
 */
export async function fetchPage(before?: string | null): Promise<Notification[]> {
  let q = supabase()
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(NOTIF_PAGE_SIZE);
  if (before) q = q.lt("created_at", before);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data as Row[]) ?? []).map(mapNotification);
}

/** Exact unread count (head request, no rows transferred). */
export async function fetchUnreadCount(): Promise<number> {
  const { count, error } = await supabase()
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("is_read", false);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function markRead(id: string): Promise<void> {
  const { error } = await supabase().rpc("notif_mark_read", { p_id: id });
  if (error) throw new Error(error.message);
}
export async function markAllRead(): Promise<void> {
  const { error } = await supabase().rpc("notif_mark_all_read");
  if (error) throw new Error(error.message);
}
export async function remove(id: string): Promise<void> {
  const { error } = await supabase().rpc("notif_delete", { p_id: id });
  if (error) throw new Error(error.message);
}
export async function clearRead(): Promise<void> {
  const { error } = await supabase().rpc("notif_clear_read");
  if (error) throw new Error(error.message);
}
