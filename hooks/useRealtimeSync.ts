"use client";

/**
 * Keeps the store's submissions and question-flags caches live via Supabase
 * Realtime, so the admin submissions/roster/flags views and the student dashboard
 * react to submits, status changes, (scheduled or manual) result releases and
 * admin flag replies without a manual refresh.
 *
 * It patches only the affected row — on each change it re-fetches that single
 * submission (with answers) or flag through the store's cache-only
 * `refreshSubmission` / `refreshFlag`, which never write back, so there's no
 * feedback loop. One channel per signed-in identity; torn down on unmount to
 * avoid duplicate subscriptions / leaks.
 *
 * RLS still scopes every streamed row: admins see all rows, a student only their
 * own (we also add a server-side filter so the student channels are narrow).
 */
import { useEffect } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { getStore } from "@/lib/data/store";

export function useRealtimeSync() {
  const { session } = useAuth();
  const role = session?.role ?? null;
  const studentId = session?.studentId ?? null;
  const key = session ? `${role}:${studentId ?? ""}` : null;

  useEffect(() => {
    if (!session) return;
    if (role === "student" && !studentId) return;

    const filter = role === "student" ? `student_id=eq.${studentId}` : undefined;

    const rowId = (payload: RealtimePostgresChangesPayload<{ id?: string }>) =>
      (payload.new as { id?: string })?.id ?? (payload.old as { id?: string })?.id;

    const channel = supabase()
      .channel(`sync:${key}`)
      // Tests carry no student_id, so the student filter must NOT be applied here —
      // RLS already scopes which tests a student can see. Without this channel a
      // client kept a test that had been deleted server-side, which is what made
      // flags and violations fail on their test_id foreign key.
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tests" },
        (payload: RealtimePostgresChangesPayload<{ id?: string }>) => {
          const id = rowId(payload);
          if (id) void getStore().refreshTest(id);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "submissions", ...(filter ? { filter } : {}) },
        (payload: RealtimePostgresChangesPayload<{ id?: string }>) => {
          const id = rowId(payload);
          if (id) void getStore().refreshSubmission(id);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "question_flags", ...(filter ? { filter } : {}) },
        (payload: RealtimePostgresChangesPayload<{ id?: string }>) => {
          const id = rowId(payload);
          if (id) void getStore().refreshFlag(id);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "exam_locks", ...(filter ? { filter } : {}) },
        (payload: RealtimePostgresChangesPayload<{ id?: string }>) => {
          const id = rowId(payload);
          if (id) void getStore().refreshExamLock(id);
        },
      )
      // Two-way flag chat: a teacher reply lands in the student's open panel and a
      // student follow-up lands in the admin queue — no polling, no refresh.
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "flag_messages", ...(filter ? { filter } : {}) },
        (payload: RealtimePostgresChangesPayload<{ id?: string }>) => {
          const id = rowId(payload);
          if (id) void getStore().refreshFlagMessage(id);
        },
      )
      // Live security history: new breaches appear in the teacher's report at once.
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "exam_violations", ...(filter ? { filter } : {}) },
        (payload: RealtimePostgresChangesPayload<{ id?: string }>) => {
          const id = rowId(payload);
          if (id) void getStore().refreshViolation(id);
        },
      )
      .subscribe();

    return () => {
      void supabase().removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
